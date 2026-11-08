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
export const preparednessTask = table({ name: 'preparedness_task' }, {
  id: t.u64().primaryKey().autoInc(), zoneId: t.u64().index('btree'), householdId: t.option(t.u64()),
  actionType: t.string(), status: t.string(), createdAt: t.timestamp(), completedAt: t.option(t.timestamp()),
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
});
const db = schema({ employee, disaster, zone, household, helpRequest, responseTeam, assignment, preparednessTask, activityEvent, impactLayer });
export default db;
