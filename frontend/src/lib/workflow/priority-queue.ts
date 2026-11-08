/**
 * Person 4 adapter: turns subscribed rows into a ranked follow-up queue using
 * Person 3's pure helpers (single source of truth, imported, not copied).
 * Nothing here is persisted or dispatched; scores are demo assumptions.
 */
import { calculateExposure, type Hazard as ExposureHazard, type ImpactLayer as ExposureLayer, type Polygon } from "../../../../backend/src/exposure";
import { DEFAULT_PRIORITY_CONFIG, type HouseholdExposure, type PriorityHousehold, type PriorityRequest } from "../../../../backend/src/priority";
import { detectFollowUp, type FollowUpConcern } from "../../../../backend/src/follow-up";
import type { OperationalRows } from "../map/backend-data";
import { hazards, type Hazard } from "../map/types";

type FollowUpRow = ReturnType<typeof detectFollowUp<string>>["households"][number];

export interface QueueItem {
  householdId: string;
  name: string;
  hazard: Hazard | null;
  zoneName: string;
  checkIn: PriorityHousehold["checkInStatus"];
  score: number;
  reasons: FollowUpRow["reasons"];
  concerns: (FollowUpConcern<string> | { code: "notification_reply_overdue"; explanation: string; requestIds: string[]; layerIds: string[] })[];
  needsFollowUp: boolean;
  overlooked: boolean;
  contactState: FollowUpRow["contactState"];
  contactExplanation: string;
  highestUrgency: number;
}

export interface PriorityQueue {
  items: QueueItem[];
  /** Plain-language note on where exposure evidence came from. */
  exposureNote: string;
  label: string;
  maxScore: number;
}

const CHECK_INS = ["unknown", "safe", "needs_help", "urgent"] as const;
const REQUEST_STATUSES = ["open", "assigned", "in_progress", "resolved"] as const;
const micros = (value: { microsSinceUnixEpoch: bigint }) => value.microsSinceUnixEpoch;
// Exposure helper expects second-precision ISO with "Z"; Date.toISOString() fits.
const isoFromMicros = (value: bigint) => new Date(Number(value / 1000n)).toISOString();

/** Highest possible score under the default weights, for "score / max" display. */
function maxScore() {
  const c = DEFAULT_PRIORITY_CONFIG;
  const contact = Math.max(c.neverContactedPoints, ...c.contactTiers.map(t => t.points));
  return Math.max(...c.urgencyPoints) + c.distinctNeedCap * c.pointsPerDistinctNeed + Math.max(...Object.values(c.checkInPoints)) +
    Math.max(c.exposurePoints.high, c.exposurePoints.critical ?? c.exposurePoints.high) + c.vulnerabilityCap + contact;
}

/** Converts subscribed impact layers into exposure evidence; falls back to "no exposure" with an explicit note. */
function exposures(rows: OperationalRows, ids: string[]): { list: HouseholdExposure<string>[]; note: string } {
  const empty = ids.map(householdId => ({ householdId, exposures: [] }));
  const raw = rows.impactLayers ?? [];
  if (!raw.length) return { list: empty, note: "No impact layers in the database, so exposure adds 0 points for every household." };
  const usable: ExposureLayer<string>[] = [];
  let skipped = 0;
  for (const row of raw) {
    let geometry: Polygon | null = null;
    try { geometry = JSON.parse(row.geometry); } catch { /* counted below */ }
    const supported = geometry?.type === "Polygon" && geometry.coordinates.length === 1 &&
      (row.severity === "moderate" || row.severity === "high" || row.severity === "critical") && Object.prototype.hasOwnProperty.call(hazards, row.hazardType) &&
      (row.dataKind === "simulation" || row.dataKind === "forecast" || row.dataKind === "report");
    if (!supported || !geometry) { skipped++; continue; }
    const layer: ExposureLayer<string> = { id: row.id, disaster_id: row.disasterId.toString(), hazard_type: row.hazardType as ExposureHazard, component: row.component,
      severity: row.severity as "moderate" | "high" | "critical", geometry, data_kind: row.dataKind as ExposureLayer["data_kind"],
      is_simulated: row.isSimulated, source: row.source, updated_at: isoFromMicros(micros(row.updatedAt)), label: row.label };
    // Validate each layer with Person 3's own rules, so one bad layer is skipped instead of zeroing exposure for everyone.
    try { calculateExposure([], [layer]); } catch { skipped++; continue; }
    if (usable.some(existing => existing.id === layer.id)) { skipped++; continue; }
    usable.push(layer);
  }
  try {
    const located = rows.households.map(h => ({ id: h.id.toString(), latitude: h.latitude, longitude: h.longitude }));
    const result = calculateExposure(located, usable);
    const byId = new Map(result.households.map(h => [h.householdId, h.exposures]));
    return { list: ids.map(householdId => ({ householdId, exposures: byId.get(householdId) ?? [] })),
      note: `Exposure computed in this browser from ${usable.length} simulated impact layer(s)${skipped ? `; ${skipped} unsupported layer(s) ignored` : ""}.` };
  } catch (error) {
    return { list: empty, note: `Impact layers could not be evaluated (${error instanceof Error ? error.message : String(error)}); exposure adds 0 points.` };
  }
}

