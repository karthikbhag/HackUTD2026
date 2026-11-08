/** Mutates only an explicitly named disposable loopback verification database. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { DbConnection, tables } from '../../frontend/src/module_bindings';
import { calculateExposure, type ImpactLayer } from '../src/exposure';
import { detectFollowUp } from '../src/follow-up';
import type { DispatchRequest } from '../src/team-recommendations';

const uri = process.env.SPACETIMEDB_URI ?? 'http://127.0.0.1:3123';
const database = process.env.SPACETIMEDB_DATABASE ?? 'riskreach-person3-small-check';
assert(['localhost', '127.0.0.1'].includes(new URL(uri).hostname), 'Verification is loopback only');
assert(/^riskreach-person3-(small|demo|stress)-check$/.test(database), 'Use an explicitly disposable person3 verification database');
const expected = database.includes('-stress-') ? 100000 : database.includes('-demo-') ? 10000 : 60;
const connections: DbConnection[] = [];
const execute = promisify(execFile);
async function call(reducer: string, ...args: string[]) {
  await execute('spacetime', ['call', database, reducer, ...args, '--server', uri, '--no-config']);
}
async function connect() {
  return new Promise<DbConnection>((resolve, reject) => {
    const conn = DbConnection.builder().withUri(uri).withDatabaseName(database)
      .onConnect(c => { connections.push(c); resolve(c); }).onConnectError((_ctx, error) => reject(error)).build();
    setTimeout(() => { if (!conn.isActive) { conn.disconnect(); reject(new Error('Connect timed out')); } }, 15000).unref();
  });
}
async function authorize(conn: DbConnection, enabled: boolean) { await call('set_employee', JSON.stringify(conn.identity!.toHexString()), String(enabled)); }
async function subscribe(conn: DbConnection, query?: string) {
  await new Promise<void>((resolve, reject) => {
    const builder = conn.subscriptionBuilder().onApplied(() => resolve()).onError(ctx => reject(ctx.event));
    if (query) builder.subscribe(query);
    else builder.subscribe([tables.disasters, tables.households, tables.requests, tables.teams, tables.assignments, tables.tasks, tables.activities,
      tables.impactLayers, tables.decisions, tables.scenarioInfo]);
  });
}
async function until(predicate: () => boolean, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) { assert(Date.now() < deadline, 'Timed out waiting for synchronized decision state'); await new Promise(r => setTimeout(r, 30)); }
}
function digestRows(rows: { householdId: bigint; score: number; overlooked: boolean }[]) {
  return createHash('sha256').update(JSON.stringify(rows.sort((a, b) => a.householdId < b.householdId ? -1 : 1)
    .map(r => [r.householdId.toString(), r.score, r.overlooked]))).digest('hex');
}
function payload(conn: DbConnection, householdId: bigint) { const row = [...conn.db.householdDecisions.iter()].find(r => r.householdId === householdId); return row ? JSON.parse(row.payload) : undefined; }
const watchdog = setTimeout(() => { console.error('Live decision verification timed out'); process.exit(1); }, 600000);
try {
  const a = await connect(), b = await connect(), outsider = await connect();
  await authorize(a, true); await authorize(b, true);
  await Promise.all([subscribe(a), subscribe(b), subscribe(outsider)]);
  assert.equal(a.db.households.count(), BigInt(expected)); assert.equal(a.db.decisions.count(), BigInt(expected));
  assert.equal(outsider.db.decisions.count(), 0n); assert.equal(outsider.db.households.count(), 0n);
  const initialInfo = [...a.db.scenarioInfo.iter()][0], runId = initialInfo.runId;
  const baselineHomes = [...a.db.households.iter()].map(h => ({ id: String(h.id), latitude: h.latitude, longitude: h.longitude,
    checkInStatus: h.checkInStatus as 'unknown' | 'safe' | 'needs_help' | 'urgent', vulnerabilityFlags: [...h.vulnerabilityFlags], lastContactAtMicros: h.lastContactAt?.microsSinceUnixEpoch }));
  const baselineRequests = [...a.db.requests.iter()].map(r => ({ id: String(r.id), householdId: String(r.householdId), needType: r.needType, urgency: r.urgency, status: r.status as DispatchRequest['status'] }));
  const baselineExposure = calculateExposure(baselineHomes, [...a.db.impactLayers.iter()].map(l => ({ id: l.id, disaster_id: String(l.disasterId),
    hazard_type: l.hazardType, component: l.component, severity: l.severity, geometry: JSON.parse(l.geometry), data_kind: l.dataKind,
    is_simulated: l.isSimulated, source: l.source, updated_at: l.updatedAt.toDate().toISOString(), label: l.label })) as ImpactLayer[]);
  const openHomes = new Set([...a.db.requests.iter()].filter(r => r.status === 'open').map(r => r.householdId));
  const chosen = [...a.db.decisions.iter()].find(r => r.overlooked && r.layerIds.length && openHomes.has(r.householdId))!;
  assert(chosen);
  const id = chosen.householdId;
  await Promise.all([subscribe(a, `SELECT * FROM household_decisions(${id})`), subscribe(b, `SELECT * FROM household_decisions(${id})`), subscribe(outsider, `SELECT * FROM household_decisions(${id})`)]);
  assert.equal(outsider.db.householdDecisions.count(), 0n);
  await assert.rejects(outsider.reducers.recordOutreach({ householdId: id }));
  await a.reducers.recordOutreach({ householdId: id });
  await until(() => !!payload(b, id) && !payload(b, id).overlooked);
  assert(payload(b, id).unresolvedRequestCount > 0);
  await a.reducers.updateCheckIn({ householdId: id, status: 'safe' });
  for (const r of [...a.db.requests.iter()].filter(r => r.householdId === id && r.status === 'open')) await a.reducers.resolveRequest({ requestId: r.id });
  await until(() => payload(b, id)?.unresolvedRequestCount === 0);
  const suggestion = payload(a, id).preparation.suggestions[0]; assert(suggestion);
  await a.reducers.approvePreparedness({ householdId: id, recommendationId: suggestion.recommendationId, expectedRunId: runId });
  await until(() => payload(b, id)?.preparation.suppressed.some((r: { recommendationId: string }) => r.recommendationId === suggestion.recommendationId));
  await assert.rejects(b.reducers.approvePreparedness({ householdId: id, recommendationId: suggestion.recommendationId, expectedRunId: runId }));
  const task = [...b.db.tasks.iter()].find(t => t.householdId === id && t.recommendationId === suggestion.recommendationId)!;
  await b.reducers.updateTask({ taskId: task.id, status: 'completed' });
  await a.reducers.createRequest({ householdId: id, needType: 'welfare_check', urgency: 5, people: 1 });
  await until(() => [...b.db.requests.iter()].some(r => r.householdId === id && r.status === 'open' && r.needType === 'welfare_check'));
  const request = [...b.db.requests.iter()].find(r => r.householdId === id && r.status === 'open' && r.needType === 'welfare_check')!;
  await Promise.all([subscribe(a, `SELECT * FROM team_recommendations(${request.id})`), subscribe(b, `SELECT * FROM team_recommendations(${request.id})`)]);
  const candidates = JSON.parse([...a.db.teamRecommendations.iter()].find(r => r.requestId === request.id)!.payload).recommendations;
  assert(candidates.length >= 2);
  const concurrent = await Promise.allSettled([a.reducers.assignTeam({ requestId: request.id, teamId: BigInt(candidates[0].teamId) }),
    b.reducers.assignTeam({ requestId: request.id, teamId: BigInt(candidates[1].teamId) })]);
  assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
  await until(() => [...b.db.assignments.iter()].some(r => r.requestId === request.id));
  const assignment = [...b.db.assignments.iter()].find(r => r.requestId === request.id)!;
  await b.reducers.updateAssignment({ assignmentId: assignment.id, status: 'completed' });
  await until(() => a.db.requests.id.find(request.id)?.status === 'resolved' && a.db.teams.id.find(assignment.teamId)?.status === 'available');
  const layer = a.db.impactLayers.id.find(chosen.layerIds[0])!;
  const before = a.db.decisions.householdId.find(id)!.score;
  await assert.rejects(a.reducers.escalateScenario({ disasterId: layer.disasterId }));
  await call('escalate_scenario', layer.disasterId.toString());
  await until(() => b.db.decisions.householdId.find(id)!.score > before && payload(b, id)?.preparation.suggestions.length === 0);
  const clock = [...a.db.scenarioInfo.iter()][0].evaluatedAt.microsSinceUnixEpoch;
  console.log(`PASS ${expected} households: two-client decisions, contact, resolution, task suppression, competing dispatch and escalation. Waiting for the real periodic clock…`);
  await until(() => [...a.db.scenarioInfo.iter()][0].evaluatedAt.microsSinceUnixEpoch > clock, 90000);
  console.log('PASS real scheduled decision-clock refresh');
  const oldRequestIds = new Set([...a.db.requests.iter()].map(r => r.id));
  await call('reset_demo', JSON.stringify('RESET SYNTHETIC DEMO'));
  await until(() => [...b.db.scenarioInfo.iter()][0].runId === runId + 1n && b.db.decisions.count() === BigInt(expected));
  const replayInfo = [...b.db.scenarioInfo.iter()][0];
  const shift = replayInfo.startedAt.microsSinceUnixEpoch - initialInfo.startedAt.microsSinceUnixEpoch;
  const replayHomes = new Map([...b.db.households.iter()].map(h => [String(h.id), h]));
  for (const home of baselineHomes) {
    const replay = replayHomes.get(home.id)!;
    assert.equal(replay.lastContactAt?.microsSinceUnixEpoch, home.lastContactAtMicros === undefined ? undefined : home.lastContactAtMicros + shift);
    assert.equal(replay.checkInStatus, home.checkInStatus);
  }
  // A baseline can already be minutes old when this verifier attaches. Compare
  // at the replay's relative clock rather than requiring its aging scores to freeze.
  const expectedReplay = detectFollowUp(baselineHomes, baselineRequests, baselineExposure.households,
    replayInfo.evaluatedAt.microsSinceUnixEpoch - shift);
  assert.equal(digestRows([...b.db.decisions.iter()]), digestRows(expectedReplay.households.map(r => ({ householdId: BigInt(r.householdId), score: r.score, overlooked: r.overlooked }))));
  assert([...b.db.requests.iter()].every(r => !oldRequestIds.has(r.id)));
  assert([...b.db.activities.iter()].some(a => a.action === 'suggestion_approved'));
  await assert.rejects(a.reducers.approvePreparedness({ householdId: id, recommendationId: suggestion.recommendationId, expectedRunId: runId }));
  await authorize(b, false);
  await until(() => b.db.decisions.count() === 0n && b.db.householdDecisions.count() === 0n && b.db.households.count() === 0n);
  console.log(`PASS ${expected} households: seeded baseline reset, new run/IDs, preserved activity/access, stale approval rejection, and immediate revocation.`);
} finally {
  for (const conn of connections) { try { await authorize(conn, false); } catch { /* Already revoked/unavailable. */ } conn.disconnect(); }
  clearTimeout(watchdog);
}
