import { configureDummyFeed, advanceDummyFeed } from './dummy-weather';
import { hazardFeedState, hazardFeedTick } from './schema';
import { activeImpactRows } from './hazard-layers';
import { ingestHazard } from './hazard-ingestion';
import { removeNoncontiguous } from './remove-noncontiguous';
import { dispatcherMembership, dispatchApproval, responseRun, welfareVisit, teamRoute, responseTeamState } from './schema';
import { seedRoutingFixture, createRun, runOf, workerRun, configOf, minuteOf, synchronizeWelfare, terminal } from './response-routing';
import { t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import db, { disaster, zone, household, helpRequest, responseTeam, assignment, preparednessTask, activityEvent, impactLayer } from './schema';
import { seed, resetOperationalData } from './seed';
import { ScheduleAt } from 'spacetimedb';
import { decisionSummary, scenarioState, decisionTick } from './schema';
import { operationalLayers, refreshDecisions, householdDecision, requestRecommendations } from './decisions';
import { areaExercise, exerciseCheckIn } from './schema';
import { advanceExercise, sendExerciseNotice, replyToExercise } from './exercise';
import { dashboardNotice, dashboardRecipient, dashboardResponse } from './schema';
import { clock, validateClock, sendNotice, recordReply, advanceClock, prepareResponse, prepareAutomaticResponse, saveResponse, resetDashboardState } from './dashboard';
export default db;
type Ctx = ReducerCtx<InferSchema<typeof db>>;
function requireEmployee(ctx: Ctx, admin = false) {
  const user = ctx.db.employee.identity.find(ctx.sender);
  if (!user || (admin && !user.admin)) throw new SenderError('Employee authorization required');
}
function event(ctx: Ctx, entityType: string, entityId: bigint, action: string, summary: string) {
  ctx.db.activityEvent.insert({ id: 0n, entityType, entityId, action, summary, actorId: ctx.sender, timestamp: ctx.timestamp });
}
function check(value: string, allowed: readonly string[]) {
  if (!allowed.includes(value)) throw new SenderError(`Invalid value: ${value}`);
}
const active = (status: string) => status === 'assigned' || status === 'in_progress';

// The publisher is the initial administrator; no client can self-enroll.
export const init = db.init(ctx => {
  ctx.db.employee.insert({ identity: ctx.sender, admin: true });
  ctx.db.decisionTick.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(60_000_000n) });
});
export const setEmployee = db.reducer({ identity: t.identity(), enabled: t.bool() }, (ctx, { identity, enabled }) => {
  requireEmployee(ctx, true);
  if (identity.equals(ctx.sender)) throw new SenderError('Cannot change your own administrator membership');
  const previous = ctx.db.employee.identity.find(identity);
  if (previous?.admin) throw new SenderError('Cannot change administrator membership');
  if (enabled && !previous) ctx.db.employee.insert({ identity, admin: false });
  if (!enabled && previous) ctx.db.employee.identity.delete(identity);
  event(ctx, 'employee', 0n, enabled ? 'authorized' : 'revoked', identity.toHexString());
});
export const seedDemo = db.reducer(ctx => {
  requireEmployee(ctx, true);
  if (ctx.db.disaster.count() !== 0n) throw new SenderError('Scenario already exists; use resetDemo');
  seed(ctx);
  event(ctx, 'disaster', 1n, 'seeded', 'Synthetic nationwide multi-hazard scenario');
});
export const resetDemo = db.reducer({ confirmation: t.string() }, (ctx, { confirmation }) => {
  requireEmployee(ctx, true);
  if (confirmation !== 'RESET SYNTHETIC DEMO') throw new SenderError('Reset confirmation required');
  // Membership is deliberately preserved. Snapshot before deleting iterator rows.
  // Preserve durable history across resets.
  resetDashboardState(ctx);
  resetOperationalData(ctx);
  event(ctx, 'disaster', 1n, 'reset', 'Synthetic scenario reset; memberships and history preserved');
});
export const updateCheckIn = db.reducer({ householdId: t.u64(), status: t.string() }, (ctx, { householdId, status }) => {
  requireEmployee(ctx);
  check(status, ['unknown', 'safe', 'needs_help', 'urgent']);
  const row = ctx.db.household.id.find(householdId);
  if (!row) throw new SenderError('Household not found');
  ctx.db.household.id.update({ ...row, checkInStatus: status });
  synchronizeWelfare(ctx, householdId);
  refreshDecisions(ctx, householdId);
  event(ctx, 'household', householdId, 'check_in', status);
});
export const recordOutreach = db.reducer({ householdId: t.u64() }, (ctx, { householdId }) => {
  requireEmployee(ctx);
  const row = ctx.db.household.id.find(householdId);
  if (!row) throw new SenderError('Household not found');
  ctx.db.household.id.update({ ...row, lastContactAt: ctx.timestamp });
  refreshDecisions(ctx, householdId);
  event(ctx, 'household', householdId, 'contacted', 'Simulated outreach recorded');
});
export const createTask = db.reducer({ zoneId: t.u64(), householdId: t.option(t.u64()), actionType: t.string() }, (ctx, args) => {
  requireEmployee(ctx);
  check(args.actionType, ['outreach', 'preparedness_information', 'shelter_options', 'position_supplies', 'shelter_in_place', 'infrastructure_check', 'evacuation_preparation', 'smoke_protection', 'winter_preparation', 'flood_preparation']);
  if (!ctx.db.zone.id.find(args.zoneId)) throw new SenderError('Zone not found');
  if (args.householdId !== undefined && ctx.db.household.id.find(args.householdId)?.zoneId !== args.zoneId) throw new SenderError('Household is not in zone');
  const row = ctx.db.preparednessTask.insert({ ...args, householdId: args.householdId, id: 0n, status: 'pending', createdAt: ctx.timestamp, completedAt: undefined,
    scenarioRunId: ctx.db.scenarioState.id.find(1)?.runId ?? 0n, recommendationId: '' });
  event(ctx, 'task', row.id, 'created', args.actionType);
});
export const updateTask = db.reducer({ taskId: t.u64(), status: t.string() }, (ctx, { taskId, status }) => {
  requireEmployee(ctx);
  const row = ctx.db.preparednessTask.id.find(taskId);
  if (!row) throw new SenderError('Task not found');
  const transitions: Record<string, string[]> = { pending: ['in_progress', 'completed'], in_progress: ['completed'], completed: [] };
  check(status, transitions[row.status] ?? []);
  ctx.db.preparednessTask.id.update({ ...row, status, completedAt: status === 'completed' ? ctx.timestamp : undefined });
  if (status === 'completed' && row.actionType === 'outreach' && row.householdId !== undefined) {
    const home = ctx.db.household.id.find(row.householdId);
    if (!home) throw new SenderError('Household not found');
    ctx.db.household.id.update({ ...home, lastContactAt: ctx.timestamp });
    refreshDecisions(ctx, row.householdId);
  }
  event(ctx, 'task', taskId, status, row.actionType);
});
export const createRequest = db.reducer({ householdId: t.u64(), needType: t.string(), urgency: t.u8(), people: t.u32() }, (ctx, args) => {
  requireEmployee(ctx);
  check(args.needType, ['food', 'water', 'shelter', 'welfare_check', 'evacuation', 'claims_support', 'fire_smoke_support', 'winter_weather_support']);
  if (!ctx.db.household.id.find(args.householdId)) throw new SenderError('Household not found');
  if (args.urgency < 1 || args.urgency > 5 || args.people < 1) throw new SenderError('Urgency must be 1–5 and people positive');
  const row = ctx.db.helpRequest.insert({ ...args, id: 0n, status: 'open', createdAt: ctx.timestamp, resolvedAt: undefined });
  refreshDecisions(ctx, args.householdId);
  event(ctx, 'request', row.id, 'created', args.needType);
});
export const resolveRequest = db.reducer({ requestId: t.u64() }, (ctx, { requestId }) => {
  requireEmployee(ctx);
  const row = ctx.db.helpRequest.id.find(requestId);
  if (!row || row.status !== 'open') throw new SenderError('Only an unassigned open request can be resolved directly; complete its assignment otherwise');
  ctx.db.helpRequest.id.update({ ...row, status: 'resolved', resolvedAt: ctx.timestamp });
  refreshDecisions(ctx, row.householdId);
  event(ctx, 'request', requestId, 'resolved', 'Assistance recorded without dispatch');
});
function assignTeamToRequest(ctx: Ctx, { requestId, teamId }: { requestId: bigint; teamId: bigint }, automatic = false) {
  requireEmployee(ctx);
  const request = ctx.db.helpRequest.id.find(requestId);
  const team = ctx.db.responseTeam.id.find(teamId);
  if (!request || request.status !== 'open') throw new SenderError('Request is not open');
  if (ctx.db.responseTeamState.teamId.find(teamId)) throw new SenderError('Team reserved for welfare routing');
  if (!team || team.status !== 'available') throw new SenderError('Team is unavailable');
  if ([...ctx.db.assignment.requestId.filter(requestId)].some(a => active(a.status)) || [...ctx.db.assignment.teamId.filter(teamId)].some(a => active(a.status))) throw new SenderError('Active assignment already exists');
  if (!team.capabilities.includes(request.needType) || team.capacity < request.people) throw new SenderError('Team capability or capacity insufficient');
  const home = ctx.db.household.id.find(request.householdId);
  if (!home) throw new SenderError('Household not found');
  const rad = Math.PI / 180;
  const a = Math.sin((home.latitude - team.latitude) * rad / 2) ** 2 + Math.cos(home.latitude * rad) * Math.cos(team.latitude * rad) * Math.sin((home.longitude - team.longitude) * rad / 2) ** 2;
  const distance = 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
  const row = ctx.db.assignment.insert({ id: 0n, requestId, teamId, status: 'assigned', estimatedDistance: distance, estimatedEta: distance / 30 * 60, createdAt: ctx.timestamp, completedAt: undefined });
  ctx.db.helpRequest.id.update({ ...request, status: 'assigned' });
  ctx.db.responseTeam.id.update({ ...team, status: 'assigned' });
  refreshDecisions(ctx, request.householdId);
  event(ctx, 'assignment', row.id, 'assigned', `${automatic ? 'Automatic simulated response to explicit help reply' : 'Human-selected dispatch'}; approximate straight-line km / 30 km/h ETA`);
}
export const assignTeam = db.reducer({ requestId: t.u64(), teamId: t.u64() }, (ctx, args) => assignTeamToRequest(ctx, args));
export const updateAssignment = db.reducer({ assignmentId: t.u64(), status: t.string() }, (ctx, { assignmentId, status }) => {
  requireEmployee(ctx);
  const row = ctx.db.assignment.id.find(assignmentId);
  if (!row || !active(row.status)) throw new SenderError('Assignment is not active');
  check(status, row.status === 'assigned' ? ['in_progress', 'completed', 'cancelled'] : ['completed', 'cancelled']);
  const request = ctx.db.helpRequest.id.find(row.requestId);
  const team = ctx.db.responseTeam.id.find(row.teamId);
  if (!request || !team) throw new SenderError('Missing request or team');
  const finished = status !== 'in_progress';
  ctx.db.assignment.id.update({ ...row, status, completedAt: finished ? ctx.timestamp : undefined });
  ctx.db.helpRequest.id.update({ ...request, status: status === 'completed' ? 'resolved' : status === 'cancelled' ? 'open' : 'in_progress', resolvedAt: status === 'completed' ? ctx.timestamp : undefined });
  ctx.db.responseTeam.id.update({ ...team, status: finished ? 'available' : 'responding' });
  refreshDecisions(ctx, request.householdId);
  event(ctx, 'assignment', assignmentId, status, 'Assignment, request, and team updated atomically');
});
function escalateSynthetic(ctx: Ctx, disasterId: bigint) {
  const row = ctx.db.disaster.id.find(disasterId);
  if (!row || !row.isSimulated) throw new SenderError('Synthetic scenario not found');
  ctx.db.disaster.id.update({ ...row, phase: 'response', updatedAt: ctx.timestamp });
  for (const area of ctx.db.zone.disasterId.filter(row.id)) ctx.db.zone.id.update({ ...area, riskLevel: Math.min(5, area.riskLevel + 1), updatedAt: ctx.timestamp });
  for (const layer of ctx.db.impactLayer.disasterId.filter(row.id)) ctx.db.impactLayer.id.update({ ...layer,
    severity: layer.severity === 'moderate' ? 'high' : 'critical', updatedAt: ctx.timestamp });
  refreshDecisions(ctx);
  event(ctx, 'disaster', row.id, 'escalated', 'Selected simulated hazard severity increased');
}
export const escalateScenario = db.reducer({ disasterId: t.u64() }, (ctx, { disasterId }) => {
  requireEmployee(ctx, true); escalateSynthetic(ctx, disasterId);
});

