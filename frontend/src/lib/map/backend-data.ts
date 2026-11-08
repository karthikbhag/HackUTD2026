import type { Assignment, Disaster, HelpRequest, Household, PreparednessTask, ResponseTeam, Zone } from "../../module_bindings/types";
import { hazards, type Coordinate, type Hazard, type MapData } from "./types";

export interface OperationalRows {
  disasters: readonly Disaster[];
  zones: readonly Zone[];
  households: readonly Household[];
  requests: readonly HelpRequest[];
  teams: readonly ResponseTeam[];
  tasks: readonly PreparednessTask[];
  assignments: readonly Assignment[];
}

// Reject unsupported geometry instead of silently filling holes or dropping islands.
function boundary(value: string): Coordinate[] {
  const polygon = JSON.parse(value);
  if (polygon.type !== "Polygon" || !Array.isArray(polygon.coordinates) || polygon.coordinates.length !== 1) {
    throw new Error("Map zones require a GeoJSON Polygon with one ring.");
  }
  const ring: unknown[] = polygon.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) throw new Error("Invalid zone polygon.");
  return ring.map(point => {
    if (!Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) {
      throw new Error("Invalid zone coordinates.");
    }
    return [point[1], point[0]];
  });
}

/** Display adapter only: grouping teams by proximity is not a dispatch recommendation. */
export function toMapData(rows: OperationalRows): MapData {
  const disasters = new Map(rows.disasters.map(row => [row.id, row]));
  // National/metro context rectangles are not exposure zones. Rendering all of them
  // would paint the entire U.S. six times and obscure the actionable neighborhoods.
  const zones = rows.zones.filter(row => row.level === "neighborhood").map(row => {
    const disaster = disasters.get(row.disasterId);
    if (!disaster || !Object.prototype.hasOwnProperty.call(hazards, disaster.type)) throw new Error("Unknown disaster for map zone.");
    return {
      id: String(row.id), name: row.name, hazard: disaster.type as Hazard,
      severity: row.riskLevel >= 5 ? "critical" as const : row.riskLevel >= 3 ? "high" as const : "moderate" as const,
      boundary: boundary(row.boundary), source: disaster.source,
      updatedAt: row.updatedAt.toDate().toISOString(), simulated: disaster.isSimulated,
      preparation: [...new Set(rows.tasks.filter(task => task.zoneId === row.id && task.status !== "completed").map(task => task.actionType.replaceAll("_", " ")))],
      response: ["Review unresolved household needs and confirm assistance with an employee."],
    };
  });
  const zoneIds = new Set(zones.map(row => row.id));
  const households = rows.households.filter(row => zoneIds.has(String(row.zoneId))).map(row => {
    if (!["unknown", "safe", "needs_help", "urgent"].includes(row.checkInStatus)) throw new Error("Unknown household check-in status.");
    return {
      id: String(row.id), zoneId: String(row.zoneId), name: row.displayName,
      position: [row.latitude, row.longitude] as Coordinate, isCustomer: row.isCustomer,
      checkIn: row.checkInStatus as MapData["households"][number]["checkIn"],
      vulnerabilities: row.vulnerabilityFlags,
      needs: [...new Set(rows.requests.filter(request => request.householdId === row.id && request.status !== "resolved").map(request => request.needType.replaceAll("_", " ")))],
      lastContactAt: row.lastContactAt?.toDate().toISOString() ?? null,
    };
  });
  const allHouseholds = new Map(rows.households.map(row => [row.id, row]));
  const teams = rows.teams.flatMap(row => {
    if (!["available", "assigned", "responding", "unavailable"].includes(row.status)) throw new Error("Unknown response team status.");
    const assignment = rows.assignments.find(item => item.teamId === row.id && ["assigned", "in_progress"].includes(item.status));
    const request = assignment && rows.requests.find(item => item.id === assignment.requestId);
    const assignedHousehold = request && allHouseholds.get(request.householdId);
    // Resolve destinations against all backend households. Active regional (or
    // not-yet-loaded) destinations cannot be represented on this neighborhood map.
    // Never replace an active assignment with a proximity-based display location.
    if (assignment && (!assignedHousehold || !zoneIds.has(String(assignedHousehold.zoneId)))) return [];
    // Only unassigned teams use the nearest neighborhood centroid for display,
    // including teams just outside its boundary.
    const nearest = !assignment ? [...zones].sort((a, b) => {
      const distance = (zone: typeof a) => {
        const lat = zone.boundary.reduce((sum, point) => sum + point[0], 0) / zone.boundary.length;
        const lon = zone.boundary.reduce((sum, point) => sum + point[1], 0) / zone.boundary.length;
        return (lat - row.latitude) ** 2 + ((lon - row.longitude) * Math.cos(row.latitude * Math.PI / 180)) ** 2;
      };
      return distance(a) - distance(b);
    })[0] : undefined;
    const zoneId = assignedHousehold ? String(assignedHousehold.zoneId) : nearest?.id;
    return zoneId ? [{ id: String(row.id), zoneId, name: row.name, position: [row.latitude, row.longitude] as Coordinate, status: row.status as MapData["teams"][number]["status"], capacity: row.capacity, capabilities: row.capabilities }] : [];
  });
  return { zones, households, teams };
}
