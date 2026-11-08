/**
 * Shared contract for the AI area review (Person 4). Used by the browser to build
 * a small evidence snapshot and by the server route to validate it and Gemini's reply.
 *
 * Keep this file free of runtime imports so offline tests can load it directly.
 * The snapshot carries counts and labels only: no household names, IDs, or coordinates.
 */
import type { MapData, MapZone, Phase } from "../map/types";

export const LIMITS = { layers: 8, guidance: 5, topCounts: 8, text: 400, reviewItems: 5, reviewText: 600, summary: 1200 } as const;

const CHECK_INS = ["unknown", "safe", "needs_help", "urgent"] as const;
const TEAM_STATUSES = ["available", "assigned", "responding", "unavailable"] as const;
const HAZARDS = ["tornado", "earthquake", "hurricane", "wildfire", "blizzard", "flood"] as const;
const SEVERITIES = ["moderate", "high", "critical"] as const;
const DATA_KINDS = ["simulation", "forecast", "report", "unspecified"] as const;

export interface SnapshotLayer {
  label: string; component: string; severity: string; severityBasis: string; limitations: string;
  source: string; simulated: boolean; dataKind: (typeof DATA_KINDS)[number]; updatedAt: string;
}
export interface Tally { label: string; count: number }
export interface AreaSnapshot {
  areaId: string;
  snapshotAt: string;
  phase: Phase;
  area: { name: string; hazard: MapZone["hazard"]; severity: MapZone["severity"]; source: string; updatedAt: string; simulated: boolean };
  impactLayers: SnapshotLayer[];
  /** Households whose geographic area is this one. Membership, not verified exposure. */
  households: {
    total: number; customers: number;
    checkIns: Record<(typeof CHECK_INS)[number], number>;
    withRecordedNeeds: number; withVulnerabilityFlags: number; neverContacted: number;
    needs: Tally[]; vulnerabilities: Tally[];
  };
  teams: { total: number; byStatus: Record<(typeof TEAM_STATUSES)[number], number> };
  /** Scenario-supplied advisories for this phase; templates, not instructions from officials. */
  guidance: string[];
}

export interface AreaReview {
  summary: string;
  expectedConditions: string[];
  reportedImpacts: string[];
  keyRisks: string[];
  nextSteps: string[];
  limitations: string[];
}

/** Successful route response. */
export interface AreaReviewResult {
  areaId: string; phase: Phase; snapshotAt: string; generatedAt: string; model: string; simulated: boolean; review: AreaReview;
  /** True when identical evidence was answered from the server cache (no Gemini tokens used). */
  cached: boolean;
  /** Gemini tokens used when this review was generated (0 if unknown). */
  tokens: number;
}
export type AreaReviewErrorCode = "not_configured" | "invalid_request" | "rate_limited" | "upstream_error" | "timeout" | "invalid_response" | "forbidden" | "limit_reached";
export interface AreaReviewError { error: { code: AreaReviewErrorCode; message: string; retryAfterSeconds?: number } }

const clip = (value: string, max: number = LIMITS.text) => value.length > max ? `${value.slice(0, max - 1)}…` : value;
function tally(values: string[]): Tally[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, LIMITS.topCounts).map(([label, count]) => ({ label: clip(label, 80), count }));
}