// Private tables are exposed only through caller-authorized subscription views.
export const disasters = db.view({ public: true }, t.array(disaster.rowType), ctx => ctx.db.employee.identity.find(ctx.sender) ? [...ctx.db.disaster.iter()] : []);
export const zones = db.view({ public: true }, t.array(zone.rowType), ctx => ctx.db.employee.identity.find(ctx.sender) ? [...ctx.db.zone.iter()] : []);
export const households = db.view({ public: true }, t.array(household.rowType), ctx => ctx.db.employee.identity.find(ctx.sender) ? [...ctx.db.household.iter()] : []);
export const requests = db.view({ public: true }, t.array(helpRequest.rowType), ctx => ctx.db.employee.identity.find(ctx.sender) ? [...ctx.db.helpRequest.iter()] : []);
export const teams = db.view({ public: true }, t.array(responseTeam.rowType), ctx => ctx.db.employee.identity.find(ctx.sender) ? [...ctx.db.responseTeam.iter()] : []);
export const assignments = db.view({ public: true }, t.array(assignment.rowType), ctx => ctx.db.employee.identity.find(ctx.sender) ? [...ctx.db.assignment.iter()] : []);
export const tasks = db.view({ public: true }, t.array(preparednessTask.rowType), ctx => ctx.db.employee.identity.find(ctx.sender) ? [...ctx.db.preparednessTask.iter()] : []);
export const activities = db.view({ public: true }, t.array(activityEvent.rowType), ctx => ctx.db.employee.identity.find(ctx.sender) ? [...ctx.db.activityEvent.iter()] : []);
export const impactLayers = db.view({ public: true }, t.array(impactLayer.rowType), ctx => ctx.db.employee.identity.find(ctx.sender) ? activeImpactRows(ctx) : []);

