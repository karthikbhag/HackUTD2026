import { stopDummyFeed } from './dummy-weather';
import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import type db from './schema';
import { adaptScenario, source, type Scenario } from './scenario';
import defaultScenario from './default-scenario.json';
import { refreshDecisions } from './decisions';

// Seed and reset share the checked-in Person 3 dataset; no filesystem/network at runtime.
export function seed(ctx: ReducerCtx<InferSchema<typeof db>>, scenario: Scenario = source) {
  const rows = adaptScenario(scenario, ctx.timestamp);
  const previous = ctx.db.scenarioState.id.find(1);
  const run = { id: 1, runId: (previous?.runId ?? 0n) + 1n, scenarioId: scenario.scenario_id, startedAt: ctx.timestamp, evaluatedAt: ctx.timestamp };
  if (previous) ctx.db.scenarioState.id.update(run); else ctx.db.scenarioState.insert(run);
  for (const t of scenario.preparedness_recommendations ?? defaultScenario.preparedness_recommendations) {
    const row = { id: t.id, hazardType: t.hazard_type, title: t.title, description: t.description, guidanceUrl: t.guidance_url,
      guidanceCheckedOn: t.guidance_checked_on, sourceLabel: t.source_label };
    if (!ctx.db.recommendationTemplate.id.find(t.id)) ctx.db.recommendationTemplate.insert(row);
    else ctx.db.recommendationTemplate.id.update(row);
  }
  rows.disasters.forEach(row => ctx.db.disaster.insert(row));
  rows.zones.forEach(row => ctx.db.zone.insert(row));
  rows.impactLayers.forEach(row => ctx.db.impactLayer.insert(row));
  rows.households.forEach(row => ctx.db.household.insert(row));
  rows.teams.forEach(row => ctx.db.responseTeam.insert(row));
  // Let SpacetimeDB allocate IDs so old activity history cannot alias new requests.
  rows.requests.forEach(row => ctx.db.helpRequest.insert({ ...row, id: 0n }));
  // The source has no tasks. Add explicit demo outreach, not invented hazard advice.
  rows.households.filter(row => row.lastContactAt === undefined).forEach(row => {
    ctx.db.preparednessTask.insert({ id: 0n, zoneId: row.zoneId, householdId: row.id, actionType: 'outreach', status: 'pending', createdAt: ctx.timestamp, completedAt: undefined,
      scenarioRunId: run.runId, recommendationId: '' });
  });
  refreshDecisions(ctx);
}

/** Same lifecycle for each build's selected fixture; preserves memberships,
 * periodic clock, scenario counter, catalog and durable activity history. */
export function resetOperationalData(ctx: ReducerCtx<InferSchema<typeof db>>, scenario: Scenario = source) {
  stopDummyFeed(ctx);
  for (const row of [...ctx.db.responseRun.iter()]) ctx.db.responseRun.id.update({ ...row, status: 'reset', fence: row.fence + 1n, epoch: row.epoch + 1n, leaseUntil: 0n });
  for (const row of [...ctx.db.welfareVisit.iter()]) ctx.db.welfareVisit.id.delete(row.id);
  for (const row of [...ctx.db.teamRoute.iter()]) ctx.db.teamRoute.id.delete(row.id);
  for (const row of [...ctx.db.responseTeamState.iter()]) ctx.db.responseTeamState.teamId.delete(row.teamId);
  for (const row of [...ctx.db.exerciseCheckIn.iter()]) ctx.db.exerciseCheckIn.id.delete(row.id);
  for (const row of [...ctx.db.areaExercise.iter()]) ctx.db.areaExercise.disasterId.delete(row.disasterId);
  for (const row of [...ctx.db.decisionSummary.iter()]) ctx.db.decisionSummary.householdId.delete(row.householdId);
  for (const row of [...ctx.db.assignment.iter()]) ctx.db.assignment.id.delete(row.id);
  for (const row of [...ctx.db.helpRequest.iter()]) ctx.db.helpRequest.id.delete(row.id);
  for (const row of [...ctx.db.preparednessTask.iter()]) ctx.db.preparednessTask.id.delete(row.id);
  for (const row of [...ctx.db.household.iter()]) ctx.db.household.id.delete(row.id);
  for (const row of [...ctx.db.responseTeam.iter()]) ctx.db.responseTeam.id.delete(row.id);
  for (const row of [...ctx.db.impactLayer.iter()]) ctx.db.impactLayer.id.delete(row.id);
  for (const row of [...ctx.db.zone.iter()]) ctx.db.zone.id.delete(row.id);
  for (const row of [...ctx.db.disaster.iter()]) ctx.db.disaster.id.delete(row.id);
  seed(ctx, scenario);
}
