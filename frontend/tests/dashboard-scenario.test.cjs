const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const filename = path.resolve(__dirname, '../src/lib/map/dashboard-scenario.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = new Module(filename, module);
loaded._compile(compiled, filename);
const { initialDashboardScenario: initial, dashboardScenarioReducer, needsAttention, responseEligible, matchingTeam } = loaded.exports;
const customer = (id, area = 'a', needs = []) => ({ id, zoneId: area, isCustomer: true, checkIn: 'unknown', needs });
const data = { zones: [{ id: 'a' }, { id: 'b' }], households: [customer('safe'), customer('silent'), customer('help'), customer('other', 'b'), customer('existing', 'a', ['Welfare check'])], teams: [{ id: 'unit', zoneId: 'a', status: 'available', capacity: 4, capabilities: ['Welfare check'] }, { id: 'wrong', zoneId: 'b', status: 'available', capacity: 4, capabilities: ['Welfare check'] }] };
const reduce = (state, action) => dashboardScenarioReducer(state, action, data);
const send = (areaId = 'a') => ({ type: 'send', areaId, message: 'Please check in' });
const reply = (id, reply) => ({ type: 'reply', id, reply });
const assign = (id, teamId = 'unit') => ({ type: 'assign', id, teamId });
const apply = (...actions) => actions.reduce(reduce, initial);
const impact = { type: 'impact' };
const deadline = { type: 'deadline' };
const completeRescues = { type: 'complete_rescues' };

test('rescue completion frees a unit for another overdue household and retires the completed case', () => {
  const assigned = apply(impact, send(), deadline, assign('silent'));
  const completed = reduce(assigned, completeRescues);
  assert.equal(completed.minute, 60);
  assert.deepEqual(completed.assignments, {});
  assert.deepEqual(completed.completedRescues.silent, { teamId: 'unit', completedAt: 60 });
  assert.equal(needsAttention(completed, data.households[1], 'after'), false);
  assert.equal(responseEligible(completed, data.households[1]), false);
  assert.equal(loaded.exports.dashboardHouseholdStatus(completed, data.households[1], 'after'), 'Assistance completed');
  assert.equal(loaded.exports.householdMapAction(completed, data.households[1], 'after'), undefined);
  assert.equal(reduce(completed, assign('silent')), completed);
  assert.equal(reduce(completed, reply('silent', 'needs_help')), completed);
  assert.equal(matchingTeam(completed, data.households[2], data.teams).id, 'unit');
  const reused = reduce(completed, assign('help'));
  assert.equal(reused.assignments.help, 'unit');
  assert.equal(completed.completedRescues.help, undefined);
  assert.equal(assigned.assignments.silent, 'unit', 'completion does not mutate previous state');
  assert.equal(data.teams[0].status, 'available', 'fixture data stays unchanged');
});

test('released units automatically serve waiting help requests without approving silent households', () => {
  const busy = apply(impact, send(), reply('help', 'needs_help'), reply('silent', 'needs_help'));
  const completed = reduce(busy, completeRescues);
  assert.equal(completed.minute, 30);
  assert.deepEqual(completed.assignments, { silent: 'unit' });
  assert.deepEqual(completed.completedRescues, { help: { teamId: 'unit', completedAt: 30 } });
  assert.equal(completed.assignments.existing, undefined, 'unanswered cases still need approval');
  const again = reduce(completed, completeRescues);
  assert.equal(again.minute, 60);
  assert.deepEqual(again.assignments, {});
  assert.deepEqual(again.completedRescues.silent, { teamId: 'unit', completedAt: 60 });
  assert.equal(completed.completedRescues.silent, undefined, 'completion history is immutable');
  assert.equal(reduce(again, completeRescues), again, 'no active rescue means no completion skip');
  assert.deepEqual(reduce(again, { type: 'reset' }), initial);
});

test('completion cannot skip before impact or without an assigned rescue', () => {
  assert.equal(reduce(initial, completeRescues), initial);
  const impacted = reduce(initial, impact);
  assert.equal(reduce(impacted, completeRescues), impacted);
});

test('safe preparation replies leave the queue and second notification; silence carries forward', () => {
  const state = apply(send(), reply('safe', 'safe'), impact, send());
  assert.equal(needsAttention(state, data.households[0], 'after'), false);
  assert.equal(needsAttention(state, data.households[1], 'after'), true);
  assert.equal(state.areas.a.after.recipients.includes('safe'), false);
  assert.equal(state.areas.a.after.recipients.includes('silent'), true);
  assert.equal(state.areas.a.before.replies.safe, 'safe');
});
test('only recipients can reply and pre-impact help is rejected', () => {
  const state = apply(send());
  assert.equal(reduce(state, reply('help', 'needs_help')), state);
  assert.equal(reduce(state, reply('other', 'safe')), state);
  assert.equal(reduce(state, send()), state);
});
test('impact advances all areas even without preparation outreach', () => {
  const state = reduce(initial, impact);
  assert.equal(state.minute, 0);
  assert.deepEqual(state.areas, {});
  assert.equal(reduce(state, impact), state);
  const { householdMapAction } = loaded.exports;
  for (const row of data.households.filter(row => row.isCustomer)) {
    assert.equal(needsAttention(state, row, 'after'), true);
    assert.equal(householdMapAction(state, row, 'after').label,
      row.needs.length ? 'Assistance or welfare check needed' : 'Follow-up notification needed');
  }
  const sent = reduce(state, send('b'));
  assert.equal(sent.areas.b.before, undefined);
  assert.ok(sent.areas.b.after.recipients.includes('other'));
});
test('help automatically reserves a unit; silent households require approval after the deadline', () => {
  const state = apply(send(), impact, send(), reply('help', 'needs_help'));
  assert.equal(state.assignments.help, 'unit');
  assert.equal(responseEligible(state, data.households[2]), false);
  assert.equal(reduce(state, reply('help', 'needs_help')), state);
  assert.equal(responseEligible(state, data.households[1]), false);
  assert.equal(responseEligible(reduce(state, deadline), data.households[1]), true);
  assert.equal(responseEligible(reduce(state, deadline), data.households[3]), false);
});
test('automatic help dispatch does not reuse a busy unit or drop an unmatched help request', () => {
  const state = apply(impact, send(), reply('help', 'needs_help'), reply('silent', 'needs_help'));
  assert.deepEqual(state.assignments, { help: 'unit' });
  assert.equal(state.areas.a.after.replies.silent, 'needs_help');
  assert.equal(householdMapAction(state, data.households[1], 'after').kind, 'response');
  const overdue = reduce(state, deadline);
  assert.equal(reduce(overdue, assign('silent')), overdue);
  const unavailable = { ...data, teams: [{ ...data.teams[0], capacity: 0 }, data.teams[1]] };
  const requested = dashboardScenarioReducer(apply(impact, send()), reply('help', 'needs_help'), unavailable);
  assert.deepEqual(requested.assignments, {});
  assert.equal(requested.areas.a.after.replies.help, 'needs_help');
});
test('manual approval requires an unanswered follow-up deadline even with a recorded need', () => {
  const pending = apply(impact, send());
  assert.equal(reduce(pending, assign('existing')), pending);
  const overdue = reduce(pending, deadline);
  assert.equal(reduce(overdue, assign('existing')).assignments.existing, 'unit');
});
test('later area notifications receive their own complete response window', () => {
  const state = apply(send(), impact, send(), deadline, send('b'));
  assert.equal(state.areas.b.after.sentAt, 30);
  assert.equal(responseEligible(state, data.households[3]), false);
  assert.equal(responseEligible(reduce(state, deadline), data.households[3]), true);
});
test('safe preparation replies block dispatch even with an older recorded welfare-check need', () => {
  const state = apply(send(), reply('existing', 'safe'), impact, send(), reply('silent', 'safe'), deadline);
  assert.equal(needsAttention(state, data.households[1], 'after'), false);
  assert.equal(responseEligible(state, data.households[1]), false);
  assert.equal(state.areas.a.after.recipients.includes('existing'), false);
  assert.equal(needsAttention(state, data.households[4], 'after'), false);
  assert.equal(responseEligible(state, data.households[4]), false);
  assert.equal(reduce(state, assign('existing')), state);
  assert.deepEqual(data.households[4].needs, ['Welfare check']);
});
test('a safe post-impact reply removes older needs from dispatch before and after the deadline', () => {
  const pending = apply(send(), impact, send());
  assert.equal(responseEligible(pending, data.households[4]), true);
  for (const state of [pending, reduce(pending, deadline)]) {
    const safe = reduce(state, reply('existing', 'safe'));
    assert.equal(needsAttention(safe, data.households[4], 'after'), false);
    assert.equal(responseEligible(safe, data.households[4]), false);
    assert.equal(reduce(safe, assign('existing')), safe);
    assert.equal(responseEligible(reduce(safe, deadline), data.households[4]), false);
  }
});
test('safe community records are excluded despite older assistance needs', () => {
  const safeCommunity = { ...data.households[4], isCustomer: false, checkIn: 'safe' };
  const state = apply(send(), impact, send(), deadline);
  assert.equal(needsAttention(state, safeCommunity, 'after'), false);
  assert.equal(responseEligible(state, safeCommunity), false);
  const communityData = { ...data, households: [safeCommunity] };
  assert.equal(dashboardScenarioReducer(state, assign('existing'), communityData), state);
});
test('dispatch validates local capabilities and prevents duplicate assignments and team reuse', () => {
  const state = apply(send(), impact, send(), deadline);
  assert.equal(reduce(state, assign('silent', 'wrong')), state);
  assert.equal(matchingTeam(state, data.households[1], [{ ...data.teams[0], capacity: 0 }]), undefined);
  assert.equal(matchingTeam(state, { ...data.households[1], needs: ['Temporary shelter'] }, data.teams), undefined);
  const assigned = reduce(state, assign('silent'));
  assert.equal(assigned.assignments.silent, 'unit');
  assert.equal(reduce(assigned, assign('silent')), assigned);
  assert.equal(reduce(assigned, assign('help')), assigned);
  assert.equal(reduce(assigned, reply('silent', 'safe')), assigned);
});
test('reset clears all areas, rounds, clock and assignments without mutating source records', () => {
  const state = apply(send(), impact, send(), deadline, assign('silent'));
  assert.deepEqual(reduce(state, { type: 'reset' }), initial);
  assert.equal(data.teams[0].status, 'available');
  assert.equal(data.households[1].checkIn, 'unknown');
});

const { householdMapAction } = loaded.exports;
test('map badges follow notification rounds, responses, and assignment', () => {
  const row = data.households[2];
  assert.equal(householdMapAction(initial, row, 'before').kind, 'notification');
  const prepared = apply(send());
  assert.equal(householdMapAction(prepared, row, 'before'), undefined);
  const impacted = reduce(prepared, impact);
  assert.equal(householdMapAction(impacted, row, 'after').label, 'Follow-up notification needed');
  const contacted = reduce(impacted, send());
  assert.equal(householdMapAction(contacted, row, 'after'), undefined);
  const help = reduce(contacted, reply('help', 'needs_help'));
  assert.equal(help.assignments.help, 'unit');
  assert.equal(householdMapAction(help, row, 'after'), undefined);
  assert.equal(householdMapAction(reduce(contacted, reply('help', 'safe')), row, 'after'), undefined);
  assert.equal(householdMapAction(reduce(contacted, deadline), row, 'after').kind, 'response');
});
test('map badges suppress safe, unexposed, and non-customer outreach', () => {
  assert.equal(householdMapAction(initial, { ...customer('x'), riskLevel: 'None' }, 'before'), undefined);
  assert.equal(householdMapAction(initial, { ...customer('x'), isCustomer: false }, 'before'), undefined);
  assert.equal(householdMapAction(initial, { ...customer('x'), checkIn: 'safe' }, 'after', false), undefined);
});

test('risk outreach follows selected event exposure, excludes None, and freezes respective messages', () => {
  const riskData = {...data, households:[
    {...customer('high','b'),riskLevel:'High',riskByArea:{a:'High'}},
    {...customer('medium'),riskLevel:'Medium',riskByArea:{a:'Medium'}},
    {...customer('low'),riskLevel:'Low',riskByArea:{a:'Low'}},
    {...customer('outside'),riskLevel:'None',riskByArea:{}},
  ]};
  const message=JSON.stringify({format:'risk-messages-v1',messages:{High:'HIGH',Medium:'MEDIUM',Low:'LOW'}});
  const state=dashboardScenarioReducer(initial,{type:'send',areaId:'a',message},riskData);
  assert.deepEqual(state.areas.a.before.recipients,['high','medium','low']);
  assert.deepEqual(state.areas.a.before.recipientMessages,{high:'HIGH',medium:'MEDIUM',low:'LOW'});
  const replied=dashboardScenarioReducer(state,{type:'reply',areaId:'a',id:'high',reply:'safe'},riskData);
  assert.equal(replied.areas.a.before.replies.high,'safe');
  assert.equal(needsAttention(replied,riskData.households[0],'before','a'),false);
  assert.equal(state.areas.a.before.recipientRisk.high,'High');
});

test('scheduled impacts leave later regions in preparation with working check-ins', () => {
  const scheduled = { ...data, zones: [{ id: 'a', impactMinute: 0 }, { id: 'b', impactMinute: 60 }] };
  const advance = (s, a) => dashboardScenarioReducer(s, a, scheduled);
  const first = advance(initial, impact);
  assert.equal(first.minute, 0);
  assert.equal(loaded.exports.areaPhase(first, 'a'), 'after');
  assert.equal(loaded.exports.areaPhase(first, 'b'), 'before');
  const sent = advance(first, send('b'));
  assert.ok(sent.areas.b.before);
  assert.equal(sent.areas.b.after, undefined);
  assert.equal(advance(sent, { type: 'reply', areaId: 'b', id: 'other', reply: 'needs_help' }), sent);
  const safe = advance(sent, { type: 'reply', areaId: 'b', id: 'other', reply: 'safe' });
  assert.equal(safe.areas.b.before.replies.other, 'safe');
  assert.equal(responseEligible(first, { ...customer('other','b'), needs: ['Welfare check'] }), false);
  const next = advance(safe, impact);
  assert.equal(next.minute, 60);
  assert.equal(loaded.exports.areaPhase(next, 'b'), 'after');
  assert.equal(advance(next, impact), next);
  assert.deepEqual(advance(next, { type: 'reset' }), initial);
});

test('phase filters move only due events and scope overlapping map records', () => {
  const mixed = { ...data, zones: [{id:'a',impactMinute:0},{id:'b',impactMinute:60}],
    households:[{...customer('both'),riskByArea:{a:'High',b:'Low'}}],
    impactLayers:[{id:'ring-a',hotspotId:'a'},{id:'ring-b',hotspotId:'b'}] };
  const prep = loaded.exports.filterPhase(mixed, 0, 'before');
  const response = loaded.exports.filterPhase(mixed, 0, 'after');
  assert.deepEqual(prep.zones.map(z=>z.id), ['b']);
  assert.deepEqual(response.zones.map(z=>z.id), ['a']);
  assert.deepEqual(prep.households[0].riskByArea, {b:'Low'});
  assert.deepEqual(prep.impactLayers.map(l=>l.id), ['ring-b']);
  assert.deepEqual(prep.teams.map(t=>t.id), ['wrong']);
  assert.deepEqual(mixed.households[0].riskByArea, {a:'High',b:'Low'});
  assert.equal(loaded.exports.filterPhase(mixed, 60, 'before').zones.length, 0);
});

test('one map routes pending and impacted households to their respective notification phases', () => {
  const state = { ...initial, minute: 0, impactMinutes: {a:0,b:60} };
  const pending = customer('other','b');
  const impacted = customer('silent','a');
  const phaseOf = row => loaded.exports.areaPhase(state, loaded.exports.activeAreaIdFor(state,row));
  assert.equal(phaseOf(pending), 'before');
  assert.equal(phaseOf(impacted), 'after');
  assert.equal(householdMapAction(state,pending,phaseOf(pending)).label, 'Preparedness notification needed');
  assert.equal(householdMapAction(state,impacted,phaseOf(impacted)).label, 'Follow-up notification needed');
  const prepared = dashboardScenarioReducer(state,send('b'),data);
  const followedUp = dashboardScenarioReducer(prepared,send('a'),data);
  assert.ok(followedUp.areas.b.before);
  assert.ok(followedUp.areas.a.after);
});

test('overlapping households retain pending event attention after another event confirms safety', () => {
  const row = {...customer('overlap','a'),riskByArea:{a:'High',b:'Low'}};
  const state = {...initial,minute:0,impactMinutes:{a:0,b:60},areas:{a:{after:{recipients:['overlap'],sentAt:0,message:'check',replies:{overlap:'safe'}}}}};
  const selected = loaded.exports.activeAreaIdFor(state,row);
  assert.equal(selected,'b');
  assert.equal(loaded.exports.areaPhase(state,selected),'before');
  assert.equal(needsAttention(state,row,'before',selected),true);
  assert.equal(householdMapAction(state,row,'before',true,selected).kind,'notification');
});