/** Builds the snapshot sent to the server. Uses the same area filters as the area review popup. */
export function buildAreaSnapshot(data: MapData, zone: MapZone, phase: Phase, snapshotAt: string): AreaSnapshot {
  const households = data.households.filter(row => (row.hotspotId ?? row.zoneId) === zone.id);
  const teams = data.teams.filter(row => (row.hotspotId ?? row.zoneId) === zone.id);
  const layers = (data.impactLayers ?? []).filter(row => row.hotspotId === zone.id);
  const checkIns = { unknown: 0, safe: 0, needs_help: 0, urgent: 0 };
  for (const row of households) checkIns[row.checkIn]++;
  const byStatus = { available: 0, assigned: 0, responding: 0, unavailable: 0 };
  for (const row of teams) byStatus[row.status]++;
  return {
    areaId: zone.id, snapshotAt, phase,
    area: { name: clip(zone.name, 120), hazard: zone.hazard, severity: zone.severity, source: clip(zone.source, 200), updatedAt: zone.updatedAt, simulated: zone.simulated },
    impactLayers: layers.slice(0, LIMITS.layers).map(layer => ({
      label: clip(layer.label, 120), component: clip(layer.component, 80), severity: clip(layer.severity, 40), severityBasis: clip(layer.severityBasis),
      limitations: clip(layer.limitations), source: clip(layer.source, 200), simulated: layer.simulated, dataKind: layer.dataKind ?? "unspecified", updatedAt: layer.updatedAt,
    })),
    households: {
      total: households.length, customers: households.filter(row => row.isCustomer).length, checkIns,
      withRecordedNeeds: households.filter(row => row.needs.length).length,
      withVulnerabilityFlags: households.filter(row => row.vulnerabilities.length).length,
      neverContacted: households.filter(row => !row.lastContactAt).length,
      needs: tally(households.flatMap(row => row.needs)), vulnerabilities: tally(households.flatMap(row => row.vulnerabilities)),
    },
    teams: { total: teams.length, byStatus },
    guidance: (phase === "after" ? zone.response : zone.preparation).slice(0, LIMITS.guidance).map(item => clip(item)),
  };
}

/** Stable fingerprint of the evidence (excluding the snapshot time), to detect data changes after generation. */
export function snapshotFingerprint(snapshot: AreaSnapshot): string {
  return JSON.stringify({ ...snapshot, snapshotAt: undefined });
}

// ---------- validation (server side; also exercised by offline tests) ----------

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown, max: number) => typeof value === "string" && value.length <= max;
const count = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 10_000_000;
const iso = (value: unknown) => typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
const oneOf = <T extends readonly string[]>(values: T, value: unknown): value is T[number] => typeof value === "string" && (values as readonly string[]).includes(value);
const tallies = (value: unknown) => Array.isArray(value) && value.length <= LIMITS.topCounts && value.every(item => isObj(item) && str(item.label, 80) && count(item.count));
const countsOf = (keys: readonly string[], value: unknown) => isObj(value) && keys.every(key => count(value[key])) && Object.keys(value).length === keys.length;

/** Returns the snapshot when it matches the contract and limits, otherwise a reason. */
export function parseAreaSnapshot(value: unknown): { snapshot: AreaSnapshot } | { error: string } {
  if (!isObj(value)) return { error: "Snapshot must be an object." };
  const { area, households, teams, impactLayers, guidance } = value;
  if (!str(value.areaId, 120) || !(value.areaId as string).length) return { error: "Invalid areaId." };
  if (!iso(value.snapshotAt)) return { error: "Invalid snapshotAt." };
  if (value.phase !== "before" && value.phase !== "after") return { error: "Invalid phase." };
  if (!isObj(area) || !str(area.name, 120) || !oneOf(HAZARDS, area.hazard) || !oneOf(SEVERITIES, area.severity) || !str(area.source, 200) || !iso(area.updatedAt) || typeof area.simulated !== "boolean") return { error: "Invalid area." };
  if (!Array.isArray(impactLayers) || impactLayers.length > LIMITS.layers || !impactLayers.every(layer => isObj(layer) &&
    str(layer.label, 120) && str(layer.component, 80) && str(layer.severity, 40) && str(layer.severityBasis, LIMITS.text) && str(layer.limitations, LIMITS.text) &&
    str(layer.source, 200) && typeof layer.simulated === "boolean" && oneOf(DATA_KINDS, layer.dataKind) && iso(layer.updatedAt))) return { error: "Invalid impactLayers." };
  if (!isObj(households) || !count(households.total) || !count(households.customers) || !countsOf(CHECK_INS, households.checkIns) ||
    !count(households.withRecordedNeeds) || !count(households.withVulnerabilityFlags) || !count(households.neverContacted) ||
    !tallies(households.needs) || !tallies(households.vulnerabilities)) return { error: "Invalid households." };
  if (!isObj(teams) || !count(teams.total) || !countsOf(TEAM_STATUSES, teams.byStatus)) return { error: "Invalid teams." };
  if (!Array.isArray(guidance) || guidance.length > LIMITS.guidance || !guidance.every(item => str(item, LIMITS.text))) return { error: "Invalid guidance." };
  return { snapshot: value as unknown as AreaSnapshot };
}

