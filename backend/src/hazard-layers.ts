import type { InferSchema, ReducerCtx, ViewCtx } from 'spacetimedb/server';
import type db from './schema';
import { riskCircles } from './risk-bands';
export type HazardReadCtx = (Pick<ReducerCtx<InferSchema<typeof db>>,'db'> | Pick<ViewCtx<InferSchema<typeof db>>,'db'>) & { timestamp?: ReducerCtx<InferSchema<typeof db>>['timestamp'] };
/** The map, queue and approval all consume these exact circles. */
export function activeImpactRows(ctx: HazardReadCtx) {
  const rows = [...ctx.db.impactLayer.iter()].filter(l=>{
    if (l.component === 'circular-risk:inactive') return false;
    if (!l.component.startsWith('circular-risk:')) return true;
    const metadata = JSON.parse(l.limitations);
    const now = ctx.timestamp ?? ctx.db.scenarioState.id.find(1)?.evaluatedAt ?? l.updatedAt;
    return Date.parse(metadata.expiresAt) > Number(now.microsSinceUnixEpoch / 1000n);
  });
  return riskCircles(rows.map(l=>({...l,disaster_id:String(l.disasterId),hazard_type:l.hazardType,updated_at:l.updatedAt.toDate().toISOString(),geometry:JSON.parse(l.geometry)})))
    .map(l=>({...l,geometry:JSON.stringify(l.geometry),label:`${l.geometry.riskCircle ? (l.severity === 'critical' ? 'High' : l.severity === 'high' ? 'Medium' : 'Low') : l.severity} risk`,
      severityBasis:`Modeled circular exposure · event severity ${l.geometry.riskCircle?.eventSeverity ?? 'unknown'} · ${l.geometry.riskCircle?.radiusMeters ?? 0}m radius`}));
}
