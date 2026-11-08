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

test('safe preparation replies leave the queue and second notification; silence carries forward', () => {
  const state = apply(send(), reply('safe', 'safe'), impact, send());
  assert.equal(needsAttention(state, data.households[0], 'after'), false);
  assert.equal(needsAttention(state, data.households[1], 'after'), true);
  assert.equal(state.areas.a.after.recipients.includes('safe'), false);
  assert.equal(state.areas.a.after.recipients.includes('silent'), true);
  assert.equal(state.areas.a.before.replies.safe, 'safe');
});
test('only recipients can reply; pre-impact help is rejected and initial clock requires a notice', () => {
  assert.equal(reduce(initial, impact), initial);
  const state = apply(send());
  assert.equal(reduce(state, reply('help', 'needs_help')), state);
  assert.equal(reduce(state, reply('other', 'safe')), state);
  assert.equal(reduce(state, send()), state);
});
test('help is actionable immediately; silence requires that area’s second-notification deadline', () => {
  const state = apply(send(), impact, send(), reply('help', 'needs_help'));
  assert.equal(responseEligible(state, data.households[2]), true);
  assert.equal(responseEligible(state, data.households[1]), false);
  assert.equal(responseEligible(reduce(state, deadline), data.households[1]), true);
  assert.equal(responseEligible(reduce(state, deadline), data.households[3]), false);
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