/** JSON schema requested from Gemini (structured output). */
export const AREA_REVIEW_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "2-4 sentence situation summary based only on the snapshot." },
    expectedConditions: { type: "array", items: { type: "string" }, description: "What the scenario, simulation, or forecast evidence says could happen. Not observed facts." },
    reportedImpacts: { type: "array", items: { type: "string" }, description: "Only what household check-ins, recorded needs, or layers with dataKind 'report' say has happened. Empty if none." },
    keyRisks: { type: "array", items: { type: "string" } },
    nextSteps: { type: "array", items: { type: "string" }, description: "Suggestions for an employee to review and decide on. Never state that anything has been sent, dispatched, or changed." },
    limitations: { type: "array", items: { type: "string" }, description: "Gaps or caveats in the evidence." },
  },
  required: ["summary", "expectedConditions", "reportedImpacts", "keyRisks", "nextSteps", "limitations"],
  propertyOrdering: ["summary", "expectedConditions", "reportedImpacts", "keyRisks", "nextSteps", "limitations"],
} as const;

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const normalize = (token: string) => String(Number(token.replaceAll(",", "")));
/** Every number that appears anywhere in the evidence, normalized ("07" and "7" match). */
function allowedNumbers(evidence: unknown): Set<string> {
  return new Set((JSON.stringify(evidence).match(NUMBER) ?? []).map(normalize));
}

/**
 * Validates Gemini's JSON. Rejects missing fields, oversized text, and any number
 * that does not appear in the snapshot, so the review cannot introduce new figures.
 */
export function parseAreaReview(value: unknown, snapshot: AreaSnapshot): { review: AreaReview } | { error: string } {
  if (!isObj(value)) return { error: "Response was not a JSON object." };
  const list = (key: keyof AreaReview) => {
    const items = value[key];
    if (!Array.isArray(items) || !items.every(item => typeof item === "string")) return null;
    return (items as string[]).map(item => item.trim()).filter(Boolean).slice(0, LIMITS.reviewItems).map(item => clip(item, LIMITS.reviewText));
  };
  if (typeof value.summary !== "string" || !value.summary.trim()) return { error: "Response is missing a summary." };
  const review: AreaReview = {
    summary: clip(value.summary.trim(), LIMITS.summary),
    expectedConditions: list("expectedConditions") ?? [], reportedImpacts: list("reportedImpacts") ?? [],
    keyRisks: list("keyRisks") ?? [], nextSteps: list("nextSteps") ?? [], limitations: list("limitations") ?? [],
  };
  for (const key of ["expectedConditions", "reportedImpacts", "keyRisks", "nextSteps", "limitations"] as const) if (list(key) === null) return { error: `Response field ${key} is invalid.` };
  const text = [review.summary, ...review.expectedConditions, ...review.reportedImpacts, ...review.keyRisks, ...review.nextSteps, ...review.limitations].join("\n");
  const unsupported = unsupportedNumbers(text, snapshot);
  if (unsupported.length) return { error: `Response included numbers not in the evidence (${unsupported.slice(0, 3).join(", ")}).` };
  return { review };
}

/** Numbers in AI text that do not appear anywhere in the evidence (shared by reviews, follow-ups, and the assistant). */
export function unsupportedNumbers(text: string, evidence: unknown): string[] {
  const allowed = allowedNumbers(evidence);
  return [...new Set((text.match(NUMBER) ?? []).map(normalize))].filter(token => !allowed.has(token));
}