export const decisions = db.view({ public: true }, t.array(decisionSummary.rowType), ctx => ctx.db.employee.identity.find(ctx.sender) ? [...ctx.db.decisionSummary.iter()] : []);
const Info = t.object('ScenarioInfoRow', { id: t.u8(), runId: t.u64(), scenarioId: t.string(), startedAt: t.timestamp(), evaluatedAt: t.timestamp(), canManageScenario: t.bool() });
export const scenarioInfo = db.view({ public: true }, t.array(Info), ctx => {
  const user = ctx.db.employee.identity.find(ctx.sender), row = ctx.db.scenarioState.id.find(1);
  return user && row ? [{ ...row, canManageScenario: user.admin }] : [];
});
const Detail = t.object('HouseholdDecisionRow', { householdId: t.u64(), payload: t.string() });
export const householdDecisions = db.view({ public: true }, { householdId: t.u64() }, t.array(Detail), (ctx, { householdId }) => {
  if (!ctx.db.employee.identity.find(ctx.sender)) return [];
  const result = householdDecision(ctx, householdId); return result ? [result] : [];
});
const TeamDetail = t.object('RequestRecommendationRow', { requestId: t.u64(), payload: t.string() });
export const teamRecommendations = db.view({ public: true }, { requestId: t.u64() }, t.array(TeamDetail), (ctx, { requestId }) => {
  if (!ctx.db.employee.identity.find(ctx.sender) || !ctx.db.helpRequest.id.find(requestId)) return [];
  return [requestRecommendations(ctx, requestId)];
});
export const refreshDecisionSnapshot = db.reducer(ctx => { requireEmployee(ctx); refreshDecisions(ctx); });
export const refreshDecisionClock = db.reducer({ onSchedule: decisionTick }, { timer: decisionTick.rowType }, ctx => {
  if (!ctx.sender.equals(ctx.identity)) throw new SenderError('Scheduled refresh is internal only');
  refreshDecisions(ctx);
});
export const approvePreparedness = db.reducer({ householdId: t.u64(), recommendationId: t.string(), expectedRunId: t.u64() }, (ctx, args) => {
  requireEmployee(ctx);
  const state = ctx.db.scenarioState.id.find(1);
  if (!state || state.runId !== args.expectedRunId) throw new SenderError('Scenario changed; refresh suggestions');
  const detail = householdDecision(ctx, args.householdId);
  const payload = detail ? JSON.parse(detail.payload) : null;
  if (!payload?.preparation.suggestions.some((s: { recommendationId: string }) => s.recommendationId === args.recommendationId)) throw new SenderError('Suggestion no longer eligible or task already exists');
  const home = ctx.db.household.id.find(args.householdId)!;
  const row = ctx.db.preparednessTask.insert({ id: 0n, zoneId: home.zoneId, householdId: home.id, actionType: 'preparedness_information', status: 'pending',
    createdAt: ctx.timestamp, completedAt: undefined, scenarioRunId: state.runId, recommendationId: args.recommendationId });
  event(ctx, 'task', row.id, 'suggestion_approved', args.recommendationId);
});
const ExerciseArgs = { disasterId: t.u64(), expectedRunId: t.u64(), expectedMinute: t.i32() };
export const approveExerciseNotice = db.reducer({ ...ExerciseArgs, message: t.string() }, (ctx, args) => {
  requireEmployee(ctx); sendExerciseNotice(ctx, args);
});
export const advanceExerciseClock = db.reducer(ExerciseArgs, (ctx, args) => {
  requireEmployee(ctx);
  if (advanceExercise(ctx, args)) escalateSynthetic(ctx, args.disasterId);
});
export const recordExerciseReply = db.reducer({ ...ExerciseArgs, householdId: t.u64(), status: t.string() }, (ctx, args) => {
  requireEmployee(ctx); replyToExercise(ctx, args);
});
export const exercises = db.view({ public: true }, t.array(areaExercise.rowType), ctx => ctx.db.employee.identity.find(ctx.sender) ? [...ctx.db.areaExercise.iter()] : []);
export const exerciseReplies = db.view({ public: true }, { disasterId: t.u64() }, t.array(exerciseCheckIn.rowType), (ctx, { disasterId }) =>
  ctx.db.employee.identity.find(ctx.sender) ? [...ctx.db.exerciseCheckIn.disasterId.filter(disasterId)] : []);
