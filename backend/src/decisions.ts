/** Authoritative integration of the tested Person 3 helpers. Compact summaries
 * are stored transactionally; detailed explanations are derived on demand.
 */
import type { InferSchema, ReducerCtx, ViewCtx } from 'spacetimedb/server';
import type db from './schema';
import { calculateExposure, type ImpactLayer, type Hazard } from './exposure';
import { detectFollowUp } from './follow-up';
import { suggestPreparedness, type PreparednessDisaster, type PreparednessTemplate } from './preparedness';
import { createTeamRecommender, type DispatchRequest, type DispatchTeam, type DispatchAssignment } from './team-recommendations';
import { ScheduleAt } from 'spacetimedb';
import defaultScenario from './default-scenario.json';

type WriteCtx = ReducerCtx<InferSchema<typeof db>>;
type ReadCtx = Pick<WriteCtx, 'db'> | Pick<ViewCtx<InferSchema<typeof db>>, 'db'>;
const json = (value: unknown) => JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v);

export function operationalLayers(ctx: ReadCtx): ImpactLayer[] {
  return [...ctx.db.impactLayer.iter()].map(l => ({ id: l.id, disaster_id: String(l.disasterId), hazard_type: l.hazardType as Hazard,
    component: l.component, severity: l.severity as ImpactLayer['severity'], geometry: JSON.parse(l.geometry),
    data_kind: l.dataKind as ImpactLayer['data_kind'], is_simulated: l.isSimulated, source: l.source,
    updated_at: l.updatedAt.toDate().toISOString(), label: l.label }));
}
function evaluate(ctx: ReadCtx, homes: { id: bigint; latitude: number; longitude: number; checkInStatus: string; vulnerabilityFlags: string[]; lastContactAt?: { microsSinceUnixEpoch: bigint } }[], now: bigint) {
  const exposures = calculateExposure(homes.map(h => ({ id: String(h.id), latitude: h.latitude, longitude: h.longitude })), operationalLayers(ctx));
  const ids = new Set(homes.map(h => h.id));
  const requests = homes.length === 1 ? [...ctx.db.helpRequest.householdId.filter(homes[0].id)] : [...ctx.db.helpRequest.iter()].filter(r => ids.has(r.householdId));
  return detectFollowUp(homes.map(h => ({ id: String(h.id), checkInStatus: h.checkInStatus as 'unknown' | 'safe' | 'needs_help' | 'urgent',
    vulnerabilityFlags: h.vulnerabilityFlags, lastContactAtMicros: h.lastContactAt?.microsSinceUnixEpoch })),
    requests.map(r => ({ id: String(r.id), householdId: String(r.householdId), needType: r.needType, urgency: r.urgency, status: r.status as DispatchRequest['status'] })), exposures.households, now);
}
export function refreshDecisions(ctx: WriteCtx, householdId?: bigint) {
  const homes = householdId === undefined ? [...ctx.db.household.iter()] : [ctx.db.household.id.find(householdId)].filter(h => h !== null);
  if (!homes.length) return;
  let run = ctx.db.scenarioState.id.find(1);
  if (!run) run = ctx.db.scenarioState.insert({ id: 1, runId: 0n, scenarioId: 'existing-scenario-upgrade', startedAt: ctx.timestamp, evaluatedAt: ctx.timestamp });
  if (ctx.db.decisionTick.count() === 0n) ctx.db.decisionTick.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(60_000_000n) });
  if (ctx.db.recommendationTemplate.count() === 0n) for (const t of defaultScenario.preparedness_recommendations) {
    ctx.db.recommendationTemplate.insert({ id: t.id, hazardType: t.hazard_type, title: t.title, description: t.description,
      guidanceUrl: t.guidance_url, guidanceCheckedOn: t.guidance_checked_on, sourceLabel: t.source_label });
  }
  for (const layer of ctx.db.impactLayer.iter()) if (!layer.recommendationIds.length) ctx.db.impactLayer.id.update({ ...layer,
    recommendationIds: [...ctx.db.recommendationTemplate.iter()].filter(t => t.hazardType === layer.hazardType).map(t => t.id) });
  const result = evaluate(ctx, homes, ctx.timestamp.microsSinceUnixEpoch);
  const contacts = new Map(homes.map(h => [h.id, h.lastContactAt?.microsSinceUnixEpoch]));
  for (const row of result.households) {
    const summary = { householdId: BigInt(row.householdId), runId: run?.runId ?? 0n, score: row.score,
      overlooked: row.overlooked, needsFollowUp: row.needsFollowUp, highestSeverity: row.highestSeverity ?? 'none',
      layerIds: row.exposureEvidence.map(e => e.layerId), computedAt: ctx.timestamp };
    const sortedSummary = { ...summary, highestUrgency: row.highestUrgency,
      lastContactMicros: contacts.get(summary.householdId) };
    const previous = ctx.db.decisionSummary.householdId.find(summary.householdId);
    if (!previous) ctx.db.decisionSummary.insert(sortedSummary);
    else if (previous.runId !== sortedSummary.runId || previous.score !== sortedSummary.score || previous.overlooked !== sortedSummary.overlooked ||
      previous.needsFollowUp !== sortedSummary.needsFollowUp || previous.highestSeverity !== sortedSummary.highestSeverity ||
      previous.highestUrgency !== sortedSummary.highestUrgency || previous.lastContactMicros !== sortedSummary.lastContactMicros ||
      JSON.stringify(previous.layerIds) !== JSON.stringify(sortedSummary.layerIds)) ctx.db.decisionSummary.householdId.update(sortedSummary);
  }
  if (run) ctx.db.scenarioState.id.update({ ...run, evaluatedAt: ctx.timestamp });
}
export function householdDecision(ctx: ReadCtx, householdId: bigint) {
  const home = ctx.db.household.id.find(householdId), summary = ctx.db.decisionSummary.householdId.find(householdId);
  if (!home || !summary) return null;
  const clock = ctx.db.scenarioState.id.find(1)?.evaluatedAt ?? summary.computedAt;
  const row = evaluate(ctx, [home], clock.microsSinceUnixEpoch).households[0];
  const templates: PreparednessTemplate[] = [...ctx.db.recommendationTemplate.iter()].map(t => ({ id: t.id, hazard_type: t.hazardType as Hazard,
    title: t.title, description: t.description, phase: 'preparedness', requires_human_review: true,
    guidance_url: t.guidanceUrl, guidance_checked_on: t.guidanceCheckedOn, source_label: t.sourceLabel }));
  const layers = [...ctx.db.impactLayer.iter()].map(l => ({ id: l.id, disaster_id: String(l.disasterId), hazard_type: l.hazardType as Hazard,
    component: l.component, recommendation_ids: l.recommendationIds }));
  const disasters: PreparednessDisaster[] = [...ctx.db.disaster.iter()].map(d => ({ id: String(d.id), type: d.type as Hazard, phase: d.phase as 'preparedness' | 'response' }));
  const history = [...ctx.db.preparednessTask.byHousehold.filter(householdId)].filter(t => t.recommendationId).map(t => ({ id: String(t.id), householdId: String(householdId),
    scenarioRunId: String(t.scenarioRunId), recommendationId: t.recommendationId, status: t.status as 'pending' | 'in_progress' | 'completed' }));
  const preparation = suggestPreparedness(String(summary.runId), [{ id: String(home.id), vulnerabilityFlags: home.vulnerabilityFlags }], disasters, layers,
    [{ householdId: String(home.id), exposures: row.exposureEvidence }], templates, history).households[0];
  return { householdId, payload: json({ ...row, runId: summary.runId, computedAt: clock.toDate().toISOString(), preparation,
    requests: [...ctx.db.helpRequest.householdId.filter(householdId)] }) };
}
export function requestRecommendations(ctx: ReadCtx, requestId: bigint) {
  const assignments = [...ctx.db.assignment.iter()];
  const ids = new Set([requestId, ...assignments.map(a => a.requestId)]);
  const requests = [...ids].map(id => ctx.db.helpRequest.id.find(id)).filter(r => r !== null);
  const homeIds = new Set(requests.map(r => r.householdId));
  const homes = [...homeIds].map(id => ctx.db.household.id.find(id)).filter(h => h !== null);
  const result = createTeamRecommender(homes, requests as DispatchRequest<bigint>[], [...ctx.db.responseTeam.iter()] as DispatchTeam<bigint>[], assignments as DispatchAssignment<bigint>[])
    .recommend(requestId, { limit: 5, includeExcludedTeams: true });
  return { requestId, payload: json(result) };
}
