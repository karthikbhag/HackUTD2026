const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const filename = path.resolve(__dirname, '../src/lib/map/scenario-demo.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const loaded = new Module(filename, module);
loaded._compile(compiled, filename);
const { initialScenarioDemo: initial, scenarioDemoReducer: reduce } = loaded.exports;
const apply = (...actions) => actions.reduce(reduce, initial);
const send = { type: 'send' };
const impact = { type: 'impact' };
const deadline = { type: 'deadline' };
const reply = (id, value) => ({ type: 'reply', id, reply: value });
const assign = (id, teamId) => ({ type: 'assign', id, teamId });

test('post-impact outreach requires a fresh reply while retaining the earlier safe response', () => {
  const before = apply(send, reply('customer-a', 'safe'));
  const after = reduce(reduce(before, impact), send);
  assert.equal(after.before.replies['customer-a'], 'safe');
  assert.deepEqual(after.after.replies, {});
  assert.equal(after.minute, 0);
  assert.equal(before.minute, -120);
});
test('a help request is dispatchable immediately; silence requires the deadline', () => {
  const pending = apply(impact, send);
  assert.equal(reduce(pending, assign('silent', 'unit-1')), pending);
  const helped = reduce(reduce(pending, reply('help', 'needs_help')), assign('help', 'unit-1'));
  assert.equal(helped.minute, 0);
  assert.equal(helped.assignments.help, 'unit-1');
  const overdue = reduce(pending, deadline);
  assert.equal(overdue.minute, 30);
  assert.equal(reduce(overdue, assign('silent', 'unit-2')).assignments.silent, 'unit-2');
});
test('safe responders are excluded from welfare dispatch even after the deadline', () => {
  const state = apply(impact, send, reply('safe', 'safe'), deadline);
  assert.equal(reduce(state, assign('safe', 'unit-1')), state);
});
test('a unit and a household cannot receive duplicate active assignments', () => {
  const state = apply(impact, send, deadline, assign('a', 'unit-1'));
  assert.equal(reduce(state, assign('b', 'unit-1')), state);
  assert.equal(reduce(state, assign('a', 'unit-2')), state);
});
test('cannot record replies or start follow-up before outreach; sending twice preserves replies', () => {
  assert.equal(reduce(initial, reply('a', 'safe')), initial);
  assert.equal(reduce(initial, deadline), initial);
  assert.equal(reduce(initial, assign('a', 'unit-1')), initial);
  const state = apply(send, reply('a', 'safe'));
  assert.equal(reduce(state, send), state);
});
test('reset removes both rounds, assignments, history, and simulated elapsed time', () => {
  const state = apply(send, impact, send, deadline, assign('a', 'unit-1'));
  assert.ok(state.events.length > 0);
  assert.deepEqual(reduce(state, { type: 'reset' }), initial);
  assert.deepEqual(initial.assignments, {});
  assert.deepEqual(initial.events, []);
});