const DashboardArgs = { expectedRunId: t.u64(), expectedMinute: t.i32() };
export const approveDashboardNotice = db.reducer({ ...DashboardArgs, areaId: t.u64(), message: t.string() }, (ctx, args) => { requireEmployee(ctx); sendNotice(ctx, args); });
export const replyDashboardNotice = db.reducer({ ...DashboardArgs, householdId: t.u64(), reply: t.string(), areaId: t.option(t.u64()) }, (ctx, args) => {
  requireEmployee(ctx);
  recordReply(ctx, args);
  if (args.reply === 'needs_help') {
    const prepared = prepareAutomaticResponse(ctx, args);
    if (prepared) {
      assignTeamToRequest(ctx, { requestId: prepared.requestId, teamId: prepared.teamId }, true);
      saveResponse(ctx, prepared.state.runId, args.householdId, prepared.requestId);
    }
  }
});
export const advanceDashboardClock = db.reducer({ ...DashboardArgs, step: t.string() }, (ctx, args) => {
  requireEmployee(ctx);
  const state = validateClock(ctx, args);
  const rescues = args.step === 'complete_rescues' ? [...ctx.db.dashboardResponse.iter()]
    .filter(r => r.runId === state.runId)
    .map(r => ctx.db.assignment.id.find(r.assignmentId))
    .filter(r => r && active(r.status)) : [];
  advanceClock(ctx, args);
  if (args.step !== 'complete_rescues') return;
  // Only assignments active before this skip complete; newly queued help starts a new rescue.
  for (const rescue of rescues) if (rescue) updateAssignment(ctx, { assignmentId: rescue.id, status: 'completed' });
  const current = clock(ctx);
  const notices = [...ctx.db.dashboardNotice.iter()].filter(n => n.runId === current.runId && n.phase === 'after')
    .sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id));
  for (const notice of notices) {
    for (const recipient of ctx.db.dashboardRecipient.noticeId.filter(notice.id)) {
      if (recipient.status !== 'needs_help') continue;
      const prepared = prepareAutomaticResponse(ctx, { expectedRunId: current.runId, expectedMinute: current.minute, householdId: recipient.householdId, areaId: notice.areaId });
      if (!prepared) continue;
      assignTeamToRequest(ctx, { requestId: prepared.requestId, teamId: prepared.teamId }, true);
      saveResponse(ctx, current.runId, recipient.householdId, prepared.requestId);
    }
  }
});
export const approveDashboardResponse = db.reducer({ ...DashboardArgs, householdId: t.u64(), teamId: t.u64(), areaId: t.option(t.u64()) }, (ctx, args) => {
  requireEmployee(ctx);
  const prepared = prepareResponse(ctx, args);
  assignTeam(ctx, { requestId: prepared.requestId, teamId: args.teamId });
  saveResponse(ctx, prepared.state.runId, args.householdId, prepared.requestId);
});
export const resetDashboard = db.reducer({ ...DashboardArgs, confirmation: t.string() }, (ctx, args) => {
  requireEmployee(ctx, true); validateClock(ctx, args); resetDemo(ctx, { confirmation: args.confirmation });
});
const DashboardInfo = t.object('DashboardInfoRow', { id: t.u8(), runId: t.u64(), minute: t.i32(), canReset: t.bool() });
export const dashboardState = db.view({ public: true }, t.array(DashboardInfo), ctx => {
  const user = ctx.db.employee.identity.find(ctx.sender); return user ? [{ ...clock(ctx), canReset: user.admin }] : [];
});
export const dashboardNotices = db.view({ public: true }, t.array(dashboardNotice.rowType), ctx =>
  ctx.db.employee.identity.find(ctx.sender) ? [...ctx.db.dashboardNotice.iter()].filter(n => n.runId === clock(ctx).runId) : []);
export const dashboardRecipients = db.view({ public: true }, t.array(dashboardRecipient.rowType), ctx => {
  if (!ctx.db.employee.identity.find(ctx.sender)) return [];
  const notices = new Set([...ctx.db.dashboardNotice.iter()].filter(n => n.runId === clock(ctx).runId).map(n => n.id));
  return [...ctx.db.dashboardRecipient.iter()].filter(r => notices.has(r.noticeId));
});
export const dashboardResponses = db.view({ public: true }, t.array(dashboardResponse.rowType), ctx =>
  ctx.db.employee.identity.find(ctx.sender) ? [...ctx.db.dashboardResponse.iter()].filter(r => r.runId === clock(ctx).runId) : []);

