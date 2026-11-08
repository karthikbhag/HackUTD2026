import { responseRoutingDefaults } from '../../shared/response-routing-config';
export interface Point { latitude: number; longitude: number }
export interface Leg { minutes: number; meters: number; path: Point[] }
export interface TravelProvider {
  readonly name: string;
  matrix(points: Point[], departureTime: string): Promise<(number | null)[][]>;
  directions(origin: Point, stops: Point[], staging: Point): Promise<Leg[]>;
}
export function decodePolyline(encoded: string): Point[] {
  let index = 0, lat = 0, lng = 0;
  const read = () => {
    let value = 0, shift = 0, byte: number;
    do {
      if (index >= encoded.length || shift > 30) throw new Error('Invalid route polyline');
      byte = encoded.charCodeAt(index++) - 63; value |= (byte & 31) << shift; shift += 5;
    } while (byte >= 32);
    return value & 1 ? ~(value >> 1) : value >> 1;
  };
  const points: Point[] = [];
  while (index < encoded.length) { lat += read(); lng += read(); points.push({ latitude: lat / 1e5, longitude: lng / 1e5 }); }
  return points;
}
const minutes = (duration: string) => {
  const value = Number(duration?.replace(/s$/, '')) / 60;
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid route duration');
  return value;
};
export class GoogleTravelProvider implements TravelProvider {
  get name() { return this.mode === 'demo' ? 'Google demo key · Compute Routes leg estimates' : 'Google Routes API · billable matrix mode'; }
  private calls: number[] = [];
  private elements: { at: number; count: number }[] = [];
  constructor(private key: string, private retries: number = responseRoutingDefaults.maxProviderRetries, private mode: 'demo' | 'matrix' = 'demo') { if (!key) throw new Error('GOOGLE_MAPS_API_KEY required'); }
  private async request(endpoint: string, body: unknown, fields: string) {
    for (let attempt = 0; ; attempt++) {
      try {
        this.calls = this.calls.filter(at => Date.now() - at < 60000);
        if (this.calls.length >= 120) throw new Error('Routes API process request budget exceeded; retry later');
        this.calls.push(Date.now());
        const result = await fetch(`https://routes.googleapis.com/${endpoint}`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key, 'X-Goog-FieldMask': fields }, body: JSON.stringify(body) });
        if (!result.ok) {
          // Do not include key, response bodies or request headers in errors.
          if ((result.status === 429 || result.status >= 500) && attempt < this.retries) { await new Promise(r => setTimeout(r, 500 * 2 ** attempt)); continue; }
          const failure = await result.json().catch(() => ({}));
          const failureItem = Array.isArray(failure) ? failure[0] : failure;
          const reason = failureItem?.error?.details?.find((detail: { reason?: string }) => typeof detail.reason === 'string')?.reason;
          const safeReason = typeof reason === 'string' && /^[A-Z_]+$/.test(reason) ? ` (${reason})` : '';
          throw new Error(`Routes API HTTP ${result.status}${safeReason}`);
        }
        return await result.json();
      } catch (error) {
        if (attempt >= this.retries || error instanceof Error && error.message.startsWith('Routes API HTTP')) throw error;
      }
    }
  }
  async matrix(points: Point[], departureTime: string): Promise<(number | null)[][]> {
    if (!points.length || points.length > 23) throw new Error('Matrix point count outside demo bounds');
    if (this.mode === 'demo') return this.demoMatrix(points);
    this.elements = this.elements.filter(entry => Date.now() - entry.at < 3600000);
    if (this.elements.reduce((sum, entry) => sum + entry.count, 0) + points.length ** 2 > 20000) throw new Error('Routes API process matrix budget exceeded; retry later');
    this.elements.push({ at: Date.now(), count: points.length ** 2 });
    const waypoint = (p: Point) => ({ waypoint: { location: { latLng: { latitude: p.latitude, longitude: p.longitude } } } });
    // Ordinary TRAFFIC_AWARE driving permits up to 625 elements, unlike OPTIMAL (100).
    const rows = await this.request('distanceMatrix/v2:computeRouteMatrix', { origins: points.map(waypoint), destinations: points.map(waypoint), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', departureTime }, 'originIndex,destinationIndex,status,condition,duration');
    const matrix: (number | null)[][] = points.map(() => points.map(() => null));
    for (const row of rows) if (!row.status?.code && row.condition === 'ROUTE_EXISTS') {
      const origin = row.originIndex ?? 0, destination = row.destinationIndex ?? 0;
      if (matrix[origin] && destination < points.length) matrix[origin][destination] = minutes(row.duration);
    }
    return matrix;
  }
  /** Build directional leg estimates using only the demo-key-supported Compute Routes API.
   * Euler tours batch at most ten legs (nine intermediates), within Essentials bounds.
   * Identical staging/team positions share a point. No Compute Route Matrix call is made.
   */
  private async demoMatrix(points: Point[]): Promise<(number | null)[][]> {
    const unique: Point[] = [], index = new Map<string, number>();
    const ids = points.map(p => { const key = `${p.latitude},${p.longitude}`; let id = index.get(key); if (id === undefined) { id = unique.length; index.set(key, id); unique.push(p); } return id; });
    const matrix: (number | null)[][] = unique.map((_,i) => unique.map((_,j) => i === j ? 0 : null));
    const adjacency = unique.map((_,i) => unique.flatMap((_,j) => i === j ? [] : [j]));
    const stack = [0], reversed: number[] = [];
    while (stack.length) { const next = adjacency[stack.at(-1)!].pop(); if (next === undefined) reversed.push(stack.pop()!); else stack.push(next); }
    const tour = reversed.reverse();
    const waypoint = (id: number) => ({ location: { latLng: { latitude: unique[id].latitude, longitude: unique[id].longitude } } });
    const query = async (chain: number[]) => {
      const result = await this.request('directions/v2:computeRoutes', { origin: waypoint(chain[0]), destination: waypoint(chain.at(-1)!), intermediates: chain.slice(1,-1).map(waypoint), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', optimizeWaypointOrder: false }, 'routes.legs.duration');
      return result.routes?.[0]?.legs as { duration: string }[] | undefined;
    };
    for (let at = 0; at < tour.length - 1; at += 10) {
      const chain = tour.slice(at, at + 11), legs = await query(chain);
      if (legs?.length === chain.length - 1) legs.forEach((leg,i) => { matrix[chain[i]][chain[i+1]] = minutes(leg.duration); });
      else {
        // A failed tour does not establish that all its individual edges are unreachable.
        for (let i = 0; i < chain.length - 1; i++) { const single = await query(chain.slice(i,i+2)); if (single?.length === 1) matrix[chain[i]][chain[i+1]] = minutes(single[0].duration); }
      }
    }
    return ids.map(i => ids.map(j => matrix[i][j]));
  }
  async directions(origin: Point, stops: Point[], staging: Point): Promise<Leg[]> {
    if (stops.length > 25) throw new Error('Too many intermediate stops');
    if (this.mode === 'demo' && stops.length > 9) {
      const points = [origin, ...stops, staging], all: Leg[] = [];
      for (let at = 0; at < points.length - 1; at += 10) { const chain = points.slice(at, at + 11); all.push(...await this.directions(chain[0], chain.slice(1,-1), chain.at(-1)!)); }
      return all;
    }
    const waypoint = (p: Point) => ({ location: { latLng: { latitude: p.latitude, longitude: p.longitude } } });
    const result = await this.request('directions/v2:computeRoutes', { origin: waypoint(origin), destination: waypoint(staging), intermediates: stops.map(waypoint), travelMode: 'DRIVE', routingPreference: this.mode === 'demo' ? 'TRAFFIC_UNAWARE' : 'TRAFFIC_AWARE', optimizeWaypointOrder: false, polylineQuality: 'HIGH_QUALITY' }, 'routes.legs.duration,routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline');
    const legs = result.routes?.[0]?.legs;
    if (!legs || legs.length !== stops.length + 1) throw new Error('Missing route legs');
    return legs.map((leg: { duration: string; distanceMeters: number; polyline?: { encodedPolyline: string } }, i: number) => {
      const duration = minutes(leg.duration);
      const path = leg.polyline?.encodedPolyline ? decodePolyline(leg.polyline.encodedPolyline) : duration === 0 ? [[origin,...stops][i], [...stops,staging][i]] : [];
      if (path.length < 2) throw new Error('Route geometry unavailable');
      return { minutes: minutes(leg.duration), meters: leg.distanceMeters, path };
    });
  }
}
/** Explicit offline mode only; never silently selected after Google failure. */
export class FixtureTravelProvider implements TravelProvider {
  readonly name = 'OFFLINE fixture (straight-line simulation, not road routing)';
  private time(a: Point, b: Point) { return Math.hypot((a.latitude-b.latitude)*111, (a.longitude-b.longitude)*94) / 25 * 60; }
  async matrix(points: Point[]) { return points.map(a => points.map(b => this.time(a,b))); }
  async directions(origin: Point, stops: Point[], staging: Point) { const points = [origin,...stops,staging]; return points.slice(1).map((p,i)=>({minutes:this.time(points[i],p),meters:this.time(points[i],p)/60*25000,path:[points[i],p]})); }
}
export function interpolate(path: Point[], fraction: number): Point {
  if (path.length < 2) throw new Error('Empty movement path');
  const lengths = path.slice(1).map((p,i)=>Math.hypot((p.latitude-path[i].latitude)*111,(p.longitude-path[i].longitude)*94));
  let remaining = lengths.reduce((a,b)=>a+b,0)*Math.max(0,Math.min(1,fraction));
  for (let i=0;i<lengths.length;i++) { if (remaining <= lengths[i]) { const f=lengths[i] ? remaining/lengths[i] : 1; return {latitude:path[i].latitude+(path[i+1].latitude-path[i].latitude)*f,longitude:path[i].longitude+(path[i+1].longitude-path[i].longitude)*f}; } remaining-=lengths[i]; }
  return path[path.length-1];
}
