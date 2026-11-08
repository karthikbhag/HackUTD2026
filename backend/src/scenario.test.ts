import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { ConnectionId, Timestamp } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import db, * as api from './index';
import { adaptScenario, source, type Scenario } from './scenario';
import { toMapData, type OperationalRows } from '../../frontend/src/lib/map/backend-data';
const now = new Timestamp(1900000000123456n);
const admin = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'dataset-admin' }), new ConnectionId(20n));
function fixture() {
  const test = createModuleTestHarness(db, api);
  test.clock.set(now);
  test.withReducerTx(admin, ctx => { api.init(ctx, {}); api.seedDemo(ctx, {}); });
  return test;
}
describe('Person 3 dataset integration', () => {
  it('maps source IDs deterministically, translates enums and preserves geometry/source/nulls and clock offsets', () => {
    const rows = adaptScenario(source, now);
    const reordered = structuredClone(source);
    reordered.households.reverse();
    expect(adaptScenario(reordered, now).maps.households).toEqual(rows.maps.households);
    expect(rows.disasters).toHaveLength(6);
    expect(rows.zones).toHaveLength(12);
    expect(rows.households).toHaveLength(60);
    expect(rows.teams).toHaveLength(12);
    expect(rows.requests).toHaveLength(12);
    expect(rows.disasters.every(d => d.isSimulated && d.source === source.source)).toBe(true);
    expect(rows.disasters[0].updatedAt.microsSinceUnixEpoch).toBe(now.microsSinceUnixEpoch);
    expect(rows.requests[0].createdAt.microsSinceUnixEpoch).toBe(now.microsSinceUnixEpoch - 3600000000n);
    expect(rows.households[0].lastContactAt).toBeUndefined();
    const precise = structuredClone(source);
    precise.help_requests[0].created_at = '2026-11-07T11:00:00.123456Z';
    expect(adaptScenario(precise, now).requests[0].createdAt.microsSinceUnixEpoch).toBe(now.microsSinceUnixEpoch - 3600000000n + 123456n);
    expect(rows.households[1].lastContactAt?.microsSinceUnixEpoch).toBe(now.microsSinceUnixEpoch - 21600000000n);
    expect(JSON.parse(rows.zones[0].boundary)).toEqual(source.zones[0].boundary);
    expect(rows.zones[0]).toMatchObject({ level: 'metro', riskLevel: 2, parentZoneId: undefined });
    expect(rows.requests[0]).toMatchObject({ needType: 'shelter', urgency: 5, people: 1 });
    expect(rows.requests[1]).toMatchObject({ needType: 'water', urgency: 3 });
    expect(rows.requests.every(r => rows.households.some(h => h.id === r.householdId))).toBe(true);
  });
  it('rejects damaged data before loading', () => {
    const mutations: ((d: Scenario) => void)[] = [
      d => { d.households.push(d.households[0]); },
      d => { d.help_requests[0].household_id = 'missing'; },
      d => { d.zones[1].parent_zone_id = 'missing'; },
      d => { d.zones[1].disaster_id = 'flood'; },
      d => { d.households[0].latitude = NaN; },
      d => { d.households[0].longitude = 181; },
      d => { d.households[0].is_customer = 'yes' as unknown as boolean; },
      d => { d.households[0].check_in_status = 'resolved'; },
      d => { d.households[0].last_contact_at = '2026-02-30T00:00:00Z'; },
      d => { d.help_requests[0].created_at = '2030-01-01T00:00:00Z'; },
      d => { d.disasters[0].is_simulated = false; },
      d => { d.zones[0].risk_level = 'extreme'; },
      d => { d.help_requests[0].need_type = 'medicine'; },
      d => { d.response_teams[0].capacity = 1.5; },
      d => { d.zones[0].boundary.coordinates[0][0] = [35, -97]; },
      d => { d.zones[0].boundary.type = 'MultiPolygon'; },
      d => { d.help_requests[0].status = 'assigned'; },
    ];
    for (const mutate of mutations) {
      const damaged = structuredClone(source); mutate(damaged);
      expect(() => adaptScenario(damaged, now)).toThrow('Invalid scenario');
    }
  });
  it('loads through the actual reducer, supports dispatch, and resets without losing access/history', () => {
    const test = fixture();
    expect(test.db.household.count()).toBe(60n);
    expect(test.db.preparednessTask.count()).toBe(18n);
    expect(() => test.withReducerTx(admin, ctx => api.seedDemo(ctx, {}))).toThrow('already exists');
    const request = [...test.db.helpRequest.iter()][0];
    const unavailable = [...test.db.responseTeam.iter()].find(t => t.status === 'unavailable')!;
    expect(() => test.withReducerTx(admin, ctx => api.assignTeam(ctx, { requestId: request.id, teamId: unavailable.id }))).toThrow('unavailable');
    const household = test.db.household.id.find(request.householdId)!;
    expect(household.isCustomer).toBe(false);
    const team = [...test.db.responseTeam.iter()].find(t => t.status === 'available' && t.capabilities.includes(request.needType))!;
    test.withReducerTx(admin, ctx => api.assignTeam(ctx, { requestId: request.id, teamId: team.id }));
    const assignment = [...test.db.assignment.iter()][0];
    test.withReducerTx(admin, ctx => api.updateAssignment(ctx, { assignmentId: assignment.id, status: 'completed' }));
    expect(test.db.helpRequest.id.find(request.id)?.status).toBe('resolved');
    const ids = new Set([...test.db.helpRequest.iter()].map(r => r.id));
    for (let i = 0; i < 2; i++) test.withReducerTx(admin, ctx => api.resetDemo(ctx, { confirmation: 'RESET SYNTHETIC DEMO' }));
    expect(test.db.household.count()).toBe(60n);
    expect(test.db.helpRequest.count()).toBe(12n);
    expect([...test.db.helpRequest.iter()].some(r => ids.has(r.id))).toBe(false);
    expect([...test.db.activityEvent.iter()].filter(e => e.action === 'reset')).toHaveLength(2);
    const ctx = test.viewContext(admin);
    const map = toMapData({ disasters: api.disasters(ctx), zones: api.zones(ctx), households: api.households(ctx), requests: api.requests(ctx), teams: api.teams(ctx), tasks: api.tasks(ctx), assignments: api.assignments(ctx) });
    expect(map.zones).toHaveLength(6);
    expect(map.households).toHaveLength(48); // Regional households remain in backend; map shows neighborhoods only.
    expect(map.teams).toHaveLength(12);
  });
  it.each(['cancelled', 'completed'] as const)('omits active regional dispatches until %s using production seed/reducers', status => {
    const test = fixture();
    const employee = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'regional-dispatch' }), new ConnectionId(21n));
    test.withReducerTx(admin, ctx => api.setEmployee(ctx, { identity: test.viewContext(employee).sender, enabled: true }));
    const rows = (): OperationalRows => {
      const ctx = test.viewContext(employee);
      return { disasters: api.disasters(ctx), zones: api.zones(ctx), households: api.households(ctx), requests: api.requests(ctx), teams: api.teams(ctx), tasks: api.tasks(ctx), assignments: api.assignments(ctx) };
    };
    const maps = adaptScenario(source, now).maps;
    const householdId = maps.households.get('tornado-household-09')!;
    const teamId = maps.teams.get('earthquake-team-1')!;
    const household = test.db.household.id.find(householdId)!;
    expect(test.db.zone.id.find(household.zoneId)?.level).toBe('metro');
    const initial = toMapData(rows());
    expect(initial.households).toHaveLength(48);
    expect(initial.households.some(h => h.id === String(householdId))).toBe(false);
    const homeZoneId = initial.teams.find(t => t.id === String(teamId))!.zoneId;
    expect(initial.zones.find(z => z.id === homeZoneId)?.hazard).toBe('earthquake');
    expect(initial.teams.find(t => t.id === String(teamId))?.status).toBe('available');
    const unavailable = [...test.db.responseTeam.iter()].find(t => t.status === 'unavailable')!;
    expect(initial.teams.find(t => t.id === String(unavailable.id))?.status).toBe('unavailable');

    test.withReducerTx(employee, ctx => api.createRequest(ctx, { householdId, needType: 'welfare_check', urgency: 5, people: 1 }));
    const request = [...test.db.helpRequest.iter()].find(r => r.householdId === householdId && r.needType === 'welfare_check')!;
    test.withReducerTx(employee, ctx => api.assignTeam(ctx, { requestId: request.id, teamId }));
    const assignment = [...test.db.assignment.iter()].find(a => a.requestId === request.id)!;
    for (const activeStatus of ['assigned', 'in_progress'] as const) {
      if (activeStatus === 'in_progress') test.withReducerTx(employee, ctx => api.updateAssignment(ctx, { assignmentId: assignment.id, status: activeStatus }));
      expect(test.db.assignment.id.find(assignment.id)?.status).toBe(activeStatus);
      expect(toMapData(rows()).teams.some(t => t.id === String(teamId))).toBe(false);
      // Incomplete subscription rows must never cause an active assignment to fall back to proximity.
      const missingDestination = rows();
      missingDestination.households = missingDestination.households.filter(h => h.id !== householdId);
      expect(toMapData(missingDestination).teams.some(t => t.id === String(teamId))).toBe(false);
      missingDestination.requests = missingDestination.requests.filter(r => r.id !== request.id);
      expect(toMapData(missingDestination).teams.some(t => t.id === String(teamId))).toBe(false);
    }
    test.withReducerTx(employee, ctx => api.updateAssignment(ctx, { assignmentId: assignment.id, status }));
    expect(test.db.helpRequest.id.find(request.id)?.status).toBe(status === 'completed' ? 'resolved' : 'open');
    const after = toMapData(rows());
    expect(after.teams.find(t => t.id === String(teamId))).toMatchObject({ zoneId: homeZoneId, status: 'available' });
    expect(after.teams.find(t => t.id === String(unavailable.id))?.status).toBe('unavailable');
    test.withReducerTx(admin, ctx => api.setEmployee(ctx, { identity: test.viewContext(employee).sender, enabled: false }));
    expect(toMapData(rows())).toEqual({ zones: [], households: [], teams: [] });
  });
  it('adapts generated v2 demo and stress presets without dropping relationships', () => {
    for (const [preset, count] of [['demo', 10000], ['stress', 100000]] as const) {
      // This regression intentionally covers the v2 converter. The public CLI
      // now emits v3 impact layers, which are handled separately by exposure.ts.
      const code = "import sys,json; sys.path.insert(0,'../data/scenarios'); from generate import generate_base; print(json.dumps(generate_base(sys.argv[1])))";
      const data = JSON.parse(execFileSync(process.env.PYTHON ?? 'python', ['-c', code, preset], { maxBuffer: 64 * 1024 * 1024 }).toString()) as Scenario;
      const rows = adaptScenario(data, now);
      expect(rows.households).toHaveLength(count);
      expect(rows.disasters).toHaveLength(56);
      expect(rows.zones).toHaveLength(112);
      expect(rows.requests).toHaveLength(count / 5);
      const ids = new Set(rows.households.map(h => h.id));
      expect(rows.requests.every(r => ids.has(r.householdId))).toBe(true);
    }
  }, 20000);
});
