/** Transparent demo scoring; no SDK, clock, I/O, or mutation of caller data.
 * Pass ctx.timestamp.microsSinceUnixEpoch from module code. This helper does not
 * authorize callers, dispatch teams, close requests, or persist a priority queue.
 */
import type { ExposureEvidence, RecordId } from './exposure';

export interface PriorityHousehold<Id extends RecordId = string> {
  id: Id;
  checkInStatus: 'unknown' | 'safe' | 'needs_help' | 'urgent';
  vulnerabilityFlags: readonly string[];
  lastContactAtMicros?: bigint;
}
export interface PriorityRequest<Id extends RecordId = string> {
  id: Id; householdId: Id; needType: string; urgency: number;
  status: 'open' | 'assigned' | 'in_progress' | 'resolved';
}
export interface HouseholdExposure<Id extends RecordId = string> {
  householdId: Id; exposures: readonly ExposureEvidence<Id>[];
}
export interface PriorityConfig {
  readonly label: string;
  readonly urgencyPoints: readonly [number, number, number, number, number];
  readonly pointsPerDistinctNeed: number;
  readonly distinctNeedCap: number;
  readonly checkInPoints: Readonly<Record<PriorityHousehold['checkInStatus'], number>>;
  readonly exposurePoints: Readonly<{ moderate: number; high: number; critical?: number }>;
  readonly vulnerabilityPoints: Readonly<Record<string, number>>;
  readonly vulnerabilityCap: number;
  readonly neverContactedPoints: number;
  readonly contactTiers: readonly { readonly afterMinutes: number; readonly points: number }[];
}
export const DEFAULT_PRIORITY_CONFIG: PriorityConfig = {
  label: 'RiskReach demo assumptions v1; employee review required',
  urgencyPoints: [5, 10, 20, 35, 50],
  pointsPerDistinctNeed: 5, distinctNeedCap: 3,
  checkInPoints: { unknown: 0, safe: 0, needs_help: 10, urgent: 20 },
  exposurePoints: { moderate: 15, high: 30, critical: 45 },
  vulnerabilityPoints: { limited_mobility: 15, transport_needed: 15 }, vulnerabilityCap: 30,
  neverContactedPoints: 30,
  contactTiers: [{ afterMinutes: 60, points: 5 }, { afterMinutes: 360, points: 15 }, { afterMinutes: 1440, points: 25 }],
};
export interface PriorityReason {
  factor: 'request_urgency' | 'unresolved_needs' | 'check_in' | 'exposure' | 'vulnerability' | 'contact_age';
  points: number; explanation: string;
}
const MAX_MICROS = (1n << 63n) - 1n;
function requireValid(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid priority input: ${message}`);
}
function validId(value: RecordId) {
  return typeof value === 'bigint' || (typeof value === 'string' && value.trim().length > 0);
}
function compareIds(a: RecordId, b: RecordId) {
  if (typeof a === typeof b) return a < b ? -1 : a > b ? 1 : 0;
  return typeof a === 'bigint' ? -1 : 1;
}
function validateConfig(config: PriorityConfig) {
  const points = (value: number) => requireValid(Number.isSafeInteger(value) && value >= 0 && value <= 10000, 'weights must be integers from 0 to 10000');
  requireValid(config.label.trim(), 'configuration label');
  requireValid(config.urgencyPoints.length === 5, 'five urgency weights required');
  config.urgencyPoints.forEach((p, i) => { points(p); if (i) requireValid(p >= config.urgencyPoints[i - 1], 'urgency weights must not decrease'); });
  points(config.pointsPerDistinctNeed); points(config.distinctNeedCap);
  for (const status of ['unknown', 'safe', 'needs_help', 'urgent'] as const) points(config.checkInPoints[status]);
  points(config.exposurePoints.moderate); points(config.exposurePoints.high);
  requireValid(config.exposurePoints.high >= config.exposurePoints.moderate, 'high exposure must not score below moderate');
  if (config.exposurePoints.critical !== undefined) { points(config.exposurePoints.critical); requireValid(config.exposurePoints.critical >= config.exposurePoints.high, 'critical exposure must not score below high'); }
  Object.values(config.vulnerabilityPoints).forEach(points);
  points(config.vulnerabilityCap); points(config.neverContactedPoints);
  let previousMinutes = 0, previousPoints = 0;
  for (const tier of config.contactTiers) {
    requireValid(Number.isSafeInteger(tier.afterMinutes) && tier.afterMinutes > previousMinutes, 'contact thresholds must increase');
    points(tier.points); requireValid(tier.points >= previousPoints, 'contact points must not decrease');
    previousMinutes = tier.afterMinutes; previousPoints = tier.points;
  }
}

/** Scores all supplied households; queue eligibility/filtering is a consumer
 * decision. No customer field is accepted or read. Exposure coverage is required
 * even for unexposed households so missing data cannot silently lower priority.
 */
export function rankHouseholds<Id extends RecordId>(
  households: readonly PriorityHousehold<Id>[], requests: readonly PriorityRequest<Id>[],
  exposures: readonly HouseholdExposure<Id>[], nowMicros: bigint,
  config: PriorityConfig = DEFAULT_PRIORITY_CONFIG,
) {
  validateConfig(config);
  requireValid(typeof nowMicros === 'bigint' && nowMicros >= 0n && nowMicros <= MAX_MICROS, 'explicit nonnegative i64 clock required');
  const householdById = new Map<Id, PriorityHousehold<Id>>();
  for (const h of households) {
    requireValid(validId(h.id) && !householdById.has(h.id), 'duplicate/empty household ID');
    requireValid(['unknown', 'safe', 'needs_help', 'urgent'].includes(h.checkInStatus), 'check-in status');
    requireValid(h.vulnerabilityFlags.every(v => typeof v === 'string' && v.trim()), 'vulnerability flag');
    requireValid(h.lastContactAtMicros === undefined || (typeof h.lastContactAtMicros === 'bigint' && h.lastContactAtMicros >= 0n && h.lastContactAtMicros <= nowMicros), 'invalid/future contact time');
    householdById.set(h.id, h);
  }
  const exposureByHousehold = new Map<Id, readonly ExposureEvidence<Id>[]>();
  for (const row of exposures) {
    requireValid(householdById.has(row.householdId) && !exposureByHousehold.has(row.householdId), 'unknown/duplicate exposure household');
    const seen = new Set<Id>();
    for (const e of row.exposures) {
      requireValid(validId(e.layerId) && !seen.has(e.layerId) && ['moderate', 'high', 'critical'].includes(e.severity), 'duplicate/invalid exposure evidence');
      seen.add(e.layerId);
    }
    exposureByHousehold.set(row.householdId, row.exposures);
  }
  requireValid(exposureByHousehold.size === householdById.size, 'exposure coverage missing for household');
  const activeByHousehold = new Map<Id, PriorityRequest<Id>[]>();
  const requestIds = new Set<Id>();
  for (const request of requests) {
    requireValid(validId(request.id) && !requestIds.has(request.id), 'duplicate/empty request ID');
    requestIds.add(request.id);
    requireValid(householdById.has(request.householdId), 'request references unknown household');
    requireValid(['open', 'assigned', 'in_progress', 'resolved'].includes(request.status), 'request status');
    requireValid(Number.isInteger(request.urgency) && request.urgency >= 1 && request.urgency <= 5 && request.needType.trim(), 'urgency/need type');
    if (request.status === 'resolved') continue;
    const active = activeByHousehold.get(request.householdId) ?? [];
    active.push(request); activeByHousehold.set(request.householdId, active);
  }
  const ranked = households.map(household => {
    const active = activeByHousehold.get(household.id) ?? [];
    const matched = [...exposureByHousehold.get(household.id)!].sort((a, b) => compareIds(a.layerId, b.layerId));
    const highestUrgency = active.reduce((highest, r) => Math.max(highest, r.urgency), 0);
    const needs = [...new Set(active.map(r => r.needType))].sort();
    const highestSeverity = matched.some(e => e.severity === 'critical') ? 'critical' : matched.some(e => e.severity === 'high') ? 'high' : matched.length ? 'moderate' : undefined;
    const flags = [...new Set(household.vulnerabilityFlags)].sort();
    const unknownFlags = flags.filter(f => !Object.prototype.hasOwnProperty.call(config.vulnerabilityPoints, f));
    const vulnerability = Math.min(config.vulnerabilityCap, flags.reduce((sum, f) => sum + (Object.prototype.hasOwnProperty.call(config.vulnerabilityPoints, f) ? config.vulnerabilityPoints[f] : 0), 0));
    const contactAgeMinutes = household.lastContactAtMicros === undefined ? undefined : Number((nowMicros - household.lastContactAtMicros) / 60_000_000n);
    let contactPoints = household.lastContactAtMicros === undefined ? config.neverContactedPoints : 0;
    if (contactAgeMinutes !== undefined) for (const tier of config.contactTiers) if (contactAgeMinutes >= tier.afterMinutes) contactPoints = tier.points;
    const reasons: PriorityReason[] = [
      { factor: 'request_urgency', points: highestUrgency ? config.urgencyPoints[highestUrgency - 1] : 0,
        explanation: highestUrgency ? `Highest unresolved request urgency is ${highestUrgency}/5 across ${active.length} active request(s).` : 'No unresolved requests contribute urgency.' },
      { factor: 'unresolved_needs', points: Math.min(config.distinctNeedCap, needs.length) * config.pointsPerDistinctNeed,
        explanation: needs.length ? `Distinct unresolved needs: ${needs.join(', ')}; scoring capped at ${config.distinctNeedCap}.` : 'No unresolved assistance needs from requests.' },
      { factor: 'check_in', points: config.checkInPoints[household.checkInStatus], explanation: `Check-in status: ${household.checkInStatus}; independent of assistance-request status.` },
      { factor: 'exposure', points: highestSeverity === 'critical' ? config.exposurePoints.critical ?? config.exposurePoints.high : highestSeverity ? config.exposurePoints[highestSeverity] : 0,
        explanation: highestSeverity ? `Highest matching impact severity: ${highestSeverity}; ${matched.length} layer(s) retained as evidence, scored once.` : 'No exposure in the supplied impact layers.' },
      { factor: 'vulnerability', points: vulnerability,
        explanation: `Vulnerability flags: ${flags.join(', ') || 'none'}; points capped at ${config.vulnerabilityCap}.${unknownFlags.length ? ` Unweighted flags: ${unknownFlags.join(', ')} (review needed).` : ''}` },
      { factor: 'contact_age', points: contactPoints, explanation: contactAgeMinutes === undefined ? 'No contact has been recorded.' : `Last recorded contact was ${contactAgeMinutes} whole minute(s) ago; demo contact tiers apply.` },
    ];
    return { householdId: household.id, score: reasons.reduce((sum, r) => sum + r.points, 0), reasons,
      unresolvedRequestCount: active.length, unresolvedNeeds: needs, highestUrgency, highestSeverity,
      contactAgeMinutes, exposureEvidence: matched };
  });
  ranked.sort((a, b) => b.score - a.score || b.highestUrgency - a.highestUrgency ||
    (a.contactAgeMinutes === undefined ? (b.contactAgeMinutes === undefined ? 0 : -1) : b.contactAgeMinutes === undefined ? 1 : b.contactAgeMinutes - a.contactAgeMinutes) || compareIds(a.householdId, b.householdId));
  return { assumptions: structuredConfig(config), ranked };
}

function structuredConfig(config: PriorityConfig): PriorityConfig {
  return { ...config, urgencyPoints: [...config.urgencyPoints], checkInPoints: { ...config.checkInPoints },
    exposurePoints: { ...config.exposurePoints }, vulnerabilityPoints: { ...config.vulnerabilityPoints },
    contactTiers: config.contactTiers.map(tier => ({ ...tier })) };
}
