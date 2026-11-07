import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DbConnection, tables } from '../../frontend/src/module_bindings';

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
      .subscribe([tables.households, tables.requests, tables.teams, tables.assignments, tables.activities]);
  });
}
async function until(predicate: () => boolean) {
  while (!predicate()) await new Promise(resolve => setTimeout(resolve, 20));
}
try {
  const a = await connect(), b = await connect(), outsider = await connect();
  authorize(a, true); authorize(b, true);
  await Promise.all([subscribe(a), subscribe(b), subscribe(outsider)]);
  assert.equal(a.db.households.count(), 12n);
  assert.equal(b.db.households.count(), 12n);
  assert.equal(outsider.db.households.count(), 0n);
  await assert.rejects(outsider.reducers.updateCheckIn({ householdId: 1n, status: 'urgent' }));
  await a.reducers.updateCheckIn({ householdId: 1n, status: 'urgent' });
  await until(() => [...b.db.households.iter()].some(row => row.id === 1n && row.checkInStatus === 'urgent'));
  await a.reducers.recordOutreach({ householdId: 1n });
  await until(() => [...b.db.activities.iter()].some(row => row.entityId === 1n && row.action === 'contacted'));
  const request = [...a.db.requests.iter()].find(row => row.householdId === 2n && row.status === 'open');
  assert(request, 'Reset the disposable scenario before running');
  const results = await Promise.allSettled([
    a.reducers.assignTeam({ requestId: request.id, teamId: 2n }),
    b.reducers.assignTeam({ requestId: request.id, teamId: 3n }),
  ]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  await until(() => [...b.db.assignments.iter()].some(row => row.requestId === request.id));
  const assignment = [...b.db.assignments.iter()].find(row => row.requestId === request.id)!;
  await b.reducers.updateAssignment({ assignmentId: assignment.id, status: 'completed' });
  await until(() => [...a.db.requests.iter()].some(row => row.id === request.id && row.status === 'resolved'));
  await until(() => [...a.db.teams.iter()].some(row => row.id === assignment.teamId && row.status === 'available'));
  authorize(b, false);
  await until(() => b.db.households.count() === 0n);
  console.log('PASS: two live clients synchronized check-in, outreach, conflicting dispatch, completion, and authorization revocation; outsider denied.');
} finally {
  for (const conn of connections) {
    try { authorize(conn, false); } catch { /* Connection may not have been enrolled. */ }
    conn.disconnect();
  }
  clearTimeout(timeout);
}
