/** Frontend view models. Adapt backend bindings here; these are not database tables. */
// Shared display metadata keeps layer controls and polygon colors consistent.
export const hazards = {
  tornado: { label: "Tornado", color: "#9b65c7" },
  earthquake: { label: "Earthquake", color: "#b67a45" },
  hurricane: { label: "Hurricane", color: "#3978bf" },
  wildfire: { label: "Wildfire", color: "#de653d" },
  blizzard: { label: "Blizzard", color: "#448e9b" },
  flood: { label: "Flood", color: "#5265bc" },
} as const;
export type Hazard = keyof typeof hazards;
export type Phase = "before" | "after";
// Leaflet uses [latitude, longitude]; reverse GeoJSON [longitude, latitude] in the adapter.
export type Coordinate = [latitude: number, longitude: number];
export interface MapZone {
  id: string;
  name: string;
  hazard: Hazard;
  severity: "moderate" | "high" | "critical";
  /** One polygon ring; holes and MultiPolygons need an extended renderer. */
  boundary: Coordinate[];
  source: string;
  /** Valid ISO timestamp supplied by the scenario or backend adapter. */
  updatedAt: string;
  simulated: boolean;
  preparation: string[];
  response: string[];
}
export interface MapHousehold {
  id: string;
  zoneId: string;
  name: string;
  position: Coordinate;
  isCustomer: boolean;
  checkIn: "unknown" | "safe" | "needs_help" | "urgent";
  vulnerabilities: string[];
  needs: string[];
  /** Null means no recorded contact, independently of check-in or request status. */
  lastContactAt: string | null;
}
export interface MapTeam {
  id: string;
  /** UI grouping for filtering/details; not a required backend team field. */
  zoneId: string;
  name: string;
  position: Coordinate;
  status: "available" | "assigned" | "responding" | "unavailable";
  capacity: number;
  capabilities: string[];
}
export interface MapData {
  zones: MapZone[];
  households: MapHousehold[];
  teams: MapTeam[];
}
// Include the entity kind because IDs may overlap between backend tables.
export type Selection = { kind: "zone" | "household" | "team"; id: string } | null;
export type DataStatus = "demo" | "loading" | "connected" | "error";
// Use an explicit display timezone so browser/server settings do not change the label.
export function displayTime(value: string | null) {
  if (!value) return "No contact recorded";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short" }).format(new Date(value));
}
