import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { ConnectionId, Timestamp } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import db, * as api from './index';
import { adaptScenario, type Scenario } from './scenario';
import { seed } from './seed';
import { toMapData } from '../../frontend/src/lib/map/backend-data';
import { filterHazards, householdCounts, viewportHouseholds } from '../../frontend/src/lib/map/presentation';

const clock = new Timestamp(1900000000000000n);
const admin = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'large-scenario-admin' }), new ConnectionId(30n));
function generated(preset: string): Scenario {
  return JSON.parse(execFileSync(process.env.PYTHON ?? 'python3', ['../data/scenarios/generate.py', '--preset', preset, '--seed', '2026'], { maxBuffer: 96 * 1024 * 1024 }).toString());
}
describe('large fixture inspection', () => {
  it.each([['demo', 10000, 220], ['stress', 100000, 1970]] as const)('converts v3 %s and preserves regional households, footprints, filters and viewport policy', (preset, total, teams) => {
    const rows = adaptScenario(generated(preset), clock);
    const data = toMapData({ ...rows, tasks: [], assignments: [] });
    expect(rows.impactLayers).toHaveLength(93);
    expect(data.zones).toHaveLength(56);
    expect(data.teams).toHaveLength(teams);
    expect(householdCounts(data.households)).toEqual({ total, neighborhood: total * .8, regional: total * .2 });
    expect(filterHazards(data, []).households).toEqual([]);
    const tornado = filterHazards(data, ['tornado']);
    expect(tornado.households.some(row => row.membership === 'regional')).toBe(true);
    expect(tornado.impactLayers!.every(row => row.hazard === 'tornado')).toBe(true);
    const region = data.households.find(row => row.membership === 'regional')!;
    expect(region.zoneId).not.toBe(region.hotspotId);
    expect(data.zones.some(zone => zone.id === region.hotspotId)).toBe(true);
    const [lat, lon] = region.position;
    const bounds = { south: lat - .000001, north: lat + .000001, west: lon - .000001, east: lon + .000001 };
    expect(viewportHouseholds(data.households, 8, bounds)).toEqual([]);
    expect(viewportHouseholds(data.households, 12, bounds).some(row => row.id === region.id)).toBe(true);
    expect(viewportHouseholds(data.households, 12, bounds).length).toBeLessThan(total);
    expect(data.households.some(row => row.checkIn === 'safe' && row.needs.length)).toBe(true);
  }, 30000);
  it('seeds Demo with authorized footprints and removes them on reset; rejects broken v3 input', () => {
    const source = generated('demo');
    const test = createModuleTestHarness(db, api);
    test.clock.set(clock);
    test.withReducerTx(admin, ctx => { api.init(ctx, {}); seed(ctx, source); });
    expect(test.db.household.count()).toBe(10000n);
    expect(test.db.impactLayer.count()).toBe(93n);
    expect(test.db.preparednessTask.count()).toBe(2597n);
    expect(api.impactLayers(test.viewContext(admin))).toHaveLength(93);
    const outsider = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'outsider' }), new ConnectionId(31n));
    expect(api.impactLayers(test.viewContext(outsider))).toEqual([]);
    expect([...test.db.impactLayer.iter()][0].updatedAt).toEqual(clock);
    expect(() => test.withReducerTx(admin, ctx => api.seedDemo(ctx, {}))).toThrow('already exists');
    test.withReducerTx(admin, ctx => api.resetDemo(ctx, { confirmation: 'RESET SYNTHETIC DEMO' }));
    expect(test.db.household.count()).toBe(60n);
    expect(test.db.impactLayer.count()).toBe(10n); // Default Small now includes explicit v3 footprints.
    const broken = structuredClone(source);
    broken.impact_layers![0].context_zone_id = 'missing';
    expect(() => adaptScenario(broken, clock)).toThrow('impact context');
    broken.impact_layers = undefined;
    expect(() => adaptScenario(broken, clock)).toThrow('v3 impact layers');
    const polygon = structuredClone(source);
    polygon.impact_layers![0].geometry = { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 1], [1, 0], [0, 0]]] };
    expect(() => adaptScenario(polygon, clock)).toThrow('Invalid exposure input');
    const context = structuredClone(source);
    context.zones[0].boundary_role = 'hazard';
    expect(() => adaptScenario(context, clock)).toThrow('context boundary role');
  }, 30000);
});
