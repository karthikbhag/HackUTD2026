import { describe, expect, it } from 'vitest';
import type { ReducerCtx, InferSchema } from 'spacetimedb/server';
import { ConnectionId, Timestamp } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import db, * as api from './index';
import { buildPriorityQueue } from '../../frontend/src/lib/workflow/priority-queue';
const admin = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'dashboard-admin' }), new ConnectionId(71n));
const employee = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'dashboard-employee' }), new ConnectionId(72n));
const outsider = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'dashboard-outsider' }), new ConnectionId(73n));
function fixture() {
  const test = createModuleTestHarness(db, api); test.clock.set(new Timestamp(1900000000000000n));
  test.withReducerTx(admin, ctx => { api.init(ctx, {}); api.seedDemo(ctx, {}); api.setEmployee(ctx, { identity: test.viewContext(employee).sender, enabled: true }); });
  const areas = [...test.db.zone.iter()].filter(z => z.level === 'neighborhood');
  const args = () => { const s = api.dashboardState(test.viewContext(employee))[0]; return { expectedRunId: s.runId, expectedMinute: s.minute }; };
  const run = (auth: typeof employee, body: (ctx: ReducerCtx<InferSchema<typeof db>>, current: ReturnType<typeof args>) => unknown) => {
    const current = args(); test.withReducerTx(auth, ctx => { body(ctx, current); });
  };
  const homes = (areaId: bigint) => {
    const d = test.db.zone.id.find(areaId)!.disasterId;
    const ids = new Set([...test.db.zone.disasterId.filter(d)].map(z => z.id));
    return [...test.db.household.iter()].filter(h => ids.has(h.zoneId));
  };
  const send = (areaId = areas[0].id) => run(employee, (ctx, current) => api.approveDashboardNotice(ctx, { ...current, areaId, message: 'Reviewed synthetic notification' }));
  const impact = () => run(employee, (ctx, current) => api.advanceDashboardClock(ctx, { ...current, step: 'impact' }));
  return { test, run, areas, args, homes, send, impact };
}
describe('shared popup dashboard', () => {
  it('keeps synthetic deadline concerns independent of recent contact and supports critical exposure in the connected queue', () => {
    const { test } = fixture();
    const rows = { households: api.households(test.viewContext(employee)), requests: api.requests(test.viewContext(employee)),
      zones: api.zones(test.viewContext(employee)), disasters: api.disasters(test.viewContext(employee)),
      teams: api.teams(test.viewContext(employee)), assignments: api.assignments(test.viewContext(employee)),
      tasks: api.tasks(test.viewContext(employee)), impactLayers: api.impactLayers(test.viewContext(employee)) };
    const id = rows.households[0].id;
    rows.households = rows.households.map(h => h.id === id ? { ...h, lastContactAt: new Timestamp(1900000000000000n) } : h);
    const queue = buildPriorityQueue({ ...rows, dashboardOverdueHouseholdIds: [String(id)] }, 1900000000000000n);
    const selected = queue.items.find(h => h.householdId === String(id))!;
    expect(selected.overlooked).toBe(true); expect(selected.contactState).toBe('recent');
    expect(selected.concerns.some(c => c.code === 'notification_reply_overdue')).toBe(true);
    expect(queue.maxScore).toBe(190);
    const critical = buildPriorityQueue({ ...rows, impactLayers: rows.impactLayers.map(l => ({ ...l, severity: 'critical' })) }, 1900000000000000n);
    expect(critical.exposureNote).not.toMatch(/unsupported/);
    expect(critical.items.some(h => h.reasons.some(r => r.factor === 'exposure' && r.points === 45))).toBe(true);
  });
  it('snapshots recipients and notice text, preserves contact age, authorizes all reads and rejects duplicate/stale actions', () => {
    const { test, run, areas, args, homes, send, impact } = fixture(), old = args();
    const h = homes(areas[0].id).find(h => h.isCustomer)!;
    const contact = h.lastContactAt;
    expect(() => run(outsider, (ctx, current) => api.approveDashboardNotice(ctx, { ...current, areaId: areas[0].id, message: 'bad' }))).toThrow(/authorization/);
    send();
    expect(api.dashboardNotices(test.viewContext(employee))[0].message).toBe('Reviewed synthetic notification');
    expect(api.dashboardRecipients(test.viewContext(employee)).length).toBeGreaterThan(0);
    expect(api.dashboardRecipients(test.viewContext(employee)).every(r => r.riskLevel !== 'None' && r.approvedMessage === 'Reviewed synthetic notification')).toBe(true);
    expect(test.db.household.id.find(h.id)!.lastContactAt).toEqual(contact);
    expect(() => send()).toThrow(/already/);
    expect(() => run(employee, (ctx, current) => api.replyDashboardNotice(ctx, { ...current, householdId: h.id, reply: 'needs_help' }))).toThrow(/phase/);
    impact();
    expect(() => run(employee, (ctx, current) => api.approveDashboardNotice(ctx, { ...old, areaId: areas[1].id, message: 'stale' }))).toThrow(/changed/);
    for (const read of [api.dashboardState, api.dashboardNotices, api.dashboardRecipients, api.dashboardResponses]) expect(read(test.viewContext(outsider))).toEqual([]);
  });
  it('carries safe replies into After, excludes safe households from repeat outreach/dispatch and keeps existing needs intact', () => {
    const { test, run, areas, args, homes, send, impact } = fixture();
    const home = homes(areas[0].id).find(h => h.isCustomer)!;
    run(employee, (ctx, current) => api.createRequest(ctx, { householdId: home.id, needType: 'welfare_check', urgency: 3, people: 1 }));
    const requests = [...test.db.helpRequest.householdId.filter(home.id)];
    send();
    run(employee, (ctx, current) => api.replyDashboardNotice(ctx, { ...current, householdId: home.id, reply: 'safe' }));
    impact(); send();
    const after = api.dashboardNotices(test.viewContext(employee)).find(n => n.phase === 'after')!;
    expect([...test.db.dashboardRecipient.noticeId.filter(after.id)].some(r => r.householdId === home.id)).toBe(false);
    expect([...test.db.helpRequest.householdId.filter(home.id)]).toEqual(requests);
    expect(() => run(employee, (ctx, current) => api.approveDashboardResponse(ctx, { ...current, householdId: home.id, teamId: 1n }))).toThrow(/Confirmed-safe/);
  });
  it('keeps independent deadlines for second notices approved at different shared times', () => {
    const { test, run, areas, args, homes, send, impact } = fixture();
    const lateHome = homes(areas[1].id).find(h => h.isCustomer && ![...test.db.helpRequest.householdId.filter(h.id)].length)!;
    send(); impact(); send();
    run(employee, (ctx, current) => api.advanceDashboardClock(ctx, { ...current, step: 'deadline' }));
    send(areas[1].id);
    const late = [...test.db.dashboardNotice.areaId.filter(areas[1].id)][0]; expect(late.deadline).toBe(60);
    expect([...test.db.helpRequest.householdId.filter(lateHome.id)]).toHaveLength(0);
    expect(() => run(employee, (ctx, current) => api.approveDashboardResponse(ctx, { ...current, householdId: lateHome.id, teamId: 1n }))).toThrow(/No reported need/);
    run(employee, (ctx, current) => api.advanceDashboardClock(ctx, { ...current, step: 'deadline' }));
    expect([...test.db.helpRequest.householdId.filter(lateHome.id)].some(r => r.needType === 'welfare_check')).toBe(true);
  });
  it('revalidates capability/capacity, commits one real assignment, rejects duplicates and releases a cancelled team', () => {
    const { test, run, areas, args, homes, send, impact } = fixture();
    const home = homes(areas[0].id).find(h => h.isCustomer && ![...test.db.helpRequest.householdId.filter(h.id)].length)!;
    send(); impact(); send();
    run(employee, (ctx, current) => api.replyDashboardNotice(ctx, { ...current, householdId: home.id, reply: 'needs_help' }));
    const team = [...test.db.responseTeam.iter()].find(t => t.status === 'available')!;
    run(admin, (ctx, current) => ctx.db.responseTeam.id.update({ ...team, capabilities: [], capacity: 1 }));
    const action = () => run(employee, (ctx, current) => api.approveDashboardResponse(ctx, { ...current, householdId: home.id, teamId: team.id }));
    expect(action).toThrow(/capability/); expect(test.db.assignment.count()).toBe(0n);
    run(admin, (ctx, current) => ctx.db.responseTeam.id.update({ ...team, capabilities: ['welfare_check'], capacity: 1 }));
    action(); expect(api.dashboardResponses(test.viewContext(employee))).toHaveLength(1);
    expect(action).toThrow(/already/);
    const assignment = [...test.db.assignment.iter()][0];
    expect(test.db.helpRequest.id.find(assignment.requestId)!.status).toBe('assigned');
    run(employee, (ctx, current) => api.updateAssignment(ctx, { assignmentId: assignment.id, status: 'cancelled' }));
    expect(test.db.responseTeam.id.find(team.id)!.status).toBe('available');
    action(); expect(test.db.assignment.count()).toBe(2n);
  });
  it('allows community assistance but excludes a confirmed-safe community member from dashboard dispatch', () => {
    const { test, run, args, send, impact } = fixture();
    const home = [...test.db.household.iter()].find(h => !h.isCustomer)!;
    send(); impact();
    run(admin, (ctx, current) => ctx.db.household.id.update({ ...home, checkInStatus: 'safe' }));
    expect(() => run(employee, (ctx, current) => api.approveDashboardResponse(ctx, { ...current, householdId: home.id, teamId: 1n }))).toThrow(/Confirmed-safe/);
    expect([...test.db.helpRequest.householdId.filter(home.id)].some(r => r.status === 'open')).toBe(true);
  });
  it('requires administrator confirmation for shared reset, advances the run and preserves membership/history', () => {
    const { test, run, args, send, impact } = fixture(); send(); impact();
    const old = args(), history = test.db.activityEvent.count();
    expect(() => run(employee, (ctx, current) => api.resetDashboard(ctx, { ...old, confirmation: 'RESET SYNTHETIC DEMO' }))).toThrow(/authorization/);
    expect(() => run(admin, (ctx, current) => api.resetDashboard(ctx, { ...old, confirmation: 'wrong' }))).toThrow(/confirmation/);
    run(admin, (ctx, current) => api.resetDashboard(ctx, { ...old, confirmation: 'RESET SYNTHETIC DEMO' }));
    expect(args()).toEqual({ expectedRunId: old.expectedRunId + 1n, expectedMinute: -120 });
    expect(test.db.dashboardNotice.count()).toBe(0n); expect(test.db.dashboardRecipient.count()).toBe(0n);
    expect(api.households(test.viewContext(employee))).toHaveLength(60);
    expect(test.db.activityEvent.count()).toBeGreaterThan(history);
    expect(() => run(employee, (ctx, current) => api.advanceDashboardClock(ctx, { ...old, step: 'deadline' }))).toThrow(/changed/);
  });
});