// Welfare routing uses its own queue; no fabricated assistance requests.
export const setRoutingWorker = db.reducer({ identity: t.identity(), enabled: t.bool() }, (ctx, args) => {
  requireEmployee(ctx, true);
  if (args.enabled && !ctx.db.routingWorker.identity.find(args.identity)) ctx.db.routingWorker.insert({ identity: args.identity });
  if (!args.enabled) ctx.db.routingWorker.identity.delete(args.identity);
});
export const startResponseDemo = db.reducer({ zoneId: t.u64(), teamIds: t.array(t.u64()), stagingLatitude: t.f64(), stagingLongitude: t.f64() }, (ctx, args) => { requireEmployee(ctx); createRun(ctx, args); });
export const claimRoutingLease = db.reducer({ runId: t.u64() }, (ctx, { runId }) => {
  if (!ctx.db.routingWorker.identity.find(ctx.sender)) throw new SenderError('Routing worker authorization required');
  const run = runOf(ctx, runId), now = ctx.timestamp.microsSinceUnixEpoch;
  if (run.leaseUntil > now) throw new SenderError('Run already leased; renew the existing lease');
  ctx.db.responseRun.id.update({ ...run, leaseOwner: ctx.sender, leaseUntil: now + 30000000n, fence: run.fence + 1n });
});
export const renewRoutingLease = db.reducer({ runId: t.u64(), fence: t.u64() }, (ctx, args) => {
  const run = workerRun(ctx, args.runId, args.fence);
  ctx.db.responseRun.id.update({ ...run, leaseUntil: ctx.timestamp.microsSinceUnixEpoch + 30000000n, holdUntil: run.holdUntil > ctx.timestamp.microsSinceUnixEpoch ? ctx.timestamp.microsSinceUnixEpoch + 30000000n : run.holdUntil });
});
export const updateResponseSettings = db.reducer({ runId: t.u64(), config: t.string() }, (ctx, args) => {
  requireEmployee(ctx, true);
  const run = runOf(ctx, args.runId), config = configOf(args.config), previous = configOf(run.config);
  if (config.householdCount !== previous.householdCount || config.teamCount !== previous.teamCount) throw new SenderError('Fixture size changes require reset');
  ctx.db.responseRun.id.update({ ...run, elapsedMinutes: minuteOf(ctx, run), anchorMicros: ctx.timestamp.microsSinceUnixEpoch, config: JSON.stringify(config), configVersion: run.configVersion + 1, epoch: run.epoch + 1n });
});
export const pauseResponseDemo = db.reducer({ runId: t.u64() }, (ctx, { runId }) => {
  requireEmployee(ctx); const run = runOf(ctx, runId);
  ctx.db.responseRun.id.update({ ...run, elapsedMinutes: minuteOf(ctx, run), anchorMicros: ctx.timestamp.microsSinceUnixEpoch, status: 'paused' });
});
export const resumeResponseDemo = db.reducer({ runId: t.u64() }, (ctx, { runId }) => {
  requireEmployee(ctx); const run = runOf(ctx, runId);
  if (run.status !== 'paused') throw new SenderError('Run is not paused');
  ctx.db.responseRun.id.update({ ...run, anchorMicros: ctx.timestamp.microsSinceUnixEpoch, status: 'running' });
});
export const resetResponseDemo = db.reducer({ runId: t.u64() }, (ctx, { runId }) => {
  requireEmployee(ctx); const run = runOf(ctx, runId);
  event(ctx, 'zone', run.zoneId, 'routing_released', 'Welfare routing reset; reserved teams released');
  if ([...ctx.db.welfareVisit.runId.filter(runId)].some(v => v.state === 'in_progress')) throw new SenderError('Complete active checks before reset');
  for (const visit of [...ctx.db.welfareVisit.runId.filter(runId)]) if (!terminal(visit.state)) ctx.db.welfareVisit.id.update({ ...visit, state: 'cancelled', teamId: undefined, notice: 'Run reset' });
  if (run.ownsFixture) {
    for (const home of [...ctx.db.household.zoneId.filter(run.zoneId)]) {
      for (const request of [...ctx.db.helpRequest.householdId.filter(home.id)]) {
        const assignments = [...ctx.db.assignment.requestId.filter(request.id)];
        if (assignments.some(a => active(a.status))) throw new SenderError('Complete manual assistance before fixture reset');
        for (const assignment of assignments) ctx.db.assignment.id.delete(assignment.id);
        ctx.db.helpRequest.id.delete(request.id);
      }
      for (const round of [...ctx.db.exerciseCheckIn.householdId.filter(home.id)]) ctx.db.exerciseCheckIn.id.delete(round.id);
      for (const task of [...ctx.db.preparednessTask.byHousehold.filter(home.id)]) ctx.db.preparednessTask.id.delete(task.id);
      ctx.db.decisionSummary.householdId.delete(home.id);
      ctx.db.household.id.delete(home.id);
    }
    ctx.db.areaExercise.disasterId.delete(run.disasterId);
    ctx.db.zone.id.delete(run.zoneId); ctx.db.disaster.id.delete(run.disasterId);
  }
  for (const team of [...ctx.db.responseTeamState.runId.filter(runId)]) {
    ctx.db.responseTeamState.teamId.delete(team.teamId);
    if (run.ownsFixture) ctx.db.responseTeam.id.delete(team.teamId);
  }
  ctx.db.responseRun.id.update({ ...run, status: 'reset', epoch: run.epoch + 1n, fence: run.fence + 1n, leaseUntil: 0n });
});
const ProposedRoute = t.object('ProposedResponseRoute', { teamId: t.u64(), positionVersion: t.u64(), visitIds: t.array(t.u64()), arrivalMinutes: t.array(t.f64()), returnMinute: t.f64() });
export const publishResponsePlan = db.reducer({ runId: t.u64(), fence: t.u64(), epoch: t.u64(), configVersion: t.u32(), routes: t.array(ProposedRoute), provider: t.string(), uncovered: t.option(t.array(t.object('UncoveredVisit', { visitId: t.u64(), reason: t.string() }))) }, (ctx, args) => {
  const run = workerRun(ctx, args.runId, args.fence), config = configOf(run.config), now = minuteOf(ctx, run);
  if (run.epoch !== args.epoch || run.configVersion !== args.configVersion) throw new SenderError('Stale response plan');
  const seen = new Set<bigint>(), teams = new Set<bigint>();
  for (const route of args.routes) {
    const state = ctx.db.responseTeamState.teamId.find(route.teamId), team = ctx.db.responseTeam.id.find(route.teamId);
    if (teams.has(route.teamId) || !state || state.runId !== run.id || !state.available || state.positionVersion !== route.positionVersion || !team || team.status !== 'available' || !team.capabilities.includes('welfare_check') || [...ctx.db.assignment.teamId.filter(route.teamId)].some(a => active(a.status))) throw new SenderError('Team/origin changed');
    teams.add(route.teamId);
    if (route.visitIds.length !== route.arrivalMinutes.length || !Number.isFinite(route.returnMinute) || route.returnMinute < now || route.returnMinute > config.shiftMinutes) throw new SenderError('Invalid shift timing');
    let earliest = now, unknownSeen = false;
    route.visitIds.forEach((id, i) => {
      const visit = ctx.db.welfareVisit.id.find(id), home = visit && ctx.db.household.id.find(visit.householdId);
      if (!visit || visit.runId !== run.id || terminal(visit.state) || !home || home.checkInStatus === 'safe' && visit.state !== 'in_progress' || seen.has(id)) throw new SenderError('Ineligible or duplicate visit');
      if (visit.state === 'in_progress' && (visit.teamId !== route.teamId || i !== 0)) throw new SenderError('Active service must remain first');
      if (unknownSeen && visit.priority === 'urgent') throw new SenderError('Urgent stop must precede unknown stops');
      unknownSeen ||= visit.priority === 'unknown' && visit.state !== 'in_progress'; seen.add(id);
      const arrival = route.arrivalMinutes[i];
      if (!Number.isFinite(arrival) || arrival < earliest) throw new SenderError('Invalid visit timing');
      earliest = visit.state === 'in_progress' ? Math.max(now, (visit.startedMinute ?? now) + visit.serviceMinutes) : arrival + config.visitMinutes;
    });
    if (route.returnMinute < earliest) throw new SenderError('Return precedes service completion');
  }
  for (const visit of ctx.db.welfareVisit.runId.filter(run.id)) if (visit.state === 'in_progress' && !seen.has(visit.id)) throw new SenderError('Cannot drop active service');
  for (const visit of [...ctx.db.welfareVisit.runId.filter(run.id)]) if (!terminal(visit.state) && visit.state !== 'in_progress') ctx.db.welfareVisit.id.update({ ...visit, state: 'pending', teamId: undefined, notice: seen.has(visit.id) ? '' : `Unassigned: ${args.uncovered?.find(u => u.visitId === visit.id)?.reason.slice(0, 200) ?? 'no feasible route published'}` });
  for (const old of [...ctx.db.teamRoute.runId.filter(run.id)]) ctx.db.teamRoute.id.delete(old.id);
  for (const state of [...ctx.db.responseTeamState.runId.filter(run.id)]) if (state.mode !== 'in_progress') ctx.db.responseTeamState.teamId.update({ ...state, currentVisitId: undefined, mode: 'holding' });
  for (const route of args.routes) {
    ctx.db.teamRoute.insert({ id: 0n, runId: run.id, teamId: route.teamId, version: run.planVersion + 1n, planningEpoch: run.epoch, visitIds: route.visitIds, returnMinute: route.returnMinute, status: 'ready', provider: args.provider, error: '' });
    route.visitIds.forEach((id, sequence) => { const visit = ctx.db.welfareVisit.id.find(id)!; ctx.db.welfareVisit.id.update({ ...visit, teamId: route.teamId, sequence, arrivalMinute: route.arrivalMinutes[sequence], serviceMinutes: visit.state === 'in_progress' ? visit.serviceMinutes : config.visitMinutes, state: visit.state === 'in_progress' ? visit.state : 'queued', notice: visit.state === 'in_progress' ? visit.notice : visit.priority === 'urgent' && route.arrivalMinutes[sequence] - visit.eligibleSince > config.urgentTargetMinutes ? 'Urgent arrival target cannot be met; dispatcher escalation required' : '' }); });
  }
  ctx.db.responseRun.id.update({ ...run, planVersion: run.planVersion + 1n, planningError: '', holdUntil: 0n, elapsedMinutes: now, anchorMicros: ctx.timestamp.microsSinceUnixEpoch });
});
export const responseRuns = db.view({ public: true }, t.array(responseRun.rowType), ctx => ctx.db.employee.identity.find(ctx.sender) || ctx.db.routingWorker.identity.find(ctx.sender) ? [...ctx.db.responseRun.iter()] : []);
export const welfareVisits = db.view({ public: true }, t.array(welfareVisit.rowType), ctx => ctx.db.employee.identity.find(ctx.sender) || ctx.db.routingWorker.identity.find(ctx.sender) ? [...ctx.db.welfareVisit.iter()] : []);
export const teamRoutes = db.view({ public: true }, t.array(teamRoute.rowType), ctx => ctx.db.employee.identity.find(ctx.sender) || ctx.db.routingWorker.identity.find(ctx.sender) ? [...ctx.db.teamRoute.iter()] : []);
export const responseTeamStates = db.view({ public: true }, t.array(responseTeamState.rowType), ctx => ctx.db.employee.identity.find(ctx.sender) || ctx.db.routingWorker.identity.find(ctx.sender) ? [...ctx.db.responseTeamState.iter()] : []);
export const advanceResponseSimulation = db.reducer({ runId: t.u64(), fence: t.u64(), teamId: t.u64(), routeVersion: t.u64(), sequence: t.u64(), latitude: t.f64(), longitude: t.f64(), action: t.string(), outcome: t.string() }, (ctx, args) => {
  const run = workerRun(ctx, args.runId, args.fence), state = ctx.db.responseTeamState.teamId.find(args.teamId);
  const route = [...ctx.db.teamRoute.runId.filter(run.id)].find(r => r.teamId === args.teamId);
  if (run.status !== 'running' || !state || !state.available || state.runId !== run.id || !route || route.version !== args.routeVersion || args.sequence <= state.tickSequence) throw new SenderError('Stale simulation update');
  if (!Number.isFinite(args.latitude) || Math.abs(args.latitude) > 90 || !Number.isFinite(args.longitude) || Math.abs(args.longitude) > 180) throw new SenderError('Invalid position');
  check(args.action, ['move', 'arrive', 'complete', 'return', 'return_move']);
  if (run.holdUntil > ctx.timestamp.microsSinceUnixEpoch && args.action !== 'complete') throw new SenderError('Planning hold');
  const now = minuteOf(ctx, run), next = route.visitIds.map(id => ctx.db.welfareVisit.id.find(id)).find(v => v && !terminal(v.state));
  if (route.planningEpoch !== run.epoch && next?.state !== 'in_progress') throw new SenderError('Plan invalidated; hold position');
  let currentVisitId = state.currentVisitId, mode = state.mode;
  if (args.action === 'return' || args.action === 'return_move') {
    if (next || args.action === 'return' && now < route.returnMinute) throw new SenderError('Return not due');
    mode = args.action === 'return' ? 'idle' : 'returning'; currentVisitId = undefined;
  } else {
    if (!next || next.teamId !== args.teamId) throw new SenderError('No current destination');
    // Invalidation freezes travel until a current-epoch plan replaces it.
    if (next.state !== 'in_progress' && ctx.db.household.id.find(next.householdId)?.checkInStatus === 'safe') throw new SenderError('Destination cancelled');
    if (args.action === 'arrive') {
      if (!['queued','en_route'].includes(next.state) || now < next.arrivalMinute) throw new SenderError('Arrival not due');
      ctx.db.welfareVisit.id.update({ ...next, state: 'in_progress', startedMinute: now }); mode = 'in_progress'; currentVisitId = next.id;
    } else if (args.action === 'complete') {
      if (next.state !== 'in_progress' || now < (next.startedMinute ?? now) + next.serviceMinutes) throw new SenderError('Service not complete');
      if (!args.outcome.trim() || args.outcome.length > 500) throw new SenderError('Explicit outcome required');
      ctx.db.welfareVisit.id.update({ ...next, state: 'completed', outcome: args.outcome }); mode = 'holding'; currentVisitId = undefined;
      ctx.db.responseRun.id.update({ ...run, epoch: run.epoch + 1n });
    } else {
      if (next.state === 'in_progress') throw new SenderError('Cannot move during service');
      ctx.db.welfareVisit.id.update({ ...next, state: 'en_route' }); mode = 'en_route'; currentVisitId = next.id;
    }
  }
  const exercise = ctx.db.areaExercise.disasterId.find(run.disasterId);
  if (exercise && exercise.minute < Math.floor(run.startMinute + now)) ctx.db.areaExercise.disasterId.update({ ...exercise, minute: Math.floor(run.startMinute + now) });
  const team = ctx.db.responseTeam.id.find(args.teamId);
  if (!team) throw new SenderError('Team missing');
  ctx.db.responseTeam.id.update({ ...team, latitude: args.latitude, longitude: args.longitude });
  ctx.db.responseTeamState.teamId.update({ ...state, positionVersion: state.positionVersion + 1n, updatedAt: ctx.timestamp, tickSequence: args.sequence, currentVisitId, mode });
});

