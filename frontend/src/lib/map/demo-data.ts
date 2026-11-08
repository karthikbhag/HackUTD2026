import type { Coordinate, Hazard, MapData } from "./types";

// Disposable UI fixtures, separate from Person 3's authoritative scenario data.
const hotspots: { id: string; name: string; hazard: Hazard; center: Coordinate; preparation: string; response: string }[] = [
  { id: "dallas", name: "Dallas–Fort Worth, TX", hazard: "tornado", center: [32.78, -96.8], preparation: "Review shelter options and plan household outreach.", response: "Review welfare-check and temporary shelter needs." },
  { id: "bay", name: "San Francisco Bay Area, CA", hazard: "earthquake", center: [37.77, -122.42], preparation: "Review earthquake scenario readiness and essential supplies.", response: "Review reported infrastructure disruption and welfare checks." },
  { id: "tampa", name: "Tampa Bay, FL", hazard: "hurricane", center: [27.95, -82.46], preparation: "Review evacuation assistance and shelter options.", response: "Review temporary shelter and essential supply needs." },
  { id: "la", name: "Los Angeles foothills, CA", hazard: "wildfire", center: [34.18, -118.2], preparation: "Review smoke exposure and evacuation assistance needs.", response: "Review evacuation support and smoke-related needs." },
  { id: "minneapolis", name: "Minneapolis–Saint Paul, MN", hazard: "blizzard", center: [44.98, -93.27], preparation: "Check heating access and plan support for isolated households.", response: "Review warming shelter and supply delivery needs." },
  { id: "houston", name: "Houston, TX", hazard: "flood", center: [29.76, -95.37], preparation: "Review flood exposure and accessible shelter options.", response: "Review evacuation assistance and drinking water needs." },
];
// Deterministic fixtures keep the UI repeatable; no live feeds or risk calculations run here.
export const demoMapData: MapData = {
  // Small synthetic polygons surround each city; offsets are not measured hazard footprints.
  // Cycle severities to exercise all legend states and retain a fixed source timestamp.
  zones: hotspots.map((spot, i) => {
    const [lat, lng] = spot.center;
    return { id: spot.id, name: spot.name, hazard: spot.hazard, severity: i % 3 === 0 ? "critical" : i % 3 === 1 ? "high" : "moderate", boundary: [[lat - 0.22, lng - 0.3], [lat + 0.18, lng - 0.28], [lat + 0.25, lng + 0.2], [lat - 0.15, lng + 0.32]], source: "RiskReach fictional UI scenario", updatedAt: "2026-11-07T20:00:00Z", simulated: true, preparation: [spot.preparation], response: [spot.response] };
  }),
  // Three customer check-ins plus a community case exercise each rehearsal outcome.
  households: hotspots.flatMap((spot, i) => [
    { id: `${spot.id}-1`, zoneId: spot.id, name: `Demo household ${i * 4 + 1}`, position: [spot.center[0] + 0.035, spot.center[1] - 0.045] as Coordinate, isCustomer: true, checkIn: "unknown" as const, vulnerabilities: ["Limited mobility"], needs: ["Welfare check"], lastContactAt: null },
    { id: `${spot.id}-safe`, zoneId: spot.id, name: `Demo household ${i * 4 + 2}`, position: [spot.center[0] + 0.02, spot.center[1] + 0.01] as Coordinate, isCustomer: true, checkIn: "safe" as const, vulnerabilities: [], needs: [], lastContactAt: null },
    { id: `${spot.id}-followup`, zoneId: spot.id, name: `Demo household ${i * 4 + 3}`, position: [spot.center[0] - 0.03, spot.center[1] - 0.02] as Coordinate, isCustomer: true, checkIn: "unknown" as const, vulnerabilities: [], needs: [], lastContactAt: null },
    { id: `${spot.id}-2`, zoneId: spot.id, name: `Demo household ${i * 4 + 4}`, position: [spot.center[0] - 0.04, spot.center[1] + 0.06] as Coordinate, isCustomer: false, checkIn: "needs_help" as const, vulnerabilities: [], needs: ["Temporary shelter"], lastContactAt: "2026-11-07T18:30:00Z" },
  ]),
  // Explicit invented impact polygons. Context boundaries above remain geographic only.
  impactLayers: hotspots.flatMap((spot, i) => {
    const [lat, lng] = spot.center;
    const severity = i % 3 === 0 ? "critical" : i % 3 === 1 ? "high" : "moderate";
    const outer: Coordinate[] = spot.hazard === "tornado"
      ? [[lat - .12, lng - .22], [lat - .07, lng - .24], [lat + .15, lng + .17], [lat + .1, lng + .2]]
      : [[lat - .13, lng - .2], [lat + .13, lng - .14], [lat + .17, lng + .13], [lat - .1, lng + .21]];
    const inner: Coordinate[] = [[lat - .045, lng - .06], [lat + .06, lng - .05], [lat + .07, lng + .055], [lat - .04, lng + .075]];
    return [
      { id: `${spot.id}-outer`, hotspotId: spot.id, hazard: spot.hazard, boundary: outer, component: "scenario_extent", severity: "moderate", severityBasis: "Invented outer impact band for UI demonstration", source: "RiskReach fictional UI scenario", simulated: true, updatedAt: "2026-11-07T20:00:00Z", label: "Outer scenario impact area", limitations: "Illustrative geometry; not a forecast or measured footprint." },
      { id: `${spot.id}-core`, hotspotId: spot.id, hazard: spot.hazard, boundary: inner, component: "scenario_core", severity, severityBasis: "Invented inner impact band for UI demonstration", source: "RiskReach fictional UI scenario", simulated: true, updatedAt: "2026-11-07T20:00:00Z", label: "Core scenario impact area", limitations: "Illustrative geometry; no verified household exposure or evacuation order." },
    ];
  }),
  // One nearby team per hotspot supports the browser-local welfare-check rehearsal.
  teams: hotspots.map((spot, i) => ({ id: `team-${spot.id}`, zoneId: spot.id, name: `Response team ${i + 1}`, position: [spot.center[0] + 0.08, spot.center[1] + 0.09], status: "available", capacity: 4, capabilities: ["Welfare check", "Supply delivery"] })),
};
