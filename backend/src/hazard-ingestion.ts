import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import { Timestamp } from 'spacetimedb';
import db from './schema';
import { circlePolygon, eventRadii, riskLevel } from './risk-bands';
import { refreshDecisions } from './decisions';
type Ctx = ReducerCtx<InferSchema<typeof db>>;
export interface HazardUpdate {
  areaId: string; version: number; hazard: string; severity: string;
  longitude: number; latitude: number; observedAt: string; expiresAt: string;
  source: string; dataKind: string;
  status: string; radiiMeters?: number[];
}
/** Admin ingestion updates an existing event/area; never changes the demo clock. */
export function ingestHazard(ctx: Ctx, update: HazardUpdate) {
  const area = ctx.db.zone.id.find(BigInt(update.areaId));
  if (!area || area.level !== 'neighborhood') throw new Error('Unknown event area');
  const disaster = ctx.db.disaster.id.find(area.disasterId)!;
  if (update.hazard !== disaster.type) throw new Error('Hazard must match the selected event');
  if (!Number.isSafeInteger(update.version) || update.version < 1) throw new Error('Invalid event version');
  const layers = [...ctx.db.impactLayer.disasterId.filter(disaster.id)];
  const prefix = `event:${disaster.id}:v`;
  const previous = Math.max(0,...layers.filter(l => l.id.startsWith(prefix)).map(l => Number(l.id.slice(prefix.length).split(':')[0])));
  if (update.version <= previous) return;
  if (!['active','cancelled'].includes(update.status) || !['simulation','forecast','report'].includes(update.dataKind) || !update.source?.trim()) throw new Error('Invalid event metadata');
  const observed = Date.parse(update.observedAt), expires = Date.parse(update.expiresAt);
  if (!Number.isFinite(observed) || !Number.isFinite(expires) || expires <= observed) throw new Error('Invalid event validity period');
  const defaults = eventRadii(update.hazard,update.severity);
  const radii = update.radiiMeters ?? [...defaults];
  if (radii.length !== 3 || !(radii[0] > 0 && radii[0] < radii[1] && radii[1] < radii[2])) throw new Error('Radii must be increasing');
  // Keep a zero-exposure tombstone after cancellation to reject older versions.
  const active = update.status === 'active' && expires > Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);
  const geometries = radii.map(r => circlePolygon([update.longitude,update.latitude],r,update.severity));
  for (const l of layers) ctx.db.impactLayer.id.delete(l.id);
  const stamp = new Timestamp(BigInt(observed) * 1000n);
  for (const [index,severity] of ['critical','high','moderate'].entries()) {
    ctx.db.impactLayer.insert({ id:`${prefix}${update.version}:${index}`, disasterId:disaster.id, contextZoneId:area.id,
      hazardType:update.hazard, component:active ? `circular-risk:${riskLevel(severity)}` : 'circular-risk:inactive',
      severity, severityBasis:`Modeled ${radii[index]}m radius; source severity ${update.severity}`,
      geometry:JSON.stringify(geometries[index]), dataKind:update.dataKind, isSimulated:update.dataKind === 'simulation',
      source:update.source, updatedAt:stamp, label:`${riskLevel(severity)} risk`,
      limitations:JSON.stringify({expiresAt:update.expiresAt,status:active?'active':'cancelled',version:update.version}), recommendationIds:[] });
  }
  ctx.db.zone.id.update({...area,riskLevel:update.severity === 'critical' ? 5 : update.severity === 'high' ? 3 : 2,updatedAt:stamp});
  ctx.db.disaster.id.update({...disaster,source:update.source,isSimulated:update.dataKind === 'simulation',updatedAt:stamp});
  ctx.db.activityEvent.insert({id:0n,entityType:'disaster',entityId:disaster.id,action:'hazard_updated',actorId:ctx.sender,timestamp:ctx.timestamp,summary:`${update.source}: version ${update.version}, ${update.status}, ${update.severity}`});
  refreshDecisions(ctx);
}
