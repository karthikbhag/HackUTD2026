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
  // Two fictional records per hotspot exercise customer/community and check-in displays.
  households: hotspots.flatMap((spot, i) => [
    { id: `${spot.id}-1`, zoneId: spot.id, name: `Demo household ${i * 2 + 1}`, position: [spot.center[0] + 0.035, spot.center[1] - 0.045] as Coordinate, isCustomer: true, checkIn: "unknown" as const, vulnerabilities: ["Limited mobility"], needs: ["Welfare check"], lastContactAt: null },
    { id: `${spot.id}-2`, zoneId: spot.id, name: `Demo household ${i * 2 + 2}`, position: [spot.center[0] - 0.04, spot.center[1] + 0.06] as Coordinate, isCustomer: false, checkIn: "needs_help" as const, vulnerabilities: [], needs: ["Temporary shelter"], lastContactAt: "2026-11-07T18:30:00Z" },
  ]),
  // One nearby team per hotspot exercises marker selection; no dispatch is simulated.
  teams: hotspots.map((spot, i) => ({ id: `team-${spot.id}`, zoneId: spot.id, name: `Response team ${i + 1}`, position: [spot.center[0] + 0.08, spot.center[1] + 0.09], status: "available", capacity: 4, capabilities: ["Welfare check", "Supply delivery"] })),
};