/** Builds the queue. Throws when Person 3's helpers reject the data, so callers can show the reason. */
export function buildPriorityQueue(rows: OperationalRows, browserNowMicros: bigint): PriorityQueue {
  const households: PriorityHousehold<string>[] = rows.households.map(h => ({
    id: h.id.toString(),
    checkInStatus: (CHECK_INS as readonly string[]).includes(h.checkInStatus) ? h.checkInStatus as PriorityHousehold["checkInStatus"] : "unknown",
    vulnerabilityFlags: h.vulnerabilityFlags,
    lastContactAtMicros: h.lastContactAt ? micros(h.lastContactAt) : undefined,
  }));
  const requests: PriorityRequest<string>[] = rows.requests
    .filter(r => (REQUEST_STATUSES as readonly string[]).includes(r.status))
    .map(r => ({ id: r.id.toString(), householdId: r.householdId.toString(), needType: r.needType, urgency: r.urgency, status: r.status as PriorityRequest["status"] }));
  // The helpers reject contact times later than "now"; tolerate small clock skew
  // between this browser and the database by never using a clock behind the data.
  const latestContact = households.reduce((latest, h) => h.lastContactAtMicros !== undefined && h.lastContactAtMicros > latest ? h.lastContactAtMicros : latest, 0n);
  const now = browserNowMicros > latestContact ? browserNowMicros : latestContact;
  const exposure = exposures(rows, households.map(h => h.id));
  const result = detectFollowUp(households, requests, exposure.list, now);

  const zones = new Map(rows.zones.map(z => [z.id.toString(), z]));
  const disasterType = new Map(rows.disasters.map(d => [d.id.toString(), d.type]));
  const source = new Map(rows.households.map(h => [h.id.toString(), h]));
  const checkIns = new Map(households.map(h => [h.id, h.checkInStatus]));
  const overdue = new Set(rows.dashboardOverdueHouseholdIds ?? []);
  const items = result.households.map(row => {
    const household = source.get(row.householdId)!;
    const zone = zones.get(household.zoneId.toString());
    const type = zone && disasterType.get(zone.disasterId.toString());
    return {
      householdId: row.householdId, name: household.displayName,
      hazard: type && Object.prototype.hasOwnProperty.call(hazards, type) ? type as Hazard : null,
      zoneName: zone?.name ?? "Unknown zone", checkIn: checkIns.get(row.householdId)!,
      score: row.score, reasons: row.reasons, concerns: overdue.has(row.householdId) ? [...row.concerns, {
        code: "notification_reply_overdue" as const, explanation: "No reply by this area's shared synthetic second-notification deadline; ordinary contact-age thresholds remain separate.", requestIds: [], layerIds: [],
      }] : row.concerns, needsFollowUp: row.needsFollowUp || overdue.has(row.householdId), overlooked: row.overlooked || overdue.has(row.householdId),
      contactState: row.contactState, contactExplanation: row.contactExplanation, highestUrgency: row.highestUrgency,
    };
  });
  return { items, exposureNote: exposure.note, label: result.assumptions.label, maxScore: maxScore() };
}
