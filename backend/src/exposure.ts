/** Deterministic, dependency-free exposure calculation for simple local polygons.
 * No clocks, filesystem, network, SDK calls, or household zone assumptions.
 * Coordinates are [longitude, latitude]; boundaries count as exposed.
 */
export type Hazard = 'tornado' | 'earthquake' | 'hurricane' | 'wildfire' | 'blizzard' | 'flood';
export type Severity = 'moderate' | 'high';
export type RecordId = string | bigint;
export type Position = readonly [number, number];
export interface Polygon { type: 'Polygon'; coordinates: readonly (readonly Position[])[] }
export interface LocatedHousehold<Id extends RecordId = string> {
  id: Id; latitude: number; longitude: number;
}
export interface ImpactLayer<Id extends RecordId = string> {
  id: Id; disaster_id: Id; hazard_type: Hazard; component: string;
  severity: Severity; geometry: Polygon; data_kind: 'simulation' | 'forecast' | 'report';
  is_simulated: boolean; source: string; updated_at: string; label: string;
}
export interface ExposureEvidence<Id extends RecordId = string> {
  layerId: Id; disasterId: Id; hazardType: Hazard; component: string; severity: Severity;
  dataKind: ImpactLayer<Id>['data_kind']; isSimulated: boolean;
  source: string; updatedAt: string; label: string;
}

