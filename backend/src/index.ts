import { t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import db, { disaster, zone, household, helpRequest, responseTeam, assignment, preparednessTask, activityEvent, impactLayer } from './schema';
import { seed, resetOperationalData } from './seed';
import { ScheduleAt } from 'spacetimedb';
import { decisionSummary, scenarioState, decisionTick } from './schema';
import { refreshDecisions, householdDecision, requestRecommendations } from './decisions';
import { areaExercise, exerciseCheckIn } from './schema';
import { advanceExercise, sendExerciseNotice, replyToExercise } from './exercise';
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
  resetOperationalData(ctx);
  event(ctx, 'disaster', 1n, 'reset', 'Synthetic scenario reset; memberships and history preserved');
});
export const updateCheckIn = db.reducer({ householdId: t.u64(), status: t.string() }, (ctx, { householdId, status }) => {
  requireEmployee(ctx);
  check(status, ['unknown', 'safe', 'needs_help', 'urgent']);
  const row = ctx.db.household.id.find(householdId);
  if (!row) throw new SenderError('Household not found');
  ctx.db.household.id.update({ ...row, checkInStatus: status });
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
export const assignTeam = db.reducer({ requestId: t.u64(), teamId: t.u64() }, (ctx, { requestId, teamId }) => {
  requireEmployee(ctx);
  const request = ctx.db.helpRequest.id.find(requestId);
  const team = ctx.db.responseTeam.id.find(teamId);
  if (!request || request.status !== 'open') throw new SenderError('Request is not open');
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
  event(ctx, 'assignment', row.id, 'assigned', 'Human-selected dispatch; approximate straight-line km / 30 km/h ETA');
});
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
export const impactLayers = db.view({ public: true }, t.array(impactLayer.rowType), ctx => ctx.db.employee.identity.find(ctx.sender) ? [...ctx.db.impactLayer.iter()] : []);

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
