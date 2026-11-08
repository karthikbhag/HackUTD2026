import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DbConnection, tables } from '../../frontend/src/module_bindings';
import { toMapData } from '../../frontend/src/lib/map/backend-data';

// Run against a seeded disposable local database published by the CLI identity.
const uri = process.env.SPACETIMEDB_URI ?? 'http://127.0.0.1:3100';
const database = process.env.SPACETIMEDB_DATABASE ?? 'riskreach-josh-backend-check';
assert(['localhost', '127.0.0.1'].includes(new URL(uri).hostname), 'Smoke test is local-only');
const connections: DbConnection[] = [];
const timeout = setTimeout(() => { console.error('Live check timed out'); process.exit(1); }, 20000);
async function connect() {
  return new Promise<DbConnection>((resolve, reject) => {
    DbConnection.builder().withUri(uri).withDatabaseName(database)
      .onConnect(conn => { connections.push(conn); resolve(conn); })
      .onConnectError((_ctx, err) => reject(err)).build();
  });
}
function authorize(conn: DbConnection, enabled: boolean) {
  execFileSync('spacetime', ['call', database, 'set_employee', JSON.stringify(conn.identity!.toHexString()), String(enabled), '--server', uri, '--no-config'], { stdio: 'pipe' });
}
function subscribe(conn: DbConnection) {
  return new Promise<void>((resolve, reject) => {
    conn.subscriptionBuilder().onApplied(() => resolve()).onError(ctx => reject(ctx.event))
      .subscribe([tables.disasters, tables.zones, tables.households, tables.requests, tables.teams, tables.tasks, tables.assignments, tables.activities]);
  });
}
async function until(predicate: () => boolean) {
  while (!predicate()) await new Promise(resolve => setTimeout(resolve, 20));
}
function mapData(conn: DbConnection) {
  return toMapData({
    disasters: [...conn.db.disasters.iter()], zones: [...conn.db.zones.iter()],
    households: [...conn.db.households.iter()], requests: [...conn.db.requests.iter()],
    teams: [...conn.db.teams.iter()], tasks: [...conn.db.tasks.iter()], assignments: [...conn.db.assignments.iter()],
  });
}
try {
  const a = await connect(), b = await connect(), outsider = await connect();
  authorize(a, true); authorize(b, true);
  await Promise.all([subscribe(a), subscribe(b), subscribe(outsider)]);
  assert.equal(a.db.households.count(), 60n);
  assert.equal(b.db.households.count(), 60n);
  assert.equal(outsider.db.households.count(), 0n);
  assert.equal(mapData(a).zones.length, 6);
  assert.equal(mapData(a).teams.length, 12);
  assert.deepEqual(mapData(outsider), { zones: [], households: [], teams: [] });
  await assert.rejects(outsider.reducers.updateCheckIn({ householdId: 1n, status: 'urgent' }));
  await a.reducers.updateCheckIn({ householdId: 1n, status: 'urgent' });
  await until(() => [...b.db.households.iter()].some(row => row.id === 1n && row.checkInStatus === 'urgent'));
  assert.equal(mapData(b).households.find(row => row.id === '1')?.checkIn, 'urgent');
  await a.reducers.recordOutreach({ householdId: 1n });
  await until(() => [...b.db.activities.iter()].some(row => row.entityId === 1n && row.action === 'contacted'));
  const candidates = [...a.db.teams.iter()].filter(row => row.status === 'available' && row.capabilities.includes('welfare_check'));
  assert(candidates.length >= 2);
  const request = [...a.db.requests.iter()].find(row => row.needType === 'welfare_check' && row.status === 'open');
  assert(request, 'Reset the disposable scenario before running');
  const results = await Promise.allSettled([
    a.reducers.assignTeam({ requestId: request.id, teamId: candidates[0].id }),
    b.reducers.assignTeam({ requestId: request.id, teamId: candidates[1].id }),
  ]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  await until(() => [...b.db.assignments.iter()].some(row => row.requestId === request.id));
  const assignment = [...b.db.assignments.iter()].find(row => row.requestId === request.id)!;
  assert.equal(mapData(b).teams.find(row => row.id === String(assignment.teamId))?.zoneId, String([...b.db.households.iter()].find(row => row.id === request.householdId)!.zoneId));
  await b.reducers.updateAssignment({ assignmentId: assignment.id, status: 'completed' });
  await until(() => [...a.db.requests.iter()].some(row => row.id === request.id && row.status === 'resolved'));
  await until(() => [...a.db.teams.iter()].some(row => row.id === assignment.teamId && row.status === 'available'));
  assert.deepEqual(mapData(a).households.find(row => row.id === String(request.householdId))?.needs, []);
  authorize(b, false);
  await until(() => b.db.households.count() === 0n);
  await until(() => b.db.zones.count() === 0n && b.db.teams.count() === 0n);
  assert.deepEqual(mapData(b), { zones: [], households: [], teams: [] });
  console.log('PASS: two live clients synchronized map adaptation, check-in, outreach, conflicting dispatch, completion, and authorization revocation; outsider denied.');
} finally {
  for (const conn of connections) {
    try { authorize(conn, false); } catch { /* Connection may not have been enrolled. */ }
    conn.disconnect();
  }
  clearTimeout(timeout);
}
