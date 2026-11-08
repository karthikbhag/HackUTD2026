/**
 * Shared contract for the dataset-wide AI assistant ("Ask StateWatch AI", Person 4).
 * The browser summarizes the areas currently shown on the map into a compact overview:
 * per-area counts and labels only, no household names, IDs, or coordinates.
 *
 * Keep this file free of runtime imports other than ./area-review and ./area-chat so offline tests can load it.
 */
import type { MapData, MapZone, Phase } from "../map/types";
import { unsupportedNumbers } from "./area-review";
import { CHAT_LIMITS, cleanQuestion, type ChatTurn } from "./area-chat";

export const OVERVIEW_LIMITS = { areas: 12, topNeeds: 3, relatedAreas: 3 } as const;

export const OVERVIEW_STARTERS = [
  "Which areas have the most urgent check-ins?",
  "Where are households still uncontacted?",
  "Which areas have no available teams?",
] as const;

const SEVERITIES = ["moderate", "high", "critical"] as const;
const HAZARDS = ["tornado", "earthquake", "hurricane", "wildfire", "blizzard", "flood"] as const;
const CHECK_INS = ["unknown", "safe", "needs_help", "urgent"] as const;
const TEAM_STATUSES = ["available", "assigned", "responding", "unavailable"] as const;

type CheckIns = Record<(typeof CHECK_INS)[number], number>;
type TeamCounts = Record<(typeof TEAM_STATUSES)[number], number>;
export interface OverviewArea {
  id: string; name: string; hazard: MapZone["hazard"]; severity: MapZone["severity"]; simulated: boolean;
  impactLayers: number;
  /** Households whose geographic area is this one. Membership, not verified exposure. */
  households: number; customers: number; checkIns: CheckIns;
  withRecordedNeeds: number; withVulnerabilityFlags: number; neverContacted: number;
  topNeeds: { label: string; count: number }[];
  teams: TeamCounts;
}
export interface OverviewSnapshot {
  snapshotAt: string;
  phase: Phase;
  /** Totals across every area shown on the map, including areas left out of `areas`. */
  totals: { areas: number; households: number; customers: number; checkIns: CheckIns; withRecordedNeeds: number; neverContacted: number; teams: TeamCounts };
  /** Up to OVERVIEW_LIMITS.areas areas, most severe and most urgent first. */
  areas: OverviewArea[];
  /** Areas shown on the map but not included in `areas` (counted in totals only). */
  areasOmitted: number;
  simulated: boolean;
}
export interface OverviewChatRequest { snapshot: OverviewSnapshot; history: ChatTurn[]; question: string }
export interface OverviewChatAnswer { answer: string; relatedAreaIds: string[] }
export interface OverviewChatResult extends OverviewChatAnswer {
  model: string; generatedAt: string; tokens: number;
  /** Questions left for this view of the data, or null when there is no limit. */
  turnsLeft: number | null;
}

