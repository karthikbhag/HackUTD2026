import { schema, table, t } from 'spacetimedb/server';

export const employee = table({ name: 'employee' }, {
  identity: t.identity().primaryKey(), admin: t.bool(),
});
export const disaster = table({ name: 'disaster' }, {
  id: t.u64().primaryKey(), name: t.string(), type: t.string(), phase: t.string(),
  source: t.string(), isSimulated: t.bool(), updatedAt: t.timestamp(),
});
export const zone = table({ name: 'zone' }, {
  id: t.u64().primaryKey(), disasterId: t.u64().index('btree'), name: t.string(),
  level: t.string(), parentZoneId: t.option(t.u64()), boundary: t.string(),
  riskLevel: t.u8(), updatedAt: t.timestamp(),
});
export const household = table({ name: 'household' }, {
  id: t.u64().primaryKey(), zoneId: t.u64().index('btree'), displayName: t.string(),
  latitude: t.f64(), longitude: t.f64(), isCustomer: t.bool(), checkInStatus: t.string(),
  vulnerabilityFlags: t.array(t.string()), lastContactAt: t.option(t.timestamp()),
});
export const helpRequest = table({ name: 'help_request' }, {
  id: t.u64().primaryKey().autoInc(), householdId: t.u64().index('btree'),
  needType: t.string(), urgency: t.u8(), people: t.u32(), status: t.string(),
  createdAt: t.timestamp(), resolvedAt: t.option(t.timestamp()),
});
export const responseTeam = table({ name: 'response_team' }, {
  id: t.u64().primaryKey(), name: t.string(), latitude: t.f64(), longitude: t.f64(),
  status: t.string(), capacity: t.u32(), capabilities: t.array(t.string()),
});
export const assignment = table({ name: 'assignment' }, {
  id: t.u64().primaryKey().autoInc(), requestId: t.u64().index('btree'), teamId: t.u64().index('btree'),
  status: t.string(), estimatedDistance: t.f64(), estimatedEta: t.f64(),
  createdAt: t.timestamp(), completedAt: t.option(t.timestamp()),
});
export const preparednessTask = table({ name: 'preparedness_task', indexes: [{ accessor: 'byHousehold', algorithm: 'btree', columns: ['householdId'] }] }, {
  id: t.u64().primaryKey().autoInc(), zoneId: t.u64().index('btree'), householdId: t.option(t.u64()),
  actionType: t.string(), status: t.string(), createdAt: t.timestamp(), completedAt: t.option(t.timestamp()),
  scenarioRunId: t.u64().default(0n), recommendationId: t.string().default(''),
});
export const activityEvent = table({ name: 'activity_event' }, {
  id: t.u64().primaryKey().autoInc(), entityType: t.string(), entityId: t.u64(), action: t.string(),
  actorId: t.identity(), timestamp: t.timestamp(), summary: t.string(),
});
export const impactLayer = table({ name: 'impact_layer' }, {
  id: t.string().primaryKey(), disasterId: t.u64().index('btree'), contextZoneId: t.u64(),
  hazardType: t.string(), component: t.string(), severity: t.string(), severityBasis: t.string(),
  geometry: t.string(), dataKind: t.string(), isSimulated: t.bool(), source: t.string(),
  updatedAt: t.timestamp(), label: t.string(), limitations: t.string(),
  recommendationIds: t.array(t.string()).default([]),
});
export const scenarioState = table({ name: 'scenario_state' }, {
  id: t.u8().primaryKey(), runId: t.u64(), scenarioId: t.string(), startedAt: t.timestamp(), evaluatedAt: t.timestamp(),
});
export const recommendationTemplate = table({ name: 'recommendation_template' }, {
  id: t.string().primaryKey(), hazardType: t.string(), title: t.string(), description: t.string(),
  guidanceUrl: t.string(), guidanceCheckedOn: t.string(), sourceLabel: t.string(),
});
export const decisionSummary = table({ name: 'decision_summary' }, {
  householdId: t.u64().primaryKey(), runId: t.u64(), score: t.u32(), overlooked: t.bool(),
  needsFollowUp: t.bool(), highestSeverity: t.string(), layerIds: t.array(t.string()), computedAt: t.timestamp(),
  highestUrgency: t.u8(), lastContactMicros: t.option(t.u64()),
});
export const decisionTick = table({ name: 'decision_tick' }, {
  scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(),
});
export const areaExercise = table({ name: 'area_exercise' }, {
  disasterId: t.u64().primaryKey(), runId: t.u64(), minute: t.i32(),
  preSent: t.bool(), postSent: t.bool(), preMessage: t.string(), postMessage: t.string(),
});
export const exerciseCheckIn = table({ name: 'exercise_check_in' }, {
  id: t.string().primaryKey(), disasterId: t.u64().index('btree'), householdId: t.u64().index('btree'),
  runId: t.u64(), phase: t.string(), status: t.string(), sentAtMinute: t.i32(), deadlineMinute: t.i32(),
  replyAtMinute: t.option(t.i32()), requestId: t.option(t.u64()),
});
export const responseRun = table({ name: 'response_run' }, {
  id: t.u64().primaryKey().autoInc(), disasterId: t.u64(), zoneId: t.u64(), scenarioRunId: t.u64(),
  ownsFixture: t.bool(), config: t.string(), configVersion: t.u32(), epoch: t.u64(), planVersion: t.u64(),
  status: t.string(), elapsedMinutes: t.f64(), anchorMicros: t.u64(), startMinute: t.f64(),
  stagingLatitude: t.f64(), stagingLongitude: t.f64(),
  holdUntil: t.u64(), leaseOwner: t.option(t.identity()), leaseUntil: t.u64(), fence: t.u64(), planningError: t.string().default(''),
});
export const welfareVisit = table({ name: 'welfare_visit' }, {
  id: t.u64().primaryKey().autoInc(), runId: t.u64().index('btree'), householdId: t.u64().index('btree'),
  priority: t.string(), eligibleSince: t.f64(), state: t.string(), teamId: t.option(t.u64()),
  sequence: t.u32(), arrivalMinute: t.f64(), serviceMinutes: t.f64(), startedMinute: t.option(t.f64()),
  outcome: t.string(), notice: t.string(),
});
export const teamRoute = table({ name: 'team_route' }, {
  id: t.u64().primaryKey().autoInc(), runId: t.u64().index('btree'), teamId: t.u64(),
  version: t.u64(), planningEpoch: t.u64(), visitIds: t.array(t.u64()), returnMinute: t.f64(), status: t.string(),
  provider: t.string(), error: t.string(),
});
export const responseTeamState = table({ name: 'response_team_state' }, {
  teamId: t.u64().primaryKey(), runId: t.u64().index('btree'), positionVersion: t.u64(),
  updatedAt: t.timestamp(), mode: t.string(), currentVisitId: t.option(t.u64()), available: t.bool(),
  tickSequence: t.u64(),
});
export const routingWorker = table({ name: 'routing_worker' }, { identity: t.identity().primaryKey() });
const db = schema({ employee, disaster, zone, household, helpRequest, responseTeam, assignment, preparednessTask, activityEvent, impactLayer,
  scenarioState, recommendationTemplate, decisionSummary, decisionTick, areaExercise, exerciseCheckIn, responseRun, welfareVisit, teamRoute, responseTeamState, routingWorker });
export default db;
