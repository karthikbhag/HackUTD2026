import {riskCircles,riskLevel,eventRevision} from '../../../../backend/src/risk-bands';
import {calculateExposure,type ImpactLayer} from '../../../../backend/src/exposure';
import type {Coordinate,MapData} from './types';
/** The isolated rehearsal uses the same event model as the shared dashboard. */
export function localRiskData(data:MapData):MapData {
  const circles=riskCircles((data.impactLayers ?? []).map(l=>{
    const ring=l.boundary.map(p=>[p[1],p[0]] as const);
    if(ring.length && (ring[0][0]!==ring.at(-1)![0] || ring[0][1]!==ring.at(-1)![1]))ring.push(ring[0]);
    return {...l,disaster_id:l.hotspotId,hazard_type:l.hazard,geometry:{type:'Polygon' as const,coordinates:[ring],riskCircle:l.riskCircle},
      data_kind:l.dataKind ?? 'simulation' as const,is_simulated:l.simulated,updated_at:l.updatedAt,severity:l.severity as ImpactLayer['severity']};
  }));
  const exposure=calculateExposure(data.households.map(h=>({id:h.id,longitude:h.position[1],latitude:h.position[0]})),circles);
  const byId=new Map(exposure.households.map(h=>[h.householdId,h]));
  return {...data,zones:data.zones.map(z=>{
    const layers=circles.filter(l=>l.disaster_id===z.id),circle=layers[0]?.geometry.riskCircle;
    return {...z,eventVersion:eventRevision(layers),...(circle?{eventCenter:[circle.center[1],circle.center[0]] as Coordinate,severity:circle.eventSeverity as typeof z.severity,
      radiiMeters:['critical','high','moderate'].map(band=>layers.find(l=>l.severity===band)?.geometry.riskCircle?.radiusMeters ?? 0) as [number,number,number]}:{})};
  }),impactLayers:circles.map(l=>({...l,boundary:l.geometry.coordinates[0].map(p=>[p[1],p[0]] as Coordinate),riskCircle:l.geometry.riskCircle,label:`${riskLevel(l.severity)} risk`,severityBasis:'Modeled circular exposure'})),
    households:data.households.map(h=>{
      const evidence=byId.get(h.id)!,riskByArea:Record<string,'High'|'Medium'|'Low'|'None'>={};
      for(const e of evidence.exposures){const band=riskLevel(e.severity),previous=riskByArea[e.disasterId];if(!previous || band==='High' || (band==='Medium' && previous==='Low'))riskByArea[e.disasterId]=band;}
      return {...h,riskLevel:riskLevel(evidence.highestSeverity),riskByArea};
    })};
}
