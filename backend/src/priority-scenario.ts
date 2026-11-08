/** Pure schema-v3 fixture adapter for offline scoring and reproducible tests.
 * Kept separate from the existing v1/v2 database seed adapter.
 */
import { calculateExposure, type ImpactLayer, type LocatedHousehold } from './exposure';
import { rankHouseholds, DEFAULT_PRIORITY_CONFIG, type PriorityConfig, type PriorityHousehold } from './priority';

export interface PriorityScenario {
  schema_version: number; reference_time: string;
  households: (LocatedHousehold & { check_in_status: PriorityHousehold['checkInStatus']; vulnerability_flags: string[]; last_contact_at: string | null })[];
  help_requests: { id: string; household_id: string; need_type: string; urgency: 'moderate' | 'urgent'; status: 'open' | 'assigned' | 'in_progress' | 'resolved' }[];
  impact_layers: ImpactLayer[];
}
export function utcMicros(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)) throw new Error('Invalid priority fixture UTC timestamp');
  const [whole, fraction = ''] = value.slice(0, -1).split('.');
  const millis = Date.parse(`${whole}Z`);
  if (!Number.isFinite(millis) || new Date(millis).toISOString().slice(0, 19) !== whole) throw new Error('Invalid priority fixture date');
  return BigInt(millis) * 1000n + BigInt(fraction.padEnd(6, '0'));
}
export function scenarioPriorityInputs(data: PriorityScenario) {
  if (data.schema_version !== 3 || !Array.isArray(data.impact_layers)) throw new Error('Priority fixture requires schema v3 impact layers');
  const exposure = calculateExposure(data.households, data.impact_layers);
  const households = data.households.map(h => ({ id: h.id, checkInStatus: h.check_in_status,
    vulnerabilityFlags: h.vulnerability_flags, lastContactAtMicros: h.last_contact_at === null ? undefined : utcMicros(h.last_contact_at) }));
  const requests = data.help_requests.map(r => {
    if (!['moderate', 'urgent'].includes(r.urgency)) throw new Error('Invalid priority fixture urgency');
    return { id: r.id, householdId: r.household_id, needType: r.need_type, urgency: r.urgency === 'urgent' ? 5 : 3, status: r.status };
  });
  return { households, requests, exposures: exposure.households, nowMicros: utcMicros(data.reference_time) };
}

export function rankScenario(data: PriorityScenario, config: PriorityConfig = DEFAULT_PRIORITY_CONFIG) {
  const { households, requests, exposures, nowMicros } = scenarioPriorityInputs(data);
  return rankHouseholds(households, requests, exposures, nowMicros, config);
}