describe('versioned hazard updates and risk outreach', () => {
  it('updates exposure, rejects unauthorized ingestion and stale approval, and preserves approved snapshots on cancellation', () => {
    const {test,run,areas,homes} = fixture();
    const area = areas[0], disaster = test.db.disaster.id.find(area.disasterId)!;
    const home = homes(area.id).find(h=>h.isCustomer)!;
    const update = {areaId:String(area.id),version:1,hazard:disaster.type,severity:'high',longitude:home.longitude,latitude:home.latitude,
      observedAt:'2030-03-17T17:46:40Z',expiresAt:'2040-01-01T00:00:00Z',source:'Test normalized feed',dataKind:'simulation',status:'active',radiiMeters:[1000,2000,3000]};
    expect(()=>run(employee,ctx=>api.ingestHazardEvent(ctx,{update}))).toThrow(/authorization/);
    run(admin,ctx=>api.ingestHazardEvent(ctx,{update}));
    const first = [...test.db.impactLayer.disasterId.filter(disaster.id)];
    expect(first).toHaveLength(3);
    run(admin,ctx=>api.ingestHazardEvent(ctx,{update:{...update,version:1,longitude:0}}));
    expect([...test.db.impactLayer.disasterId.filter(disaster.id)]).toEqual(first);
    const messages = {High:'High guidance',Medium:'Medium guidance',Low:'Low guidance'};
    expect(()=>run(employee,(ctx,current)=>api.approveDashboardNotice(ctx,{...current,areaId:area.id,message:JSON.stringify({format:'risk-messages-v1',messages,eventVersion:'old'})}))).toThrow(/Risk changed/);
    run(employee,(ctx,current)=>api.approveDashboardNotice(ctx,{...current,areaId:area.id,message:JSON.stringify({format:'risk-messages-v1',messages})}));
    const recipients = api.dashboardRecipients(test.viewContext(employee));
    expect(recipients.find(r=>r.householdId===home.id)).toMatchObject({riskLevel:'High',approvedMessage:'High guidance'});
    run(admin,ctx=>api.ingestHazardEvent(ctx,{update:{...update,version:2,status:'cancelled'}}));
    expect(api.impactLayers(test.viewContext(employee)).filter(l=>l.disasterId===disaster.id)).toHaveLength(0);
    expect(api.dashboardRecipients(test.viewContext(employee))).toEqual(recipients);
    expect(test.db.decisionSummary.householdId.find(home.id)?.layerIds.every(id=>!id.startsWith(`event:${disaster.id}:`))).toBe(true);
  });
});