export const seedResponseRoutingDemo = db.reducer(ctx => { requireEmployee(ctx); seedRoutingFixture(ctx); });
export const setResponseTeamAvailability = db.reducer({ runId: t.u64(), teamId: t.u64(), available: t.bool() }, (ctx, args) => {
  requireEmployee(ctx); const run = runOf(ctx, args.runId), team = ctx.db.responseTeamState.teamId.find(args.teamId);
  if (!team || team.runId !== run.id) throw new SenderError('Team not in run');
  const activeVisit = team.currentVisitId === undefined ? undefined : ctx.db.welfareVisit.id.find(team.currentVisitId);
  if (!args.available && activeVisit?.state === 'in_progress') throw new SenderError('Complete active service before making team unavailable');
  if (!args.available) for (const visit of [...ctx.db.welfareVisit.runId.filter(run.id)]) if (visit.teamId === args.teamId && !terminal(visit.state)) ctx.db.welfareVisit.id.update({ ...visit, state: 'pending', teamId: undefined, notice: 'Team unavailable; awaiting reassignment' });
  ctx.db.responseTeamState.teamId.update({ ...team, available: args.available, currentVisitId: undefined, mode: 'holding' });
  ctx.db.responseRun.id.update({ ...run, epoch: run.epoch + 1n });
});

