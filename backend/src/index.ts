import { t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import db, { disaster, zone, household, helpRequest, responseTeam, assignment, preparednessTask, activityEvent, impactLayer } from './schema';
import { seed } from './seed';
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
  for (const row of [...ctx.db.assignment.iter()]) ctx.db.assignment.id.delete(row.id);
  for (const row of [...ctx.db.helpRequest.iter()]) ctx.db.helpRequest.id.delete(row.id);
  for (const row of [...ctx.db.preparednessTask.iter()]) ctx.db.preparednessTask.id.delete(row.id);
  for (const row of [...ctx.db.household.iter()]) ctx.db.household.id.delete(row.id);
  for (const row of [...ctx.db.responseTeam.iter()]) ctx.db.responseTeam.id.delete(row.id);
  for (const row of [...ctx.db.impactLayer.iter()]) ctx.db.impactLayer.id.delete(row.id);
  for (const row of [...ctx.db.zone.iter()]) ctx.db.zone.id.delete(row.id);
  for (const row of [...ctx.db.disaster.iter()]) ctx.db.disaster.id.delete(row.id);
  // Preserve durable history across resets.
  seed(ctx);
  event(ctx, 'disaster', 1n, 'reset', 'Synthetic scenario reset; memberships and history preserved');
});
export const updateCheckIn = db.reducer({ householdId: t.u64(), status: t.string() }, (ctx, { householdId, status }) => {
  requireEmployee(ctx);
  check(status, ['unknown', 'safe', 'needs_help', 'urgent']);
  const row = ctx.db.household.id.find(householdId);
  if (!row) throw new SenderError('Household not found');
  ctx.db.household.id.update({ ...row, checkInStatus: status });
  event(ctx, 'household', householdId, 'check_in', status);
});
export const recordOutreach = db.reducer({ householdId: t.u64() }, (ctx, { householdId }) => {
  requireEmployee(ctx);
  const row = ctx.db.household.id.find(householdId);
  if (!row) throw new SenderError('Household not found');
  ctx.db.household.id.update({ ...row, lastContactAt: ctx.timestamp });
  event(ctx, 'household', householdId, 'contacted', 'Simulated outreach recorded');
});
export const createTask = db.reducer({ zoneId: t.u64(), householdId: t.option(t.u64()), actionType: t.string() }, (ctx, args) => {
  requireEmployee(ctx);
  check(args.actionType, ['outreach', 'preparedness_information', 'shelter_options', 'position_supplies', 'shelter_in_place', 'infrastructure_check', 'evacuation_preparation', 'smoke_protection', 'winter_preparation', 'flood_preparation']);
  if (!ctx.db.zone.id.find(args.zoneId)) throw new SenderError('Zone not found');
  if (args.householdId !== undefined && ctx.db.household.id.find(args.householdId)?.zoneId !== args.zoneId) throw new SenderError('Household is not in zone');
  const row = ctx.db.preparednessTask.insert({ ...args, householdId: args.householdId, id: 0n, status: 'pending', createdAt: ctx.timestamp, completedAt: undefined });
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
  }
  event(ctx, 'task', taskId, status, row.actionType);
});
export const createRequest = db.reducer({ householdId: t.u64(), needType: t.string(), urgency: t.u8(), people: t.u32() }, (ctx, args) => {
  requireEmployee(ctx);
  check(args.needType, ['food', 'water', 'shelter', 'welfare_check', 'evacuation', 'claims_support', 'fire_smoke_support', 'winter_weather_support']);
  if (!ctx.db.household.id.find(args.householdId)) throw new SenderError('Household not found');
  if (args.urgency < 1 || args.urgency > 5 || args.people < 1) throw new SenderError('Urgency must be 1–5 and people positive');
  const row = ctx.db.helpRequest.insert({ ...args, id: 0n, status: 'open', createdAt: ctx.timestamp, resolvedAt: undefined });
  event(ctx, 'request', row.id, 'created', args.needType);
});
export const resolveRequest = db.reducer({ requestId: t.u64() }, (ctx, { requestId }) => {
  requireEmployee(ctx);
  const row = ctx.db.helpRequest.id.find(requestId);
  if (!row || row.status !== 'open') throw new SenderError('Only an unassigned open request can be resolved directly; complete its assignment otherwise');
  ctx.db.helpRequest.id.update({ ...row, status: 'resolved', resolvedAt: ctx.timestamp });
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
  event(ctx, 'assignment', assignmentId, status, 'Assignment, request, and team updated atomically');
});
export const escalateScenario = db.reducer({ disasterId: t.u64() }, (ctx, { disasterId }) => {
  requireEmployee(ctx, true);
  const row = ctx.db.disaster.id.find(disasterId);
  if (!row || !row.isSimulated) throw new SenderError('Synthetic scenario not found');
  ctx.db.disaster.id.update({ ...row, phase: 'response', updatedAt: ctx.timestamp });
  for (const area of ctx.db.zone.disasterId.filter(row.id)) ctx.db.zone.id.update({ ...area, riskLevel: Math.min(5, area.riskLevel + 1), updatedAt: ctx.timestamp });
  event(ctx, 'disaster', row.id, 'escalated', 'Selected simulated hazard severity increased');
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
