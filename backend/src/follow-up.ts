/** Deterministic demo follow-up rules; no SDK calls, clock, I/O, or dispatch.
 * Contact freshness is separate from assistance resolution and check-in status.
 */
import { rankHouseholds, DEFAULT_PRIORITY_CONFIG, type PriorityHousehold, type PriorityRequest,
  type HouseholdExposure, type PriorityConfig } from './priority';
import type { RecordId } from './exposure';

export interface FollowUpConfig {
  readonly label: string;
  readonly standardAfterMinutes: number;
  readonly urgentAfterMinutes: number;
  readonly urgentRequestThreshold: number;
  readonly minimumExposureSeverity: 'moderate' | 'high';
  readonly includeVulnerableExposure: boolean;
}
export const DEFAULT_FOLLOW_UP_CONFIG: FollowUpConfig = {
  label: 'RiskReach follow-up demo assumptions v1; employee review required',
  standardAfterMinutes: 360, urgentAfterMinutes: 60, urgentRequestThreshold: 4,
  minimumExposureSeverity: 'high', includeVulnerableExposure: true,
};
export type ConcernCode = 'unresolved_requests' | 'check_in_need' | 'unconfirmed_exposure' | 'vulnerable_exposure';
export interface FollowUpConcern<Id extends RecordId = string> {
  code: ConcernCode; explanation: string; requestIds: Id[]; layerIds: Id[];
}
function compareIds(a: RecordId, b: RecordId) {
  if (typeof a === typeof b) return a < b ? -1 : a > b ? 1 : 0;
  return typeof a === 'bigint' ? -1 : 1;
}
function validateConfig(config: FollowUpConfig) {
  const validMinutes = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= 525600;
  if (!config.label.trim() || !validMinutes(config.standardAfterMinutes) || !validMinutes(config.urgentAfterMinutes) ||
    config.urgentAfterMinutes > config.standardAfterMinutes || !Number.isInteger(config.urgentRequestThreshold) ||
    config.urgentRequestThreshold < 1 || config.urgentRequestThreshold > 5 ||
    !['moderate', 'high'].includes(config.minimumExposureSeverity) || typeof config.includeVulnerableExposure !== 'boolean') {
    throw new Error('Invalid follow-up configuration: labeled positive thresholds (at most one year), urgent <= standard, urgency 1..5, severity and boolean required');
  }
}

export function detectFollowUp<Id extends RecordId>(
  households: readonly PriorityHousehold<Id>[], requests: readonly PriorityRequest<Id>[],
  exposures: readonly HouseholdExposure<Id>[], nowMicros: bigint,
  config: FollowUpConfig = DEFAULT_FOLLOW_UP_CONFIG,
  priorityConfig: PriorityConfig = DEFAULT_PRIORITY_CONFIG,
) {
  validateConfig(config);
  // Reuse validated source joins, exposure coverage, contact times, and stable
  // priority order. A priority score is never used as a flag threshold.
  const priority = rankHouseholds(households, requests, exposures, nowMicros, priorityConfig);
  const householdById = new Map(households.map(h => [h.id, h]));
  const activeByHousehold = new Map<Id, PriorityRequest<Id>[]>();
  for (const request of requests) {
    if (request.status === 'resolved') continue;
    const bucket = activeByHousehold.get(request.householdId) ?? [];
    bucket.push(request); activeByHousehold.set(request.householdId, bucket);
  }
  const byConcern: Record<ConcernCode, number> = { unresolved_requests: 0, check_in_need: 0, unconfirmed_exposure: 0, vulnerable_exposure: 0 };
  let overlookedHouseholds = 0, followUpHouseholds = 0;
  const rows = priority.ranked.map(row => {
    const household = householdById.get(row.householdId)!;
    const active = activeByHousehold.get(row.householdId) ?? [];
    const concerns: FollowUpConcern<Id>[] = [];
    if (active.length) concerns.push({ code: 'unresolved_requests',
      explanation: `${active.length} unresolved request(s) remain: ${row.unresolvedNeeds.join(', ')}. Assignment or a safe check-in does not resolve them.`,
      requestIds: active.map(r => r.id).sort(compareIds), layerIds: [] });
    if (household.checkInStatus === 'urgent' || household.checkInStatus === 'needs_help') concerns.push({ code: 'check_in_need',
      explanation: `Household check-in is ${household.checkInStatus}; the reported concern needs follow-up independently of request status.`, requestIds: [], layerIds: [] });
    if (household.checkInStatus === 'unknown' && row.exposureEvidence.length) {
      const qualifying = row.exposureEvidence.filter(e => config.minimumExposureSeverity === 'moderate' || e.severity === 'high');
      if (qualifying.length) concerns.push({ code: 'unconfirmed_exposure',
        explanation: `Safety remains unknown with ${qualifying.length} matching impact layer(s) at or above the ${config.minimumExposureSeverity} exposure threshold.`,
        requestIds: [], layerIds: qualifying.map(e => e.layerId) });
      else if (config.includeVulnerableExposure && household.vulnerabilityFlags.length) concerns.push({ code: 'vulnerable_exposure',
        explanation: `Safety remains unknown with exposure and recorded vulnerability flags: ${[...new Set(household.vulnerabilityFlags)].sort().join(', ')}.`,
        requestIds: [], layerIds: row.exposureEvidence.map(e => e.layerId) });
    }
    const urgent = household.checkInStatus === 'urgent' || row.highestUrgency >= config.urgentRequestThreshold;
    const thresholdMinutes = urgent ? config.urgentAfterMinutes : config.standardAfterMinutes;
    const contactState = row.contactAgeMinutes === undefined ? 'never_contacted' as const :
      row.contactAgeMinutes >= thresholdMinutes ? 'overdue' as const : 'recent' as const;
    const contactOverdue = contactState !== 'recent';
    const needsFollowUp = concerns.length > 0;
    const overlooked = needsFollowUp && contactOverdue;
    const contactExplanation = contactState === 'never_contacted' ? 'No contact is recorded; demo rules consider this immediately overdue.' :
      `${row.contactAgeMinutes} whole minute(s) since contact; ${urgent ? 'urgent' : 'standard'} threshold is ${thresholdMinutes} minute(s), inclusive.`;
    if (needsFollowUp) followUpHouseholds++;
    if (overlooked) {
      overlookedHouseholds++;
      for (const concern of concerns) byConcern[concern.code]++;
    }
    return { ...row, needsFollowUp, contactState, contactOverdue, thresholdMinutes, contactExplanation, overlooked, concerns };
  });
  return { assumptions: { ...config }, priorityAssumptions: priority.assumptions,
    evaluatedHouseholds: rows.length, followUpHouseholds, overlookedHouseholds, byConcern, households: rows };
}