const EPSILON = 1e-10; // Coordinate-space tolerance; not a claimed accuracy in meters.
const HAZARDS: readonly Hazard[] = ['tornado', 'earthquake', 'hurricane', 'wildfire', 'blizzard', 'flood'];
function requireValid(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Invalid exposure input: ${message}`);
}
function validId(value: RecordId) {
  return typeof value === 'bigint' || (typeof value === 'string' && value.trim().length > 0);
}
function compareIds(a: RecordId, b: RecordId) {
  if (typeof a === typeof b) return a < b ? -1 : a > b ? 1 : 0;
  return typeof a === 'bigint' ? -1 : 1;
}
function validPoint(p: Position) {
  return p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
}
function validTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)) return false;
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 19) === value.slice(0, 19);
}
function cross(a: Position, b: Position, c: Position) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function onSegment(a: Position, b: Position, p: Position) {
  return Math.abs(cross(a, b, p)) <= EPSILON &&
    p[0] >= Math.min(a[0], b[0]) - EPSILON && p[0] <= Math.max(a[0], b[0]) + EPSILON &&
    p[1] >= Math.min(a[1], b[1]) - EPSILON && p[1] <= Math.max(a[1], b[1]) + EPSILON;
}
function intersects(a: Position, b: Position, c: Position, d: Position) {
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b) ||
    (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0);
}
type Prepared = { ring: readonly Position[]; minX: number; minY: number; maxX: number; maxY: number };
function preparePolygon(polygon: Polygon): Prepared {
  requireValid(polygon.type === 'Polygon' && polygon.coordinates.length === 1, 'only one-ring Polygon is supported');
  const ring = polygon.coordinates[0];
  requireValid(ring.length >= 4 && ring.every(validPoint), 'polygon coordinates');
  requireValid(ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1], 'polygon must close');
  requireValid(new Set(ring.slice(0, -1).map(p => `${p[0]},${p[1]}`)).size === ring.length - 1, 'repeated polygon vertex');
  const area = ring.slice(1).reduce((sum, p, i) => sum + cross(ring[0], ring[i], p), 0);
  requireValid(Math.abs(area) > 1e-12, 'zero-area polygon');
  for (let i = 0; i < ring.length - 1; i++) {
    for (let j = i + 1; j < ring.length - 1; j++) {
      if (j === i + 1 || (i === 0 && j === ring.length - 2)) continue;
      requireValid(!intersects(ring[i], ring[i + 1], ring[j], ring[j + 1]), 'self-intersecting polygon');
    }
  }
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  const bounds = { ring, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  requireValid(bounds.maxX - bounds.minX < 180, 'dateline-spanning polygons are unsupported');
  return bounds;
}
function contains(prepared: Prepared, p: Position) {
  const { ring, minX, maxX, minY, maxY } = prepared;
  if (p[0] < minX - EPSILON || p[0] > maxX + EPSILON || p[1] < minY - EPSILON || p[1] > maxY + EPSILON) return false;
  let inside = false;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    if (onSegment(a, b, p)) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < a[0] + (p[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1])) inside = !inside;
  }
  return inside;
}

/** Standalone checked predicate. For many households, use calculateExposure so
 * polygons are validated/prepared once and a spatial grid reduces candidates.
 */
export function pointInPolygon(point: Position, polygon: Polygon) {
  requireValid(validPoint(point), 'point coordinates');
  return contains(preparePolygon(polygon), point);
}

export function calculateExposure<Id extends RecordId>(households: readonly LocatedHousehold<Id>[], layers: readonly ImpactLayer<Id>[]) {
  const seenLayers = new Set<Id>();
  const prepared = [...layers].sort((a, b) => compareIds(a.id, b.id)).map(layer => {
    requireValid(validId(layer.id) && validId(layer.disaster_id) && !seenLayers.has(layer.id), 'duplicate/empty layer ID');
    seenLayers.add(layer.id);
    requireValid(HAZARDS.includes(layer.hazard_type) && ['moderate', 'high'].includes(layer.severity), 'hazard/severity');
    requireValid(['simulation', 'forecast', 'report'].includes(layer.data_kind) && typeof layer.is_simulated === 'boolean' &&
      (layer.data_kind === 'simulation') === layer.is_simulated, 'simulation metadata');
    requireValid(layer.component.trim() && layer.source.trim() && layer.label.trim() &&
      validTimestamp(layer.updated_at), 'source/component/timestamp');
    return { layer, polygon: preparePolygon(layer.geometry) };
  });
  // A fixed one-degree spatial grid is an optimization only. Every intersected
  // cell gets the layer, including tolerance-expanded bounds. Huge polygons use
  // a fallback list to keep index memory bounded. No filter by home zone/hazard.
  const grid = new Map<string, typeof prepared>();
  const broad: typeof prepared = [];
  for (const entry of prepared) {
    const p = entry.polygon;
    const left = Math.floor(p.minX - EPSILON), right = Math.floor(p.maxX + EPSILON);
    const bottom = Math.floor(p.minY - EPSILON), top = Math.floor(p.maxY + EPSILON);
    if ((right - left + 1) * (top - bottom + 1) > 4096) { broad.push(entry); continue; }
    for (let x = left; x <= right; x++) for (let y = bottom; y <= top; y++) {
      const key = `${x}:${y}`, bucket = grid.get(key) ?? [];
      bucket.push(entry); grid.set(key, bucket);
    }
  }
  const layerCounts = new Map(prepared.map(({ layer }) => [layer.id, 0]));
  const disasterCounts = new Map<Id, number>(prepared.map(({ layer }) => [layer.disaster_id, 0]));
  const hazardCounts = new Map<Hazard, number>(HAZARDS.map(h => [h, 0]));
  const seenHouseholds = new Set<Id>();
  let affectedHouseholds = 0, candidateChecks = 0;
  const results = [...households].sort((a, b) => compareIds(a.id, b.id)).map(household => {
    requireValid(validId(household.id) && !seenHouseholds.has(household.id), 'duplicate/empty household ID');
    seenHouseholds.add(household.id);
    const point: Position = [household.longitude, household.latitude];
    requireValid(validPoint(point), 'household coordinates');
    const candidates = [...(grid.get(`${Math.floor(point[0])}:${Math.floor(point[1])}`) ?? []), ...broad];
    const exposures: ExposureEvidence<Id>[] = [];
    for (const { layer, polygon } of candidates) {
      candidateChecks++;
      if (!contains(polygon, point)) continue;
      exposures.push({ layerId: layer.id, disasterId: layer.disaster_id, hazardType: layer.hazard_type,
        component: layer.component, severity: layer.severity, dataKind: layer.data_kind,
        isSimulated: layer.is_simulated, source: layer.source, updatedAt: layer.updated_at, label: layer.label });
      layerCounts.set(layer.id, layerCounts.get(layer.id)! + 1);
    }
    exposures.sort((a, b) => compareIds(a.layerId, b.layerId));
    for (const hazard of new Set(exposures.map(e => e.hazardType))) hazardCounts.set(hazard, hazardCounts.get(hazard)! + 1);
    for (const disaster of new Set(exposures.map(e => e.disasterId))) disasterCounts.set(disaster, disasterCounts.get(disaster)! + 1);
    if (exposures.length) affectedHouseholds++;
    const highestSeverity: Severity | undefined = exposures.some(e => e.severity === 'high') ? 'high' : exposures.length ? 'moderate' : undefined;
    return { householdId: household.id, affected: exposures.length > 0, highestSeverity, exposures };
  });
  return { households: results, totalHouseholds: households.length, affectedHouseholds,
    byLayer: [...layerCounts].map(([layerId, households]) => ({ layerId, households })),
    byDisaster: [...disasterCounts].sort(([a], [b]) => compareIds(a, b)).map(([disasterId, households]) => ({ disasterId, households })),
    byHazard: [...hazardCounts].map(([hazardType, households]) => ({ hazardType, households })),
    candidateChecks, // Diagnostic count, not an exposure or elapsed-time estimate.
  };
}
