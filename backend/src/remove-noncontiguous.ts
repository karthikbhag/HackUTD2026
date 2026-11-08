import { SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import type db from './schema';

// Geographic boxes cover the seeded Alaska/Hawaii points, not other US regions.
export function excludedState(latitude: number, longitude: number) {
  return (latitude >= 51 && latitude <= 72 && (longitude <= -129 || longitude >= 172)) ||
    (latitude >= 18 && latitude <= 23 && longitude >= -161 && longitude <= -154);
}
function excludedBoundary(boundary: string) {
  const points: number[][] = [];
  const walk = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') points.push(value as number[]);
    else value.forEach(walk);
  };
  try { walk(JSON.parse(boundary).coordinates); } catch { return false; }
  return points.length > 0 && points.every(([lng, lat]) => excludedState(lat, lng));
}

export function removeNoncontiguous(ctx: ReducerCtx<InferSchema<typeof db>>) {
  const zones = new Set([...ctx.db.zone.iter()].filter(z => excludedBoundary(z.boundary)).map(z => z.id));
  // Include child zones of an excluded regional zone.
  let changed = true;
  while (changed) {
    changed = false;
    for (const z of ctx.db.zone.iter()) if (z.parentZoneId !== undefined && zones.has(z.parentZoneId) && !zones.has(z.id)) { zones.add(z.id); changed = true; }
  }
  const disasters = new Set([...ctx.db.zone.iter()].filter(z => zones.has(z.id)).map(z => z.disasterId));
  const homes = new Set([...ctx.db.household.iter()].filter(h => zones.has(h.zoneId) || excludedState(h.latitude, h.longitude)).map(h => h.id));
  const teams = new Set([...ctx.db.responseTeam.iter()].filter(t => excludedState(t.latitude, t.longitude)).map(t => t.id));
  const requests = new Set([...ctx.db.helpRequest.iter()].filter(r => homes.has(r.householdId)).map(r => r.id));
  const runs = new Set([...ctx.db.responseRun.iter()].filter(r => zones.has(r.zoneId)).map(r => r.id));
  // Avoid silently disrupting work spanning both retained and removed regions.
  if ([...ctx.db.welfareVisit.iter()].some(v => homes.has(v.householdId) && !runs.has(v.runId)) ||
      [...ctx.db.responseTeamState.iter()].some(t => teams.has(t.teamId) && !runs.has(t.runId))) throw new SenderError('Release cross-region routing teams and runs before cleanup');
  for (const r of [...ctx.db.assignment.iter()]) if (requests.has(r.requestId) || teams.has(r.teamId)) {
    if (!requests.has(r.requestId)) throw new SenderError('Release cross-region assistance assignments before cleanup');
    const team = ctx.db.responseTeam.id.find(r.teamId);
    if (team && !teams.has(team.id) && ['assigned', 'in_progress'].includes(r.status)) ctx.db.responseTeam.id.update({ ...team, status: 'available' });
    ctx.db.assignment.id.delete(r.id);
  }
  for (const r of [...ctx.db.teamRoute.iter()]) if (runs.has(r.runId)) ctx.db.teamRoute.id.delete(r.id);
  for (const r of [...ctx.db.welfareVisit.iter()]) if (runs.has(r.runId)) ctx.db.welfareVisit.id.delete(r.id);
  for (const r of [...ctx.db.responseTeamState.iter()]) if (runs.has(r.runId)) ctx.db.responseTeamState.teamId.delete(r.teamId);
  for (const id of runs) ctx.db.responseRun.id.delete(id);
  for (const r of [...ctx.db.dispatcherMembership.iter()]) if (teams.has(r.teamId)) ctx.db.dispatcherMembership.identity.delete(r.identity);
  for (const r of [...ctx.db.dispatchApproval.iter()]) if (homes.has(r.householdId)) ctx.db.dispatchApproval.id.delete(r.id);
  for (const r of [...ctx.db.exerciseCheckIn.iter()]) if (homes.has(r.householdId)) ctx.db.exerciseCheckIn.id.delete(r.id);
  for (const r of [...ctx.db.preparednessTask.iter()]) if (zones.has(r.zoneId) || r.householdId !== undefined && homes.has(r.householdId)) ctx.db.preparednessTask.id.delete(r.id);
  for (const id of requests) ctx.db.helpRequest.id.delete(id);
  for (const id of homes) { ctx.db.decisionSummary.householdId.delete(id); ctx.db.household.id.delete(id); }
  for (const id of teams) ctx.db.responseTeam.id.delete(id);
  for (const r of [...ctx.db.impactLayer.iter()]) if (zones.has(r.contextZoneId)) ctx.db.impactLayer.id.delete(r.id);
  for (const id of zones) ctx.db.zone.id.delete(id);
  for (const d of [...ctx.db.disaster.iter()]) if (disasters.has(d.id) && ![...ctx.db.zone.iter()].some(z => z.disasterId === d.id)) {
    for (const r of [...ctx.db.impactLayer.iter()]) if (r.disasterId === d.id) ctx.db.impactLayer.id.delete(r.id);
    for (const r of [...ctx.db.dispatcherMembership.iter()]) if (r.disasterId === d.id) ctx.db.dispatcherMembership.identity.delete(r.identity);
    ctx.db.areaExercise.disasterId.delete(d.id);
    ctx.db.disaster.id.delete(d.id);
  }
  ctx.db.activityEvent.insert({ id: 0n, entityType: 'dataset', entityId: 0n, action: 'removed_noncontiguous_states', actorId: ctx.sender, timestamp: ctx.timestamp,
    summary: `Removed Alaska/Hawaii: ${zones.size} zones, ${homes.size} households, ${teams.size} teams; retained other records and audit history` });
}
