import { eventRevision, riskCircles, riskLevel } from '../../../../backend/src/risk-bands';
import { calculateExposure, type ImpactLayer as ExposureLayer } from '../../../../backend/src/exposure';
import type { ResponseTeamState, WelfareVisit, Assignment, Disaster, HelpRequest, Household, ImpactLayer, PreparednessTask, ResponseTeam, Zone } from "../../module_bindings/types";
import { hazards, type Coordinate, type Hazard, type MapData } from "./types";

export interface OperationalRows {
  /** Derived from subscribed synthetic clock/rounds, separate from contact age. */
  dashboardOverdueHouseholdIds?: readonly string[];
  disasters: readonly Disaster[];
  zones: readonly Zone[];
  households: readonly Household[];
  requests: readonly HelpRequest[];
  teams: readonly ResponseTeam[];
  tasks: readonly PreparednessTask[];
  assignments: readonly Assignment[];
  impactLayers?: readonly ImpactLayer[];
  welfareVisits?: readonly WelfareVisit[];
  responseTeamStates?: readonly ResponseTeamState[];
}

// Reject unsupported geometry rather than silently dropping holes/islands.
function boundary(value: string): Coordinate[] {
  const polygon = JSON.parse(value);
  if (polygon.type !== "Polygon" || !Array.isArray(polygon.coordinates) || polygon.coordinates.length !== 1) throw new Error("Map layers require a GeoJSON Polygon with one ring.");
  const ring: unknown[] = polygon.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) throw new Error("Invalid polygon.");
  return ring.map(point => {
    if (!Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new Error("Invalid coordinates.");
    return [point[1], point[0]];
  });
}
function add(map: Map<bigint, Set<string>>, key: bigint, value: string) {
  const values = map.get(key) ?? new Set<string>();
  values.add(value.replaceAll("_", " ")); map.set(key, values);
}

