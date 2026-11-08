/** Mutates only this disposable local database; never the user's Demo dataset. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DbConnection, tables } from '../../frontend/src/module_bindings';
import { createWorkflowActions } from '../../frontend/src/components/workflow/actions';
import { sharedDashboardSnapshot } from '../../frontend/src/lib/map/shared-dashboard';
import { toMapData } from '../../frontend/src/lib/map/backend-data';
import { matchingTeam, confirmedSafe } from '../../frontend/src/lib/map/dashboard-scenario';
const database = 'riskreach-popup-live-check', uri = process.env.SPACETIMEDB_URI ?? 'http://127.0.0.1:3100';
assert(['localhost', '127.0.0.1'].includes(new URL(uri).hostname));
const execute = promisify(execFile), clients: DbConnection[] = [];
const tokens = new Map<DbConnection, string>();
async function call(name: string, ...args: string[]) { await execute('spacetime', ['call', database, name, ...args, '--server', uri, '--no-config']); }
async function authorize(c: DbConnection, enabled: boolean) { await call('set_employee', JSON.stringify(c.identity!.toHexString()), String(enabled)); }
async function connect(token?: string) {
  return new Promise<DbConnection>((resolve, reject) => {
    DbConnection.builder().withUri(uri).withDatabaseName(database).withToken(token).onConnect((c, _id, t) => { clients.push(c); tokens.set(c, t); resolve(c); }).onConnectError((_ctx, e) => reject(e)).build();
  });
}
async function subscribe(c: DbConnection) {
  await new Promise<void>((resolve, reject) => c.subscriptionBuilder().onApplied(() => resolve()).onError(ctx => reject(ctx.event))
    .subscribe([tables.disasters, tables.zones, tables.households, tables.requests, tables.teams, tables.assignments, tables.tasks, tables.impactLayers,
      tables.dashboardState, tables.dashboardNotices, tables.dashboardRecipients, tables.dashboardResponses]));
}
function snapshot(c: DbConnection) {
  return sharedDashboardSnapshot([...c.db.dashboardState.iter()][0], [...c.db.dashboardNotices.iter()], [...c.db.dashboardRecipients.iter()], [...c.db.dashboardResponses.iter()], [...c.db.assignments.iter()]);
}
function args(c: DbConnection) { const s = snapshot(c); return { expectedRunId: s.runId, expectedMinute: s.state.minute }; }
function map(c: DbConnection) {
  return toMapData({ disasters: [...c.db.disasters.iter()], zones: [...c.db.zones.iter()], households: [...c.db.households.iter()], requests: [...c.db.requests.iter()],
    teams: [...c.db.teams.iter()], assignments: [...c.db.assignments.iter()], tasks: [...c.db.tasks.iter()], impactLayers: [...c.db.impactLayers.iter()] });
}
async function until(check: () => boolean) {
  const end = Date.now() + 15000;
  while (!check()) { assert(Date.now() < end, 'Shared popup state did not synchronize'); await new Promise(r => setTimeout(r, 25)); }
}
const timeout = setTimeout(() => { console.error('Popup verifier timed out'); process.exit(1); }, 120000);
try {
  const a = await connect(), b = await connect(), outsider = await connect();
  await authorize(a, true); await authorize(b, true);
  await Promise.all([subscribe(a), subscribe(b), subscribe(outsider)]);
  assert.equal(a.db.households.count(), 60n); assert.equal(outsider.db.dashboardState.count(), 0n);
  const actionA = createWorkflowActions(() => a), actionB = createWorkflowActions(() => b);
  const areaId = map(a).zones[0].id, initial = args(a);
  const areaHomes = map(a).households.filter(h => h.hotspotId === areaId && h.isCustomer);
  const safeHome = areaHomes[0]; assert(safeHome);
  await actionA.createRequest(safeHome.id, 'welfare_check', 3, 1);
  await actionA.dashboardAction({ type: 'send', areaId, message: 'Reviewed initial synthetic notice' }, initial);
  await until(() => !!snapshot(b).state.areas[areaId]?.before);
  await actionB.dashboardAction({ type: 'reply', id: safeHome.id, reply: 'safe' }, args(b));
  await until(() => snapshot(a).state.areas[areaId]?.before?.replies[safeHome.id] === 'safe');
  await actionA.dashboardAction({ type: 'impact' }, initial);
  await assert.rejects(actionB.dashboardAction({ type: 'impact' }, initial));
  await actionA.dashboardAction({ type: 'send', areaId, message: 'Reviewed follow-up synthetic notice' }, args(a));
  await until(() => !!snapshot(b).state.areas[areaId]?.after);
  assert(!snapshot(b).state.areas[areaId].after!.recipients.includes(safeHome.id));
  assert(confirmedSafe(snapshot(b).state, map(b).households.find(h => h.id === safeHome.id)!, 'after'));
  assert([...b.db.requests.iter()].some(r => String(r.householdId) === safeHome.id && r.status === 'open'));
  const target = map(a).households.find(h => h.hotspotId === areaId && h.isCustomer && !h.needs.length && h.id !== safeHome.id)!; assert(target);
  await actionA.dashboardAction({ type: 'reply', id: target.id, reply: 'needs_help' }, args(a));
  await until(() => map(b).households.find(h => h.id === target.id)!.needs.includes('welfare check'));
  const state = snapshot(a).state, model = map(a), team = matchingTeam(state, model.households.find(h => h.id === target.id)!, model.teams); assert(team);
  await assert.rejects(actionA.dashboardAction({ type: 'assign', id: safeHome.id, teamId: team.id }, args(a)));
  const race = await Promise.allSettled([actionA.dashboardAction({ type: 'assign', id: target.id, teamId: team.id }, args(a)), actionB.dashboardAction({ type: 'assign', id: target.id, teamId: team.id }, args(b))]);
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
  await until(() => snapshot(b).state.assignments[target.id] === team.id);
  const response = [...b.db.dashboardResponses.iter()].find(r => String(r.householdId) === target.id)!;
  await actionB.updateAssignment(String(response.assignmentId), 'completed');
  await until(() => snapshot(a).assignmentStatuses[target.id] === 'completed');
  assert.equal([...a.db.teams.iter()].find(t => String(t.id) === team.id)!.status, 'available');
  await actionA.dashboardAction({ type: 'deadline' }, args(a));
  await until(() => snapshot(b).state.minute === 30);
  const resumed = await connect(tokens.get(b)); await subscribe(resumed);
  assert.equal(snapshot(resumed).state.minute, 30); assert.equal(snapshot(resumed).state.areas[areaId].before!.replies[safeHome.id], 'safe');
  assert.equal(snapshot(resumed).assignmentStatuses[target.id], 'completed');
  assert.equal(outsider.db.dashboardRecipients.count(), 0n); assert.equal(outsider.db.dashboardResponses.count(), 0n);
  await assert.rejects(outsider.reducers.advanceDashboardClock({ ...args(a), step: 'deadline' }));
  const old = args(a);
  await call('reset_dashboard', old.expectedRunId.toString(), old.expectedMinute.toString(), JSON.stringify('RESET SYNTHETIC DEMO'));
  await until(() => snapshot(a).runId === initial.expectedRunId + 1n && a.db.dashboardNotices.count() === 0n);
  await assert.rejects(actionA.dashboardAction({ type: 'send', areaId, message: 'stale old run' }, old));
  await authorize(b, false);
  await until(() => b.db.dashboardState.count() === 0n && resumed.db.households.count() === 0n);
  console.log('PASS actual UI action wrappers + subscription adapter: shared notices/replies/clock, carried-safe exclusion without erased needs, real competing dispatch, completion, same-identity reconnect, reset, stale action rejection and live revocation.');
} finally {
  for (const c of clients) { try { await authorize(c, false); } catch { /* Preserve original failure. */ } c.disconnect(); }
  clearTimeout(timeout);
}
