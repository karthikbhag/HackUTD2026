const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const filename = path.resolve(__dirname, '../src/lib/map/shared-dashboard.ts');
const loaded = new Module(filename, module);
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { sharedDashboardSnapshot } = loaded.exports;

test('joins subscribed recipient/reply snapshots without conflating runs or phases', () => {
  const info = { id: 1, runId: 4n, minute: 30, canReset: false };
  const snapshot = sharedDashboardSnapshot(info, [
    { id: 'before', runId: 4n, areaId: 8n, phase: 'before', sentAt: -120, message: 'before' },
    { id: 'after', runId: 4n, areaId: 8n, phase: 'after', sentAt: 0, message: 'after' },
    { id: 'old', runId: 3n, areaId: 9n, phase: 'before', sentAt: -120, message: 'old' },
  ], [
    { noticeId: 'before', householdId: 9007199254740993n, status: 'safe' },
    { noticeId: 'after', householdId: 2n, status: 'unknown' },
    { noticeId: 'old', householdId: 3n, status: 'safe' },
  ], [], []);
  assert.deepEqual(snapshot.state.areas['8'].before.recipients, ['9007199254740993']);
  assert.equal(snapshot.state.areas['8'].before.replies['9007199254740993'], 'safe');
  assert.deepEqual(snapshot.state.areas['8'].after.replies, {});
  assert.equal(snapshot.state.areas['9'], undefined);
  assert.equal(snapshot.state.minute, 30); assert.equal(snapshot.runId, 4n); assert.equal(snapshot.canReset, false);
});

test('projects real assignment transitions, suppresses cancellation, and clears on revocation', () => {
  const response = { runId: 1n, householdId: 10n, assignmentId: 22n };
  for (const status of ['assigned', 'in_progress', 'completed']) {
    const s = sharedDashboardSnapshot({ runId: 1n, minute: 30, canReset: true }, [], [], [response], [{ id: 22n, teamId: 90n, status }]);
    assert.equal(s.state.assignments['10'], '90'); assert.equal(s.assignmentStatuses['10'], status);
  }
  assert.deepEqual(sharedDashboardSnapshot({ runId: 1n }, [], [], [response], [{ id: 22n, status: 'cancelled' }]).state.assignments, {});
  const empty = sharedDashboardSnapshot(undefined, [], [], [], []);
  assert.equal(empty.ready, false); assert.equal(empty.canReset, false); assert.deepEqual(empty.state.areas, {});
});
