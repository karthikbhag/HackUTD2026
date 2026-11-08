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
  it('completes shared rescues, releases units, and reuses them for queued help before silent cases', () => {
    const { test, run, areas, homes, send, impact, args } = fixture();
    const targets = homes(areas[0].id).filter(h => h.isCustomer && ![...test.db.helpRequest.householdId.filter(h.id)].length);
    const team = [...test.db.responseTeam.iter()][0];
    run(admin, ctx => {
      for (const row of [...ctx.db.responseTeam.iter()]) ctx.db.responseTeam.id.update({ ...row, status: 'unavailable' });
      ctx.db.responseTeam.id.update({ ...team, status: 'available', capabilities: ['welfare_check'], capacity: 1 });
    });
    send(); impact(); send();
    for (const home of targets.slice(0, 2)) run(employee, (ctx, current) => api.replyDashboardNotice(ctx, { ...current, householdId: home.id, reply: 'needs_help' }));
    const first = api.dashboardResponses(test.viewContext(employee))[0];
    run(employee, ctx => api.updateAssignment(ctx, { assignmentId: first.assignmentId, status: 'in_progress' }));
    const old = args();
    const skip = () => run(employee, (ctx, current) => api.advanceDashboardClock(ctx, { ...current, step: 'complete_rescues' }));
    skip();
    expect(args().expectedMinute).toBe(30);
    expect(test.db.assignment.id.find(first.assignmentId)?.status).toBe('completed');
    expect(test.db.helpRequest.id.find(first.requestId)?.status).toBe('resolved');
    const second = api.dashboardResponses(test.viewContext(employee)).find(r => r.householdId === targets[1].id)!;
    expect(test.db.assignment.id.find(second.assignmentId)?.teamId).toBe(team.id);
    expect(test.db.assignment.id.find(second.assignmentId)?.status).toBe('assigned');
    expect(test.db.responseTeam.id.find(team.id)?.status).toBe('assigned');
    expect(api.dashboardResponses(test.viewContext(employee))).toHaveLength(2);
    expect(() => run(employee, ctx => api.advanceDashboardClock(ctx, { ...old, step: 'complete_rescues' }))).toThrow(/changed/);
    skip();
    expect(args().expectedMinute).toBe(60);
    expect(test.db.assignment.id.find(second.assignmentId)?.status).toBe('completed');
    expect(test.db.responseTeam.id.find(team.id)?.status).toBe('available');
    expect(() => skip()).toThrow(/No active/);
    expect(args().expectedMinute).toBe(60);
    expect(() => run(employee, (ctx, current) => api.replyDashboardNotice(ctx, { ...current, householdId: targets[0].id, reply: 'needs_help' }))).toThrow(/already/);
    const waiting = targets[2];
    run(employee, (ctx, current) => api.approveDashboardResponse(ctx, { ...current, householdId: waiting.id, teamId: team.id }));
    expect(api.dashboardResponses(test.viewContext(employee)).find(r => r.householdId === waiting.id)).toBeTruthy();
  });
  it('rejects unauthorized or empty rescue skips and leaves unrelated assignments active', () => {
    const { test, run, areas, homes, send, impact, args } = fixture();
    const skip = (auth = employee) => run(auth, (ctx, current) => api.advanceDashboardClock(ctx, { ...current, step: 'complete_rescues' }));
    expect(() => skip(outsider)).toThrow(/authorization/);
    expect(() => skip()).toThrow(/No active/);
    send(); impact(); send();
    expect(() => skip()).toThrow(/No active/);
    const home = homes(areas[0].id).find(h => h.isCustomer && ![...test.db.helpRequest.householdId.filter(h.id)].length)!;
    run(employee, (ctx, current) => api.replyDashboardNotice(ctx, { ...current, householdId: home.id, reply: 'needs_help' }));
    const response = api.dashboardResponses(test.viewContext(employee))[0];
    const unrelated = [...test.db.helpRequest.iter()].find(r => r.householdId !== home.id)!;
    const otherTeam = [...test.db.responseTeam.iter()].find(t => t.status === 'available')!;
    let unrelatedId = 0n;
    run(admin, ctx => {
      unrelatedId = ctx.db.assignment.insert({ id: 0n, requestId: unrelated.id, teamId: otherTeam.id, status: 'assigned', estimatedDistance: 0, estimatedEta: 0, createdAt: ctx.timestamp, completedAt: undefined }).id;
      ctx.db.responseTeam.id.update({ ...otherTeam, status: 'assigned' });
    });
    skip();
    expect(test.db.assignment.id.find(response.assignmentId)?.status).toBe('completed');
    expect(test.db.assignment.id.find(unrelatedId)?.status).toBe('assigned');
    expect(test.db.responseTeam.id.find(otherTeam.id)?.status).toBe('assigned');
    expect(args().expectedMinute).toBe(30);
  });
  it('atomically assigns an available unit for an explicit help reply without reusing it', () => {
    const { test, run, areas, homes, send, impact } = fixture();
    const targets = homes(areas[0].id).filter(h => h.isCustomer && ![...test.db.helpRequest.householdId.filter(h.id)].length);
    const team = [...test.db.responseTeam.iter()][0];
    run(admin, ctx => {
      for (const row of [...ctx.db.responseTeam.iter()]) ctx.db.responseTeam.id.update({ ...row, status: 'unavailable' });
      ctx.db.responseTeam.id.update({ ...team, status: 'available', capabilities: ['welfare_check'], capacity: 1 });
    });
    send(); impact(); send();
    const reply = (householdId: bigint) => run(employee, (ctx, current) => api.replyDashboardNotice(ctx, { ...current, areaId: areas[0].id, householdId, reply: 'needs_help' }));
    reply(targets[0].id);
    const response = api.dashboardResponses(test.viewContext(employee))[0];
    expect(response.householdId).toBe(targets[0].id);
    expect(test.db.assignment.id.find(response.assignmentId)?.teamId).toBe(team.id);
    expect(test.db.responseTeam.id.find(team.id)?.status).toBe('assigned');
    expect(test.db.helpRequest.id.find(response.requestId)?.status).toBe('assigned');
    expect([...test.db.activityEvent.iter()].some(e => e.summary.includes('Automatic simulated response'))).toBe(true);
    expect(() => reply(targets[0].id)).toThrow(/already/);
    expect(() => run(employee, (ctx, current) => api.approveDashboardResponse(ctx, { ...current, householdId: targets[0].id, teamId: team.id }))).toThrow(/already/);
    reply(targets[1].id);
    expect(api.dashboardResponses(test.viewContext(employee))).toHaveLength(1);
    expect(api.dashboardRecipients(test.viewContext(employee)).find(r => r.householdId === targets[1].id && r.status === 'needs_help')).toBeTruthy();
    run(employee, (ctx, current) => api.advanceDashboardClock(ctx, { ...current, step: 'deadline' }));
    expect(api.dashboardResponses(test.viewContext(employee)), 'silent households are never automatically dispatched').toHaveLength(1);
    expect(() => run(employee, (ctx, current) => api.approveDashboardResponse(ctx, { ...current, householdId: targets[1].id, teamId: team.id }))).toThrow(/No overdue unanswered/);
  });
  it.each(['capability', 'capacity', 'routing', 'active_assignment'] as const)('preserves a help reply when the only unit is blocked by %s', reason => {
    const { test, run, areas, homes, send, impact } = fixture();
    const home = homes(areas[0].id).find(h => h.isCustomer && ![...test.db.helpRequest.householdId.filter(h.id)].length)!;
    const team = [...test.db.responseTeam.iter()][0];
    run(admin, ctx => {
      for (const row of [...ctx.db.responseTeam.iter()]) ctx.db.responseTeam.id.update({ ...row, status: 'unavailable' });
      ctx.db.responseTeam.id.update({ ...team, status: 'available', capabilities: reason === 'capability' ? [] : ['welfare_check'], capacity: reason === 'capacity' ? 0 : 1 });
      if (reason === 'routing') ctx.db.responseTeamState.insert({ teamId: team.id, runId: 1n, positionVersion: 0n, updatedAt: ctx.timestamp, mode: 'holding', currentVisitId: undefined, available: true, tickSequence: 0n });
      if (reason === 'active_assignment') {
        const request = [...ctx.db.helpRequest.iter()][0];
        ctx.db.assignment.insert({ id: 0n, requestId: request.id, teamId: team.id, status: 'assigned', estimatedDistance: 0, estimatedEta: 0, createdAt: ctx.timestamp, completedAt: undefined });
      }
    });
    send(); impact(); send();
    const before = test.db.assignment.count();
    run(employee, (ctx, current) => api.replyDashboardNotice(ctx, { ...current, householdId: home.id, reply: 'needs_help' }));
    expect(api.dashboardRecipients(test.viewContext(employee)).some(r => r.householdId === home.id && r.status === 'needs_help')).toBe(true);
    expect([...test.db.helpRequest.householdId.filter(home.id)].some(r => r.needType === 'welfare_check' && r.status === 'open')).toBe(true);
    expect(test.db.assignment.count()).toBe(before);
    expect(api.dashboardResponses(test.viewContext(employee))).toEqual([]);
  });
  it('advances all areas to impact without requiring preparation notices', () => {
    const { test, areas, args, impact, send } = fixture();
    impact();
    expect(args().expectedMinute).toBe(0);
    expect(api.dashboardNotices(test.viewContext(employee))).toEqual([]);
    expect(() => impact()).toThrow(/already/);
    send(areas[1].id);
    expect(api.dashboardNotices(test.viewContext(employee))[0].phase).toBe('after');
  });
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
    expect(() => run(employee, (ctx, current) => api.approveDashboardResponse(ctx, { ...current, householdId: lateHome.id, teamId: 1n }))).toThrow(/No overdue unanswered/);
    run(employee, (ctx, current) => api.advanceDashboardClock(ctx, { ...current, step: 'deadline' }));
    expect([...test.db.helpRequest.householdId.filter(lateHome.id)].some(r => r.needType === 'welfare_check')).toBe(true);
  });
  it('revalidates capability/capacity, commits one real assignment, rejects duplicates and releases a cancelled team', () => {
    const { test, run, areas, args, homes, send, impact } = fixture();
    const home = homes(areas[0].id).find(h => h.isCustomer && ![...test.db.helpRequest.householdId.filter(h.id)].length)!;
    send(); impact(); send();
    expect(() => run(employee, (ctx, current) => api.approveDashboardResponse(ctx, { ...current, householdId: home.id, teamId: 1n }))).toThrow(/No overdue unanswered/);
    run(employee, (ctx, current) => api.advanceDashboardClock(ctx, { ...current, step: 'deadline' }));
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
