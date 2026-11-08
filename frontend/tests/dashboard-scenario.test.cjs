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