const clip = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 1)}…` : value;
const SEVERITY_RANK = { critical: 3, high: 2, moderate: 1 } as const;
const emptyCheckIns = (): CheckIns => ({ unknown: 0, safe: 0, needs_help: 0, urgent: 0 });
const emptyTeams = (): TeamCounts => ({ available: 0, assigned: 0, responding: 0, unavailable: 0 });

/** Summarizes what the map currently shows (same area membership rule as the area popup). */
export function buildOverviewSnapshot(data: MapData, phase: Phase, snapshotAt: string): OverviewSnapshot {
  const byArea = new Map(data.zones.map(zone => [zone.id, {
    zone, households: 0, customers: 0, checkIns: emptyCheckIns(), withRecordedNeeds: 0, withVulnerabilityFlags: 0, neverContacted: 0,
    needs: new Map<string, number>(), teams: emptyTeams(), impactLayers: 0,
  }]));
  const totals = { areas: data.zones.length, households: 0, customers: 0, checkIns: emptyCheckIns(), withRecordedNeeds: 0, neverContacted: 0, teams: emptyTeams() };
  for (const row of data.households) {
    const area = byArea.get(row.hotspotId ?? row.zoneId);
    if (!area) continue;
    area.households++; totals.households++;
    if (row.isCustomer) { area.customers++; totals.customers++; }
    area.checkIns[row.checkIn]++; totals.checkIns[row.checkIn]++;
    if (row.needs.length) { area.withRecordedNeeds++; totals.withRecordedNeeds++; }
    if (row.vulnerabilities.length) area.withVulnerabilityFlags++;
    if (!row.lastContactAt) { area.neverContacted++; totals.neverContacted++; }
    for (const need of row.needs) area.needs.set(need, (area.needs.get(need) ?? 0) + 1);
  }
  for (const team of data.teams) {
    const area = byArea.get(team.hotspotId ?? team.zoneId);
    if (!area) continue;
    area.teams[team.status]++; totals.teams[team.status]++;
  }
  for (const layer of data.impactLayers ?? []) { const area = byArea.get(layer.hotspotId); if (area) area.impactLayers++; }
  const ranked = [...byArea.values()].sort((a, b) =>
    SEVERITY_RANK[b.zone.severity] - SEVERITY_RANK[a.zone.severity] || b.checkIns.urgent - a.checkIns.urgent ||
    b.checkIns.needs_help - a.checkIns.needs_help || b.households - a.households || a.zone.name.localeCompare(b.zone.name));
  const areas = ranked.slice(0, OVERVIEW_LIMITS.areas).map(({ zone, needs, ...area }): OverviewArea => ({
    id: clip(zone.id, 120), name: clip(zone.name, 120), hazard: zone.hazard, severity: zone.severity, simulated: zone.simulated,
    impactLayers: area.impactLayers, households: area.households, customers: area.customers, checkIns: area.checkIns,
    withRecordedNeeds: area.withRecordedNeeds, withVulnerabilityFlags: area.withVulnerabilityFlags, neverContacted: area.neverContacted,
    topNeeds: [...needs].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, OVERVIEW_LIMITS.topNeeds).map(([label, count]) => ({ label: clip(label, 80), count })),
    teams: area.teams,
  }));
  return {
    snapshotAt, phase, totals, areas, areasOmitted: Math.max(0, data.zones.length - areas.length),
    simulated: data.zones.some(zone => zone.simulated) || (data.impactLayers ?? []).some(layer => layer.simulated),
  };
}

/** Stable fingerprint of the overview (excluding the snapshot time). */
export function overviewFingerprint(snapshot: OverviewSnapshot): string {
  return JSON.stringify({ ...snapshot, snapshotAt: undefined });
}

// ---------- validation ----------

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown, max: number) => typeof value === "string" && value.length <= max;
const count = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 10_000_000;
const oneOf = (values: readonly string[], value: unknown) => typeof value === "string" && values.includes(value);
const countsOf = (keys: readonly string[], value: unknown) => isObj(value) && Object.keys(value).length === keys.length && keys.every(key => count(value[key]));
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max;

function validArea(area: unknown): boolean {
  return isObj(area) && str(area.id, 120) && (area.id as string).length > 0 && str(area.name, 120) && oneOf(HAZARDS, area.hazard) && oneOf(SEVERITIES, area.severity) &&
    typeof area.simulated === "boolean" && count(area.impactLayers) && count(area.households) && count(area.customers) && countsOf(CHECK_INS, area.checkIns) &&
    count(area.withRecordedNeeds) && count(area.withVulnerabilityFlags) && count(area.neverContacted) && countsOf(TEAM_STATUSES, area.teams) &&
    Array.isArray(area.topNeeds) && area.topNeeds.length <= OVERVIEW_LIMITS.topNeeds && area.topNeeds.every(item => isObj(item) && str(item.label, 80) && count(item.count));
}

/** Validates an assistant request: the overview, at most CHAT_LIMITS.history earlier turns, and the question. */
export function parseOverviewChatRequest(value: unknown): { request: OverviewChatRequest } | { error: string } {
  if (!isObj(value) || !isObj(value.snapshot)) return { error: "Request must include an overview snapshot." };
  const s = value.snapshot;
  if (typeof s.snapshotAt !== "string" || s.snapshotAt.length > 40 || Number.isNaN(Date.parse(s.snapshotAt))) return { error: "Invalid snapshotAt." };
  if (s.phase !== "before" && s.phase !== "after") return { error: "Invalid phase." };
  const t = s.totals;
  if (!isObj(t) || !count(t.areas) || !count(t.households) || !count(t.customers) || !countsOf(CHECK_INS, t.checkIns) || !count(t.withRecordedNeeds) || !count(t.neverContacted) || !countsOf(TEAM_STATUSES, t.teams)) return { error: "Invalid totals." };
  if (!Array.isArray(s.areas) || s.areas.length > OVERVIEW_LIMITS.areas || !s.areas.every(validArea)) return { error: "Invalid areas." };
  if (new Set((s.areas as OverviewArea[]).map(area => area.id)).size !== s.areas.length) return { error: "Duplicate area IDs." };
  if (!count(s.areasOmitted) || typeof s.simulated !== "boolean") return { error: "Invalid overview." };
  if (typeof value.question !== "string") return { error: "Missing question." };
  const question = cleanQuestion(value.question);
  if (!question) return { error: "Question is empty." };
  if (question.length > CHAT_LIMITS.question) return { error: `Question is longer than ${CHAT_LIMITS.question} characters.` };
  const history = value.history;
  if (!Array.isArray(history) || history.length > CHAT_LIMITS.history ||
    !history.every(turn => isObj(turn) && text(turn.question, CHAT_LIMITS.question) && text(turn.answer, CHAT_LIMITS.answer))) return { error: "Invalid history." };
  return { request: { snapshot: s as unknown as OverviewSnapshot, history: history.map(turn => ({ question: cleanQuestion(turn.question), answer: turn.answer.trim() })), question } };
}

/** JSON schema requested from Gemini. */
export const OVERVIEW_ANSWER_JSON_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string", description: "At most 4 short sentences or 4 '-' bullets, based only on the overview." },
    relatedAreaIds: { type: "array", items: { type: "string" }, description: "IDs (from areas[].id) of up to 3 areas the answer is about. Empty if none." },
  },
  required: ["answer", "relatedAreaIds"],
  propertyOrdering: ["answer", "relatedAreaIds"],
} as const;

/**
 * Validates Gemini's JSON answer: non-empty, length-capped, no numbers outside the overview,
 * and related areas limited to IDs that are in the overview.
 */
export function parseOverviewChatAnswer(value: unknown, snapshot: OverviewSnapshot): { answer: OverviewChatAnswer } | { error: string } {
  if (!isObj(value) || typeof value.answer !== "string") return { error: "Gemini returned an answer in the wrong format." };
  const answer = value.answer.split("\n").map(line => line.replace(/^\s*\d+[.)]\s+/, "- ").trimEnd()).join("\n").trim();
  if (!answer) return { error: "Gemini returned an empty answer." };
  const clipped = clip(answer, CHAT_LIMITS.answer);
  const unsupported = unsupportedNumbers(clipped, snapshot);
  if (unsupported.length) return { error: `The answer was withheld because it mentioned numbers that are not in the evidence (${unsupported.slice(0, 3).join(", ")}). Try rephrasing the question.` };
  const known = new Set(snapshot.areas.map(area => area.id));
  const related = Array.isArray(value.relatedAreaIds) ? value.relatedAreaIds.filter((id): id is string => typeof id === "string" && known.has(id)) : [];
  return { answer: { answer: clipped, relatedAreaIds: [...new Set(related)].slice(0, OVERVIEW_LIMITS.relatedAreas) } };
}
