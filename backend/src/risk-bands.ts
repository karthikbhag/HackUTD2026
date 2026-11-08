/** Shared, deterministic circular model. Distances are meters; positions are [lon, lat]. */
export type RiskLevel = 'High' | 'Medium' | 'Low' | 'None';
export type Point = readonly [number, number];
export interface RiskCircle { center: Point; radiusMeters: number; eventSeverity: string }
export interface CircleGeometry { type: 'Polygon'; coordinates: readonly (readonly Point[])[]; riskCircle?: RiskCircle }
const EARTH_METERS = 6371008.8;
export function distanceMeters(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const h = Math.sin((b[1]-a[1])*rad/2)**2 + Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin((b[0]-a[0])*rad/2)**2;
  return EARTH_METERS * 2 * Math.asin(Math.sqrt(Math.min(1,h)));
}
/** Deliberately simple demo policy, not an official hazard forecast model. */
export const radiusProfiles: Record<string, readonly [number, number, number]> = {
  tornado: [1000, 3000, 6000], earthquake: [10000, 30000, 60000],
  hurricane: [25000, 75000, 150000], wildfire: [2000, 6000, 12000],
  blizzard: [10000, 30000, 60000], flood: [1000, 3000, 6000],
};
export function eventRadii(hazard: string, severity: string): readonly [number, number, number] {
  const profile = radiusProfiles[hazard];
  if (!profile || !['moderate', 'high', 'critical'].includes(severity)) throw new Error('Unsupported hazard or severity');
  const scale = severity === 'critical' ? 1.5 : severity === 'high' ? 1 : 0.5;
  return [profile[0]*scale,profile[1]*scale,profile[2]*scale];
}
export function circlePolygon(center: Point, radius: number, eventSeverity = 'high'): CircleGeometry {
  if (!center.every(Number.isFinite) || Math.abs(center[0]) > 180 || Math.abs(center[1]) > 85 || !Number.isFinite(radius) || radius <= 0 || radius > 500000) throw new Error('Invalid circle location or radius');
  const angular = radius / EARTH_METERS, lat = center[1]*Math.PI/180, lon=center[0]*Math.PI/180;
  if (Math.abs(lat)+angular >= Math.PI/2) throw new Error('Polar circles are unsupported');
  const ring: Point[] = Array.from({length:96},(_,i)=>{
    const bearing=i*2*Math.PI/96;
    const y=Math.asin(Math.sin(lat)*Math.cos(angular)+Math.cos(lat)*Math.sin(angular)*Math.cos(bearing));
    const x=lon+Math.atan2(Math.sin(bearing)*Math.sin(angular)*Math.cos(lat),Math.cos(angular)-Math.sin(lat)*Math.sin(y));
    if (Math.abs(x) > Math.PI) throw new Error('Dateline-spanning circles are unsupported');
    return [x*180/Math.PI,y*180/Math.PI];
  });
  ring.push(ring[0]);
  return {type:'Polygon',coordinates:[ring],riskCircle:{center,radiusMeters:radius,eventSeverity}};
}
export function ringCenter(ring: readonly Point[]): Point {
  const closed = ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1];
  const points = closed ? ring.slice(0,-1) : ring;
  if (!points.length) throw new Error('Empty event location');
  return [points.reduce((sum,p)=>sum+p[0],0)/points.length,points.reduce((sum,p)=>sum+p[1],0)/points.length];
}
/** Preserve explicit circular events. Adapt older fixtures using the same radius policy. */
export function riskCircles<T extends { id: string; disaster_id: string; severity: string; component?: string; hazard_type?: string; geometry: CircleGeometry }>(layers: readonly T[]): T[] {
  const explicit = layers.filter(l => l.geometry.riskCircle);
  const explicitEvents = new Set(explicit.map(l=>l.disaster_id));
  const groups = new Map<string,T[]>();
  for (const l of layers.filter(l=>!explicitEvents.has(l.disaster_id) && l.component !== 'circular-risk:inactive')) groups.set(l.disaster_id,[...(groups.get(l.disaster_id)??[]),l]);
  return [...explicit,...[...groups.values()].flatMap(group=>{
    const ordered = [...group].sort((a,b)=>a.id.localeCompare(b.id));
    const points = ordered.flatMap(l=>l.geometry.coordinates[0].slice(0,-1));
    const center = ringCenter(points);
    const severity = ordered.some(l=>l.severity==='critical') ? 'critical' : ordered.some(l=>l.severity==='high') ? 'high' : 'moderate';
    const radii = ordered[0].hazard_type ? eventRadii(ordered[0].hazard_type,severity) : [1000,3000,6000];
    const updated = ordered.reduce((a,b)=> ('updated_at' in a && 'updated_at' in b && String(a.updated_at)<String(b.updated_at)) ? b:a);
    return (['critical','high','moderate'] as const).map((band,i)=>({...updated,id:`${ordered[0].disaster_id}:risk:${band}`,severity:band,
      component:`circular-risk:${riskLevel(band)}`,geometry:circlePolygon(center,radii[i],severity)}));
  })];
}
export function riskLevel(severity?: string): RiskLevel {
  return severity === 'critical' ? 'High' : severity === 'high' ? 'Medium' : severity === 'moderate' ? 'Low' : 'None';
}
/** Compact stable fingerprint shared by map previews and transactional approval. */
export function eventRevision(layers: readonly {id:string; severity:string; updated_at:string; geometry:CircleGeometry}[]) {
  const value = JSON.stringify([...layers].sort((a,b)=>a.id.localeCompare(b.id)).map(l=>[l.id,l.updated_at,l.severity,l.geometry.riskCircle??l.geometry]));
  let hash = 14695981039346656037n;
  for (let i=0;i<value.length;i++) hash = BigInt.asUintN(64,(hash ^ BigInt(value.charCodeAt(i)))*1099511628211n);
  return hash.toString(16);
}