/** Geographic grouping only. Membership and check-in are not hazard exposure. */
export function toMapData(rows: OperationalRows): MapData {
  const disasters = new Map(rows.disasters.map(row => [row.id, row]));
  const sourceZones = new Map(rows.zones.map(row => [row.id, row]));
  const tasks = new Map<bigint, Set<string>>();
  for (const task of rows.tasks) if (task.status !== "completed") add(tasks, task.zoneId, task.actionType);
  const needs = new Map<bigint, Set<string>>();
  for (const request of rows.requests) if (request.status !== "resolved") add(needs, request.householdId, request.needType);
  const zones = rows.zones.filter(row => row.level === "neighborhood").map(row => {
    const disaster = disasters.get(row.disasterId);
    if (!disaster || !Object.prototype.hasOwnProperty.call(hazards, disaster.type)) throw new Error("Unknown disaster for map zone.");
    const parent = row.parentZoneId !== undefined ? sourceZones.get(row.parentZoneId) : undefined;
    return {
      id: String(row.id), name: row.name, hazard: disaster.type as Hazard,
      severity: row.riskLevel >= 5 ? "critical" as const : row.riskLevel >= 3 ? "high" as const : "moderate" as const,
      boundary: boundary(row.boundary), contextBoundary: parent ? boundary(parent.boundary) : undefined,
      source: disaster.source, updatedAt: row.updatedAt.toDate().toISOString(), simulated: disaster.isSimulated,
      preparation: [...(tasks.get(row.id) ?? [])],
      response: ["Review unresolved household needs and confirm assistance with an employee."],
    };
  });
  const hotspotByZone = new Map<bigint, string>();
  const hotspotByDisaster = new Map<bigint, string>();
  for (const row of rows.zones) if (row.level === "neighborhood") {
    hotspotByZone.set(row.id, String(row.id));
    if (row.parentZoneId !== undefined) hotspotByZone.set(row.parentZoneId, String(row.id));
    hotspotByDisaster.set(row.disasterId, String(row.id));
  }
  const households = rows.households.map(row => {
    if (!["unknown", "safe", "needs_help", "urgent"].includes(row.checkInStatus)) throw new Error("Unknown household check-in status.");
    const hotspotId = hotspotByZone.get(row.zoneId);
    if (!hotspotId) throw new Error("Household has no geographic hotspot.");
    return {
      id: String(row.id), zoneId: String(row.zoneId), hotspotId,
      membership: sourceZones.get(row.zoneId)?.level === "neighborhood" ? "neighborhood" as const : "regional" as const,
      name: row.displayName, position: [row.latitude, row.longitude] as Coordinate, isCustomer: row.isCustomer,
      checkIn: row.checkInStatus as MapData["households"][number]["checkIn"], vulnerabilities: row.vulnerabilityFlags,
      needs: [...(needs.get(row.id) ?? [])], lastContactAt: row.lastContactAt?.toDate().toISOString() ?? null,
    };
  });
  const allHouseholds = new Map(rows.households.map(row => [row.id, row]));
  const requests = new Map(rows.requests.map(row => [row.id, row]));
  const assignments = new Map(rows.assignments.filter(row => ["assigned", "in_progress"].includes(row.status)).map(row => [row.teamId, row]));
  const centroids = zones.map(zone => ({ id: zone.id,
    lat: zone.boundary.reduce((sum, p) => sum + p[0], 0) / zone.boundary.length,
    lon: zone.boundary.reduce((sum, p) => sum + p[1], 0) / zone.boundary.length }));
  const teams = rows.teams.flatMap(row => {
    if (!["available", "assigned", "responding", "unavailable"].includes(row.status)) throw new Error("Unknown response team status.");
    const assignment = assignments.get(row.id);
    const request = assignment && requests.get(assignment.requestId);
    const welfareState = rows.responseTeamStates?.find(s => s.teamId === row.id);
    const welfare = rows.welfareVisits?.find(v => v.id === welfareState?.currentVisitId && ["en_route", "in_progress"].includes(v.state));
    const destination = welfare ? allHouseholds.get(welfare.householdId) : request && allHouseholds.get(request.householdId);
    // Missing destinations must never become a proximity-based assignment.
    if (assignment && !destination) return [];
    let nearest: string | undefined;
    let best = Infinity;
    if (!assignment) for (const point of centroids) {
      const distance = (point.lat - row.latitude) ** 2 + ((point.lon - row.longitude) * Math.cos(row.latitude * Math.PI / 180)) ** 2;
      if (distance < best) { best = distance; nearest = point.id; }
    }
    const hotspotId = destination ? hotspotByZone.get(destination.zoneId) : nearest;
    return hotspotId ? [{ id: String(row.id), zoneId: destination ? String(destination.zoneId) : hotspotId, hotspotId,
      name: row.name, position: [row.latitude, row.longitude] as Coordinate,
      status: row.status as MapData["teams"][number]["status"], capacity: row.capacity, capabilities: row.capabilities }] : [];
  });
  const result: MapData = { zones, households, teams };
  const circles = riskCircles((rows.impactLayers ?? []).map(row => ({
    id:row.id,disaster_id:String(row.disasterId),hazard_type:row.hazardType as Hazard,severity:row.severity as ExposureLayer['severity'],
    geometry:JSON.parse(row.geometry),component:row.component,data_kind:row.dataKind as ExposureLayer['data_kind'],
    is_simulated:row.isSimulated,source:row.source,updated_at:row.updatedAt.toDate().toISOString(),label:row.label,
    severityBasis:row.severityBasis,limitations:row.limitations,
  })));
  result.impactLayers = circles.map(l => {
    const hotspotId = hotspotByDisaster.get(BigInt(l.disaster_id));
    if (!hotspotId || !Object.prototype.hasOwnProperty.call(hazards,l.hazard_type)) throw new Error('Impact layer has no hotspot.');
    return {id:l.id,hotspotId,hazard:l.hazard_type,boundary:l.geometry.coordinates[0].map((p: readonly [number,number]) => [p[1],p[0]] as Coordinate),
      component:l.component,severity:l.severity,severityBasis:l.severityBasis,source:l.source,simulated:l.is_simulated,updatedAt:l.updated_at,
      label:`${riskLevel(l.severity)} risk`,limitations:l.limitations,dataKind:l.data_kind,riskCircle:l.geometry.riskCircle};
  });
  for (const zone of result.zones) {
    const eventLayers = circles.filter(l=>hotspotByDisaster.get(BigInt(l.disaster_id)) === zone.id);
    zone.eventVersion = eventRevision(eventLayers);
    const circle = eventLayers[0]?.geometry.riskCircle;
    if (circle) {
      zone.eventCenter = [circle.center[1],circle.center[0]];
      zone.severity = circle.eventSeverity as typeof zone.severity;
      zone.radiiMeters = ['critical','high','moderate'].map(band=>eventLayers.find(l=>l.severity===band)?.geometry.riskCircle?.radiusMeters ?? 0) as [number,number,number];
    }
  }
  const exposure = calculateExposure(result.households.map(h=>({id:h.id,latitude:h.position[0],longitude:h.position[1]})),circles);
  const evidence = new Map(exposure.households.map(h=>[h.householdId,h]));
  result.households = result.households.map(h=>{
    const row = evidence.get(h.id)!;
    const riskByArea: Record<string, 'High'|'Medium'|'Low'|'None'> = {};
    for(const match of row.exposures) {
      const areaId = hotspotByDisaster.get(BigInt(match.disasterId))!;
      const band = riskLevel(match.severity), previous = riskByArea[areaId];
      if(!previous || band==='High' || (band==='Medium' && previous==='Low'))riskByArea[areaId]=band;
    }
    return {...h,riskLevel:riskLevel(row.highestSeverity),riskByArea};
  });
  if (rows.impactLayers === undefined) delete result.impactLayers;
  return result;
}
