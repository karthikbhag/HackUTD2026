/** Mutating check restricted to a dedicated disposable local Small database. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DbConnection, tables } from '../../frontend/src/module_bindings';
const uri = process.env.SPACETIMEDB_URI ?? 'http://127.0.0.1:3100';
const database = 'riskreach-person3-shared-check';
assert(['localhost', '127.0.0.1'].includes(new URL(uri).hostname));
const execute = promisify(execFile), clients: DbConnection[] = [];
async function call(name: string, ...args: string[]) { await execute('spacetime', ['call', database, name, ...args, '--server', uri, '--no-config']); }
async function authorize(c: DbConnection, enabled: boolean) { await call('set_employee', JSON.stringify(c.identity!.toHexString()), String(enabled)); }
async function connect() {
  return new Promise<DbConnection>((resolve, reject) => {
    DbConnection.builder().withUri(uri).withDatabaseName(database).onConnect(c => { clients.push(c); resolve(c); }).onConnectError((_ctx, e) => reject(e)).build();
  });
}
async function subscribe(c: DbConnection, query?: string) {
  await new Promise<void>((resolve, reject) => {
    const b = c.subscriptionBuilder().onApplied(() => resolve()).onError(ctx => reject(ctx.event));
    if (query) b.subscribe(query);
    else b.subscribe([tables.disasters, tables.zones, tables.households, tables.requests, tables.teams, tables.assignments, tables.tasks,
      tables.decisions, tables.scenarioInfo, tables.exercises, tables.activities]);
  });
}
async function until(check: () => boolean, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (!check()) { assert(Date.now() < deadline, 'Shared state did not synchronize'); await new Promise(r => setTimeout(r, 25)); }
}
const watchdog = setTimeout(() => { console.error('Shared workflow verifier timed out'); process.exit(1); }, 120000);
try {
  const a = await connect(), b = await connect(), outsider = await connect();
  await authorize(a, true); await authorize(b, true);
  await Promise.all([subscribe(a), subscribe(b), subscribe(outsider)]);
  assert.equal(a.db.households.count(), 60n); assert.equal(a.db.decisions.count(), 60n); assert.equal(outsider.db.decisions.count(), 0n);
  const homes = new Map([...a.db.households.iter()].map(h => [h.id, h]));
  const selected = [...a.db.decisions.iter()].find(r => r.layerIds.length > 0 && !homes.get(r.householdId)!.isCustomer)!; assert(selected);
  const householdId = selected.householdId, home = homes.get(householdId)!;
  const disasterId = [...a.db.zones.iter()].find(z => z.id === home.zoneId)!.disasterId;
  await Promise.all([a, b, outsider].flatMap(c => [subscribe(c, `SELECT * FROM household_decisions(${householdId})`), subscribe(c, `SELECT * FROM exercise_replies(${disasterId})`)]));
  const detail = (c: DbConnection) => JSON.parse([...c.db.householdDecisions.iter()].find(r => r.householdId === householdId)!.payload);
  const runId = [...a.db.scenarioInfo.iter()][0].runId, before = { disasterId, expectedRunId: runId, expectedMinute: -120 };
  const suggestion = detail(a).preparation.suggestions[0]; assert(suggestion);
  const approval = { householdId, recommendationId: suggestion.recommendationId, expectedRunId: runId };
  await a.reducers.approvePreparedness(approval);
  await until(() => detail(b).preparation.suppressed.some((s: { recommendationId: string }) => s.recommendationId === suggestion.recommendationId));
  await assert.rejects(b.reducers.approvePreparedness(approval));
  await a.reducers.approveExerciseNotice({ ...before, message: 'Employee-reviewed synthetic preparation check-in' });
  await until(() => [...b.db.exercises.iter()].some(e => e.disasterId === disasterId && e.preSent));
  await b.reducers.recordExerciseReply({ ...before, householdId, status: 'safe' });
  await until(() => [...a.db.households.iter()].find(h => h.id === householdId)?.checkInStatus === 'safe');
  await a.reducers.advanceExerciseClock(before);
  await assert.rejects(b.reducers.advanceExerciseClock(before));
  const after = { ...before, expectedMinute: 0 };
  await b.reducers.approveExerciseNotice({ ...after, message: 'Fresh synthetic post-impact safety check-in' });
  await until(() => [...a.db.exerciseReplies.iter()].some(r => r.householdId === householdId && r.phase === 'after'));
  assert([...a.db.exerciseReplies.iter()].some(r => r.householdId === householdId && r.phase === 'before' && r.status === 'safe'));
  assert.equal([...a.db.households.iter()].find(h => h.id === householdId)!.checkInStatus, 'unknown');
  await a.reducers.advanceExerciseClock(after);
  await until(() => detail(b).concerns.some((r: { code: string }) => r.code === 'post_impact_reply_overdue'));
  assert.equal(detail(b).overlooked, true);
  const reply = [...b.db.exerciseReplies.iter()].find(r => r.householdId === householdId && r.phase === 'after')!;
  assert(reply.requestId !== undefined); const requestId = reply.requestId;
  await Promise.all([subscribe(a, `SELECT * FROM team_recommendations(${requestId})`), subscribe(b, `SELECT * FROM team_recommendations(${requestId})`)]);
  const candidates = JSON.parse([...a.db.teamRecommendations.iter()].find(r => r.requestId === requestId)!.payload).recommendations;
  assert(candidates.length);
  const race = await Promise.allSettled([a.reducers.assignTeam({ requestId, teamId: BigInt(candidates[0].teamId) }), b.reducers.assignTeam({ requestId, teamId: BigInt(candidates[0].teamId) })]);
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
  await until(() => [...b.db.assignments.iter()].some(r => r.requestId === requestId));
  const assignment = [...b.db.assignments.iter()].find(r => r.requestId === requestId)!;
  await b.reducers.updateAssignment({ assignmentId: assignment.id, status: 'completed' });
  await until(() => [...a.db.requests.iter()].find(r => r.id === requestId)?.status === 'resolved');
  await a.reducers.recordExerciseReply({ ...before, expectedMinute: 30, householdId, status: 'safe' });
  await until(() => !detail(b).concerns.some((r: { code: string }) => r.code === 'post_impact_reply_overdue'));
  assert.equal(outsider.db.householdDecisions.count(), 0n); assert.equal(outsider.db.exerciseReplies.count(), 0n);
  await assert.rejects(outsider.reducers.advanceExerciseClock({ ...before, expectedMinute: 30 }));
  const clock = [...a.db.scenarioInfo.iter()][0].evaluatedAt.microsSinceUnixEpoch;
  console.log('PASS two-client suggestions, separate rounds, employee time skips, overdue welfare review, non-customer assistance and competing dispatch. Waiting for periodic refresh…');
  await until(() => [...a.db.scenarioInfo.iter()][0].evaluatedAt.microsSinceUnixEpoch > clock, 75000);
  await call('reset_demo', JSON.stringify('RESET SYNTHETIC DEMO'));
  await until(() => [...b.db.scenarioInfo.iter()][0].runId === runId + 1n && b.db.exerciseReplies.count() === 0n);
  await assert.rejects(a.reducers.approvePreparedness(approval));
  await authorize(b, false);
  await until(() => b.db.decisions.count() === 0n && b.db.householdDecisions.count() === 0n);
  console.log('PASS scheduled refresh, shared reset/replay, stale approval rejection and live revocation.');
} finally {
  for (const c of clients) { try { await authorize(c, false); } catch { /* Preserve original failure. */ } c.disconnect(); }
  clearTimeout(watchdog);
}
