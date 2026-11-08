import { describe, expect, it } from 'vitest';
import { ConnectionId, Timestamp } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import db, * as api from './index';
import { seed as seedWorkflowFixture } from './workflow-fixture.test-helper';
import { toMapData, type OperationalRows } from '../../frontend/src/lib/map/backend-data';

const admin = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'admin' }), new ConnectionId(1n));
const employee = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'employee' }), new ConnectionId(2n));
const stranger = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'stranger' }), new ConnectionId(3n));
function fixture() {
  const test = createModuleTestHarness(db, api);
  test.clock.set(new Timestamp(1800000000000000n));
  test.withReducerTx(admin, ctx => { api.init(ctx, {}); seedWorkflowFixture(ctx); });
  test.withReducerTx(admin, ctx => api.setEmployee(ctx, { identity: test.viewContext(employee).sender, enabled: true }));
  return test;
}
function requestFor(test: ReturnType<typeof fixture>, householdId: bigint) {
  return [...test.db.helpRequest.iter()].find(r => r.householdId === householdId)!.id;
}
function mapRows(test: ReturnType<typeof fixture>): OperationalRows {
  const ctx = test.viewContext(employee);
  return {
    disasters: api.disasters(ctx), zones: api.zones(ctx), households: api.households(ctx),
    requests: api.requests(ctx), teams: api.teams(ctx), tasks: api.tasks(ctx), assignments: api.assignments(ctx),
  };
}
describe('backend to map integration', () => {
  it('renders six neighborhood hotspots with converted coordinates, IDs, timestamps and nearby teams', () => {
    const test = fixture(), data = toMapData(mapRows(test));
    expect(data.zones).toHaveLength(6);
    expect(data.households).toHaveLength(12);
    expect(data.teams).toHaveLength(6);
    const houston = data.zones.find(row => row.id === '11')!;
    expect(houston.boundary[0]).toEqual([29.76 - .03, -95.37 - .03]);
    expect(houston.updatedAt).toBe(test.clock.now().toDate().toISOString());
    expect(houston.preparation).toEqual(['outreach', 'flood preparation']);
    expect(data.teams.find(row => row.id === '1')?.zoneId).toBe('11');
    expect(data.households.find(row => row.id === '1')?.lastContactAt).not.toBeNull();
    const rows = mapRows(test), huge = 9007199254740993n;
    rows.households = [{ ...rows.households[0], id: huge }];
    expect(toMapData(rows).households[0].id).toBe('9007199254740993');
  });
  it('reflects escalation, contact, safety and resolution without confusing their meanings', () => {
    const test = fixture();
    test.withReducerTx(employee, ctx => {
      api.updateCheckIn(ctx, { householdId: 1n, status: 'safe' });
      api.recordOutreach(ctx, { householdId: 1n });
    });
    test.withReducerTx(admin, ctx => api.escalateScenario(ctx, { disasterId: 1n }));
    let data = toMapData(mapRows(test));
    expect(data.zones.find(row => row.id === '11')?.severity).toBe('critical');
    expect(data.zones.find(row => row.id === '21')?.severity).toBe('high');
    expect(data.households.find(row => row.id === '1')).toMatchObject({ checkIn: 'safe', needs: ['welfare check'], lastContactAt: test.clock.now().toDate().toISOString() });
    const requestId = requestFor(test, 1n);
    test.withReducerTx(employee, ctx => api.resolveRequest(ctx, { requestId }));
    data = toMapData(mapRows(test));
    expect(data.households.find(row => row.id === '1')?.needs).toEqual([]);
  });
  it('groups a dispatched remote team with the actual request and returns to proximity on cancellation', () => {
    const test = fixture();
    const requestId = requestFor(test, 1n);
    test.withReducerTx(employee, ctx => api.assignTeam(ctx, { requestId, teamId: 2n }));
    expect(toMapData(mapRows(test)).teams.find(row => row.id === '2')?.zoneId).toBe('11');
    const assignmentId = [...test.db.assignment.iter()][0].id;
    test.withReducerTx(employee, ctx => api.updateAssignment(ctx, { assignmentId, status: 'cancelled' }));
    expect(toMapData(mapRows(test)).teams.find(row => row.id === '2')?.zoneId).toBe('21');
  });
  it('rejects unsupported geometry and drops all map records after revocation', () => {
    const test = fixture(), rows = mapRows(test);
    rows.zones = rows.zones.map(row => row.level === 'neighborhood' ? { ...row, boundary: '{"type":"MultiPolygon","coordinates":[]}' } : row);
    expect(() => toMapData(rows)).toThrow('Polygon');
    test.withReducerTx(admin, ctx => api.setEmployee(ctx, { identity: test.viewContext(employee).sender, enabled: false }));
    expect(toMapData(mapRows(test))).toEqual({ zones: [], households: [], teams: [] });
  });
});
describe('backend workflows', () => {
  it('seeds sparse nationwide hierarchy and protects reads/writes', () => {
    const test = fixture();
    expect(test.db.zone.count()).toBe(18n);
    expect(api.households(test.viewContext(stranger))).toEqual([]);
    expect(api.households(test.viewContext(employee))).toHaveLength(12);
    expect(() => test.withReducerTx(stranger, ctx => api.updateCheckIn(ctx, { householdId: 1n, status: 'safe' }))).toThrow('authorization');
    expect(() => test.withReducerTx(employee, ctx => api.resetDemo(ctx, { confirmation: 'RESET SYNTHETIC DEMO' }))).toThrow('authorization');
    expect(() => test.withReducerTx(employee, ctx => api.setEmployee(ctx, { identity: ctx.sender, enabled: true }))).toThrow('authorization');
  });
  it('revokes read and write access', () => {
    const test = fixture();
    test.withReducerTx(admin, ctx => api.setEmployee(ctx, { identity: test.viewContext(employee).sender, enabled: false }));
    expect(api.households(test.viewContext(employee))).toEqual([]);
    expect(() => test.withReducerTx(employee, ctx => api.recordOutreach(ctx, { householdId: 1n }))).toThrow();
  });
  it('keeps safety separate from unresolved assistance and records contact explicitly', () => {
    const test = fixture();
    test.withReducerTx(employee, ctx => api.updateCheckIn(ctx, { householdId: 1n, status: 'safe' }));
    expect(test.db.helpRequest.id.find(requestFor(test, 1n))?.status).toBe('open');
    const before = test.db.household.id.find(1n)!.lastContactAt!;
    expect(before.microsSinceUnixEpoch).toBeLessThan(test.clock.now().microsSinceUnixEpoch);
    test.withReducerTx(employee, ctx => api.recordOutreach(ctx, { householdId: 1n }));
    expect(test.db.household.id.find(1n)?.lastContactAt).toEqual(test.clock.now());
  });
  it('completes outreach tasks and rejects invalid transitions', () => {
    const test = fixture();
    const task = [...test.db.preparednessTask.iter()][0];
    test.withReducerTx(employee, ctx => api.updateTask(ctx, { taskId: task.id, status: 'completed' }));
    expect(test.db.household.id.find(task.householdId!)?.lastContactAt).toEqual(test.clock.now());
    expect(() => test.withReducerTx(employee, ctx => api.updateTask(ctx, { taskId: task.id, status: 'pending' }))).toThrow();
    expect(() => test.withReducerTx(employee, ctx => api.createTask(ctx, { zoneId: 11n, householdId: 3n, actionType: 'outreach' }))).toThrow();
  });
  it('dispatches a community case, prevents conflicting dispatch and completes atomically', () => {
    const test = fixture(), requestId = requestFor(test, 2n);
    expect(test.db.household.id.find(2n)?.isCustomer).toBe(false);
    test.withReducerTx(employee, ctx => api.assignTeam(ctx, { requestId, teamId: 1n }));
    const assigned = [...test.db.assignment.iter()][0];
    expect(assigned.estimatedDistance).toBeGreaterThan(0);
    const count = test.db.activityEvent.count();
    expect(() => test.withReducerTx(admin, ctx => api.assignTeam(ctx, { requestId, teamId: 2n }))).toThrow();
    const otherRequestId = requestFor(test, 1n);
    expect(() => test.withReducerTx(admin, ctx => api.assignTeam(ctx, { requestId: otherRequestId, teamId: 1n }))).toThrow();
    expect(test.db.assignment.count()).toBe(1n);
    expect(test.db.activityEvent.count()).toBe(count);
    test.withReducerTx(employee, ctx => api.updateAssignment(ctx, { assignmentId: assigned.id, status: 'in_progress' }));
    expect(test.db.responseTeam.id.find(1n)?.status).toBe('responding');
    expect(() => test.withReducerTx(employee, ctx => api.resolveRequest(ctx, { requestId }))).toThrow();
    test.withReducerTx(employee, ctx => api.updateAssignment(ctx, { assignmentId: assigned.id, status: 'completed' }));
    expect(test.db.helpRequest.id.find(requestId)?.status).toBe('resolved');
    expect(test.db.responseTeam.id.find(1n)?.status).toBe('available');
    expect(() => test.withReducerTx(employee, ctx => api.updateAssignment(ctx, { assignmentId: assigned.id, status: 'cancelled' }))).toThrow();
  });
  it('cancellation reopens requests and releases teams', () => {
    const test = fixture(), requestId = requestFor(test, 1n);
    test.withReducerTx(employee, ctx => api.assignTeam(ctx, { requestId, teamId: 1n }));
    const assignmentId = [...test.db.assignment.iter()][0].id;
    test.withReducerTx(employee, ctx => api.updateAssignment(ctx, { assignmentId, status: 'cancelled' }));
    expect(test.db.helpRequest.id.find(requestId)?.status).toBe('open');
    expect(test.db.responseTeam.id.find(1n)?.status).toBe('available');
    test.withReducerTx(employee, ctx => api.assignTeam(ctx, { requestId, teamId: 1n }));
    expect(test.db.assignment.count()).toBe(2n);
  });
  it('rejects incapable or undersized teams and malformed requests without writes', () => {
    const test = fixture();
    for (const args of [{ needType: 'evacuation', people: 2 }, { needType: 'water', people: 5 }]) {
      test.withReducerTx(employee, ctx => api.createRequest(ctx, { householdId: 1n, urgency: 5, ...args }));
      const req = [...test.db.helpRequest.iter()].find(r => r.needType === args.needType && r.people === args.people)!;
      expect(() => test.withReducerTx(employee, ctx => api.assignTeam(ctx, { requestId: req.id, teamId: 1n }))).toThrow('insufficient');
    }
    const count = test.db.helpRequest.count();
    expect(() => test.withReducerTx(employee, ctx => api.createRequest(ctx, { householdId: 1n, urgency: 0, needType: 'water', people: 1 }))).toThrow();
    expect(test.db.helpRequest.count()).toBe(count);
    expect(test.db.assignment.count()).toBe(0n);
  });
  it('escalates and resets repeatably, preserving authorization and history', () => {
    const test = fixture();
    test.withReducerTx(admin, ctx => api.escalateScenario(ctx, { disasterId: 1n }));
    expect(test.db.disaster.id.find(1n)?.phase).toBe('response');
    expect(test.db.zone.id.find(11n)?.riskLevel).toBe(5);
    expect(test.db.zone.id.find(21n)?.riskLevel).toBe(4);
    expect(new Set([...test.db.disaster.iter()].map(row => row.type))).toEqual(new Set(['tornado', 'earthquake', 'hurricane', 'wildfire', 'blizzard', 'flood']));
    expect(() => test.withReducerTx(admin, ctx => api.resetDemo(ctx, { confirmation: 'wrong' }))).toThrow();
    for (let i = 0; i < 2; i++) test.withReducerTx(admin, ctx => api.resetDemo(ctx, { confirmation: 'RESET SYNTHETIC DEMO' }));
    expect(test.db.disaster.id.find(1n)?.phase).toBe('preparedness');
    expect(test.db.household.count()).toBe(60n);
    expect(test.db.helpRequest.count()).toBe(12n);
    expect(api.households(test.viewContext(employee))).toHaveLength(60);
    expect([...test.db.activityEvent.iter()].filter(e => e.action === 'reset')).toHaveLength(2);
  });
});