export const holdResponsePlanning = db.reducer({ runId: t.u64(), fence: t.u64() }, (ctx, args) => {
  const run = workerRun(ctx, args.runId, args.fence);
  ctx.db.responseRun.id.update({ ...run, elapsedMinutes: minuteOf(ctx, run), anchorMicros: ctx.timestamp.microsSinceUnixEpoch, holdUntil: run.leaseUntil });
});
export const responsePlanningFailed = db.reducer({ runId: t.u64(), fence: t.u64(), message: t.string() }, (ctx, args) => {
  const run = workerRun(ctx, args.runId, args.fence);
  for (const route of [...ctx.db.teamRoute.runId.filter(run.id)]) ctx.db.teamRoute.id.update({ ...route, status: 'stale', error: args.message.slice(0, 300) });
  ctx.db.responseRun.id.update({ ...run, planningError: args.message.slice(0, 300), elapsedMinutes: minuteOf(ctx, run), anchorMicros: ctx.timestamp.microsSinceUnixEpoch, holdUntil: 0n });
});
export const routingHouseholds = db.view({ public: true }, t.array(household.rowType), ctx => {
  if (!ctx.db.employee.identity.find(ctx.sender) && !ctx.db.routingWorker.identity.find(ctx.sender)) return [];
  const zones = new Set([...ctx.db.responseRun.iter()].filter(r => r.status !== 'reset').map(r => r.zoneId));
  return [...ctx.db.household.iter()].filter(h => zones.has(h.zoneId));
});
export const routingTeams = db.view({ public: true }, t.array(responseTeam.rowType), ctx => {
  if (!ctx.db.employee.identity.find(ctx.sender) && !ctx.db.routingWorker.identity.find(ctx.sender)) return [];
  return [...ctx.db.responseTeamState.iter()].flatMap(s => { const team = ctx.db.responseTeam.id.find(s.teamId); return team ? [team] : []; });
});

