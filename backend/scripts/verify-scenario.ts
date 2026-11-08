import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DbConnection, tables } from '../../frontend/src/module_bindings';
import { toMapData } from '../../frontend/src/lib/map/backend-data';
import { filterHazards, householdCounts } from '../../frontend/src/lib/map/presentation';
import { hazards } from '../../frontend/src/lib/map/types';

const args = process.argv.slice(2);
assert(args.length === 4 && args[0] === '--preset' && args[2] === '--database', 'Usage: npm run verify:scenario -- --preset small|demo|stress --database NAME');
const preset = args[1], database = args[3];
assert(['small', 'demo', 'stress'].includes(preset));
assert(/^riskreach-(small|demo|stress)-[a-z0-9-]+$/.test(database), 'Use a separate scenario test database');
const uri = process.env.SPACETIMEDB_URI ?? 'http://127.0.0.1:3100';
assert(['127.0.0.1', 'localhost'].includes(new URL(uri).hostname), 'Verification is local-only');
const { expected } = JSON.parse(readFileSync(`.test-output/${preset}/manifest.json`, 'utf8'));
const connections: DbConnection[] = [];
async function connect() {
  return new Promise<DbConnection>((resolve, reject) => {
    const timer = setTimeout(() => { connection.disconnect(); reject(new Error('Connection timed out')); }, 15000);
    const connection = DbConnection.builder().withUri(uri).withDatabaseName(database)
      .onConnect(conn => { clearTimeout(timer); connections.push(conn); resolve(conn); })
      .onConnectError((_ctx, error) => { clearTimeout(timer); reject(error); }).build();
  });
}
function authorize(conn: DbConnection, enabled: boolean) {
  execFileSync('spacetime', ['call', database, 'set_employee', JSON.stringify(conn.identity!.toHexString()), String(enabled), '--server', uri, '--no-config'], { stdio: 'pipe' });
}
async function subscribe(conn: DbConnection) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Subscription application timed out')), 60000);
    conn.subscriptionBuilder().onApplied(() => { clearTimeout(timer); resolve(); })
      .onError(ctx => { clearTimeout(timer); reject(ctx.event); })
      .subscribe([tables.disasters, tables.zones, tables.households, tables.requests, tables.teams, tables.tasks, tables.assignments, tables.impactLayers]);
  });
}
let employee: DbConnection | undefined;
let enrolled = false;
try {
  employee = await connect();
  authorize(employee, true); enrolled = true;
  const start = performance.now();
  await subscribe(employee);
  const subscriptionMs = performance.now() - start;
  const rows = { disasters: [...employee.db.disasters.iter()], zones: [...employee.db.zones.iter()], households: [...employee.db.households.iter()], requests: [...employee.db.requests.iter()], teams: [...employee.db.teams.iter()], tasks: [...employee.db.tasks.iter()], assignments: [...employee.db.assignments.iter()], impactLayers: [...employee.db.impactLayers.iter()] };
  for (const name of ['disasters', 'zones', 'households', 'requests', 'teams', 'tasks', 'assignments', 'impactLayers'] as const) assert.equal(rows[name].length, expected[name], name);
  const adaptStart = performance.now();
  const map = toMapData(rows);
  const adapterMs = performance.now() - adaptStart;
  assert.deepEqual(householdCounts(map.households), { total: expected.households, neighborhood: expected.neighborhood, regional: expected.regional });
  assert.equal(map.zones.length, expected.zones / 2);
  assert.equal(map.impactLayers?.length, expected.impactLayers);
  assert.equal(filterHazards(map, []).households.length, 0);
  for (const hazard of Object.keys(hazards) as (keyof typeof hazards)[]) {
    const filtered = filterHazards(map, [hazard]);
    assert(filtered.zones.length > 0);
    const ids = new Set(filtered.zones.map(row => row.id));
    assert(filtered.households.every(row => ids.has(row.hotspotId!)));
    assert(filtered.impactLayers?.every(row => row.hazard === hazard));
  }
  assert(map.households.some(row => row.membership === 'regional'));
  assert(map.households.some(row => row.checkIn === 'safe' && row.needs.length > 0));
  const outsider = await connect();
  await subscribe(outsider);
  assert.equal(outsider.db.households.count(), 0n);
  assert.equal(outsider.db.impactLayers.count(), 0n);
  console.log(`PASS ${preset}: ${expected.households} households (${expected.neighborhood} neighborhood / ${expected.regional} regional), ${expected.impactLayers} footprints; subscription ${subscriptionMs.toFixed(0)} ms; adaptation ${adapterMs.toFixed(0)} ms. Authorized views, filters, regional details and outsider isolation verified. Browser interaction requires a separate check.`);
} finally {
  try { if (employee && enrolled) authorize(employee, false); }
  finally { for (const conn of connections) conn.disconnect(); }
}