// Employee-managed team enrollment; existing shared teams can be linked without reseeding.
export const registerDispatchTeam = db.reducer({ teamId: t.option(t.u64()), name: t.string(), disasterId: t.u64(), householdId: t.u64(), latitude: t.f64(), longitude: t.f64(), dispatcher: t.identity() }, (ctx, args) => {
  requireEmployee(ctx);
  const home = ctx.db.household.id.find(args.householdId);
  const area = home && ctx.db.zone.id.find(home.zoneId);
  if (!home || area?.disasterId !== args.disasterId || !ctx.db.disaster.id.find(args.disasterId)) throw new SenderError('Select a household in this disaster');
  if (!Number.isFinite(args.latitude) || Math.abs(args.latitude)>90 || !Number.isFinite(args.longitude) || Math.abs(args.longitude)>180) throw new SenderError('Invalid coordinates');
  const rad=Math.PI/180, a=Math.sin((home.latitude-args.latitude)*rad/2)**2+Math.cos(home.latitude*rad)*Math.cos(args.latitude*rad)*Math.sin((home.longitude-args.longitude)*rad/2)**2;
  if (6371*2*Math.asin(Math.sqrt(Math.min(1,a)))>25) throw new SenderError('Team must be within 25 km of the selected affected household');
  if (ctx.db.dispatcherMembership.identity.find(args.dispatcher)) throw new SenderError('Dispatcher already has a team');
  let team = args.teamId === undefined ? undefined : ctx.db.responseTeam.id.find(args.teamId);
  if (args.teamId !== undefined && !team) throw new SenderError('Team not found');
  if (team && ([...ctx.db.dispatcherMembership.iter()].some(m=>m.teamId===team!.id) || ctx.db.responseTeamState.teamId.find(team.id) || [...ctx.db.assignment.teamId.filter(team.id)].some(a=>active(a.status)))) throw new SenderError('Team is already deployed');
  if (!team) {
    if (!args.name.trim()) throw new SenderError('Team name required');
    const id=[...ctx.db.responseTeam.iter()].reduce((n,t)=>t.id>=n?t.id+1n:n,1n);
    team=ctx.db.responseTeam.insert({id,name:args.name.trim(),latitude:args.latitude,longitude:args.longitude,status:'available',capacity:0,capabilities:['welfare_check']});
  } else ctx.db.responseTeam.id.update({...team,latitude:args.latitude,longitude:args.longitude});
  ctx.db.dispatcherMembership.insert({identity:args.dispatcher,teamId:team.id,disasterId:args.disasterId});
  event(ctx,'team',team.id,'registered','Dispatcher linked to disaster response team');
});
export const setDispatchApproval = db.reducer({ householdIds: t.array(t.u64()), approved: t.bool() }, (ctx, args) => {
  requireEmployee(ctx);
  if (!args.householdIds.length || args.householdIds.length>200) throw new SenderError('Select 1–200 households');
  for (const householdId of new Set(args.householdIds)) {
    const home=ctx.db.household.id.find(householdId), area=home&&ctx.db.zone.id.find(home.zoneId);
    if (!home || !area) throw new SenderError('Household not found');
    if (args.approved && home.checkInStatus==='safe') throw new SenderError('Safe households do not require welfare dispatch');
    const id=`${area.disasterId}:${householdId}`, previous=ctx.db.dispatchApproval.id.find(id);
    const row={id,householdId,disasterId:area.disasterId,approved:args.approved,actor:ctx.sender,updatedAt:ctx.timestamp};
    if(previous)ctx.db.dispatchApproval.id.update(row);else ctx.db.dispatchApproval.insert(row);
    event(ctx,'household',householdId,args.approved?'dispatch_approved':'dispatch_withdrawn','Employee welfare dispatch decision recorded');
  }
});
export const myDispatchTeam = db.view({public:true},t.array(dispatcherMembership.rowType),ctx=>{
  const row=ctx.db.dispatcherMembership.identity.find(ctx.sender);return row?[row]:[];
});
export const dispatchApprovals = db.view({public:true},t.array(dispatchApproval.rowType),ctx=>ctx.db.employee.identity.find(ctx.sender)?[...ctx.db.dispatchApproval.iter()]:[]);

export const removeAlaskaHawaii = db.reducer(ctx => { requireEmployee(ctx, true); removeNoncontiguous(ctx); });

const HazardUpdateInput = t.object('HazardUpdateInput', {
  areaId:t.string(), version:t.u32(), hazard:t.string(), severity:t.string(), longitude:t.f64(), latitude:t.f64(),
  observedAt:t.string(), expiresAt:t.string(), source:t.string(), dataKind:t.string(), status:t.string(), radiiMeters:t.option(t.array(t.f64())),
});
export const ingestHazardEvent = db.reducer({ update: HazardUpdateInput }, (ctx, { update }) => { requireEmployee(ctx, true); ingestHazard(ctx, update); });

export const dummyWeatherState = db.view({public:true},t.array(hazardFeedState.rowType),ctx=>ctx.db.employee.identity.find(ctx.sender)?[...ctx.db.hazardFeedState.iter()]:[]);
export const setDummyWeatherFeed = db.reducer({areaId:t.u64(),expectedRunId:t.u64(),enabled:t.bool(),intervalSeconds:t.u32()},(ctx,args)=>{requireEmployee(ctx);configureDummyFeed(ctx,args);});
export const advanceDummyWeather = db.reducer({areaId:t.u64(),expectedRunId:t.u64()},(ctx,args)=>{requireEmployee(ctx);advanceDummyFeed(ctx,args);});
export const tickDummyWeather = db.reducer({onSchedule:hazardFeedTick},{timer:hazardFeedTick.rowType},ctx=>{
  if(!ctx.sender.equals(ctx.identity))throw new SenderError('Weather timer is internal only');
  const state=ctx.db.hazardFeedState.id.find(1);
  if(state?.enabled)advanceDummyFeed(ctx,{areaId:state.areaId,expectedRunId:ctx.db.scenarioState.id.find(1)?.runId ?? 0n});
});
