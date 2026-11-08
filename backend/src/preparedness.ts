/** Deterministic, employee-review suggestions using existing sourced templates.
 * No SDK, clocks, I/O, task creation, outreach, or dispatch. History is scoped
 * to an explicit scenario run, not merely a reusable fixture/scenario name.
 */
import type { ExposureEvidence, Hazard, RecordId } from './exposure';
import type { HouseholdExposure } from './priority';

export interface PreparednessTemplate {
  id: string; hazard_type: Hazard; title: string; description: string;
  phase: 'preparedness'; requires_human_review: boolean;
  guidance_url: string; guidance_checked_on: string; source_label: string;
}
export interface PreparednessHousehold<Id extends RecordId = string> { id: Id; vulnerabilityFlags: readonly string[] }
export interface PreparednessDisaster<Id extends RecordId = string> { id: Id; type: Hazard; phase: 'preparedness' | 'response' }
export interface PreparednessLayer<Id extends RecordId = string> {
  id: Id; disaster_id: Id; hazard_type: Hazard; component: string; recommendation_ids: readonly string[];
}
export interface PreparednessTaskHistory<Id extends RecordId = string> {
  id: Id; householdId: Id; scenarioRunId: string; recommendationId: string;
  status: 'pending' | 'in_progress' | 'completed';
}
export type Eligibility = 'always' | 'support_needed' | 'smoke_exposure' | 'isolation_or_support';
export interface PreparednessPolicy {
  readonly label: string;
  readonly supportFlags: readonly string[];
  readonly rules: Readonly<Record<string, Eligibility>>;
}
export const DEFAULT_PREPAREDNESS_POLICY: PreparednessPolicy = {
  label: 'RiskReach preparedness demo policy v1; employee review required',
  supportFlags: ['limited_mobility', 'transport_needed'],
  rules: {
    'tornado-shelter_plan': 'always', 'tornado-accessible_shelter': 'support_needed',
    'earthquake-shake_drill': 'always', 'earthquake-secure_items': 'always',
    'hurricane-evacuation_plan': 'always', 'hurricane-transport_plan': 'support_needed',
    'wildfire-smoke_plan': 'smoke_exposure', 'wildfire-local_alerts': 'always',
    'blizzard-winter_supplies': 'always', 'blizzard-isolation_check': 'isolation_or_support',
    'flood-flood_plan': 'always', 'flood-flood_access': 'support_needed',
  },
};
const HAZARDS: readonly Hazard[] = ['tornado', 'earthquake', 'hurricane', 'wildfire', 'blizzard', 'flood'];
function requireValid(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Invalid preparedness input: ${message}`);
}
function validId(value: RecordId) {
  return typeof value === 'bigint' || (typeof value === 'string' && value.trim().length > 0);
}
function compareIds(a: RecordId, b: RecordId) {
  if (typeof a === typeof b) return a < b ? -1 : a > b ? 1 : 0;
  return typeof a === 'bigint' ? -1 : 1;
}

export function suggestPreparedness<Id extends RecordId>(
  scenarioRunId: string, households: readonly PreparednessHousehold<Id>[],
  disasters: readonly PreparednessDisaster<Id>[], layers: readonly PreparednessLayer<Id>[],
  exposures: readonly HouseholdExposure<Id>[], templates: readonly PreparednessTemplate[],
  history: readonly PreparednessTaskHistory<Id>[] = [], policy: PreparednessPolicy = DEFAULT_PREPAREDNESS_POLICY,
) {
  requireValid(scenarioRunId.trim() && policy.label.trim(), 'run and policy labels required');
  requireValid(policy.supportFlags.every(f => typeof f === 'string' && f.trim()), 'support flags');
  const householdIds = new Set<Id>();
  for (const h of households) {
    requireValid(validId(h.id) && !householdIds.has(h.id), 'duplicate/empty household ID');
    requireValid(h.vulnerabilityFlags.every(f => typeof f === 'string' && f.trim()), 'vulnerability flags');
    householdIds.add(h.id);
  }
  const disasterById = new Map<Id, PreparednessDisaster<Id>>();
  for (const d of disasters) {
    requireValid(validId(d.id) && !disasterById.has(d.id) && HAZARDS.includes(d.type) && ['preparedness', 'response'].includes(d.phase), 'disaster ID/type/phase');
    disasterById.set(d.id, d);
  }
  const templateById = new Map<string, PreparednessTemplate>();
  for (const t of templates) {
    requireValid(t.id.trim() && !templateById.has(t.id) && HAZARDS.includes(t.hazard_type), 'template ID/hazard');
    requireValid(t.phase === 'preparedness' && t.requires_human_review === true && t.title.trim() && t.description.trim() && t.source_label.trim(), 'template content/phase/review');
    requireValid(/^https:\/\//.test(t.guidance_url) && /^\d{4}-\d{2}-\d{2}$/.test(t.guidance_checked_on), 'template guidance provenance');
    requireValid(Object.prototype.hasOwnProperty.call(policy.rules, t.id) && ['always', 'support_needed', 'smoke_exposure', 'isolation_or_support'].includes(policy.rules[t.id]), 'template requires an explicit eligibility rule');
    templateById.set(t.id, t);
  }
  const layerById = new Map<Id, PreparednessLayer<Id>>();
  for (const l of layers) {
    requireValid(validId(l.id) && !layerById.has(l.id), 'duplicate/empty layer ID');
    const disaster = disasterById.get(l.disaster_id);
    requireValid(disaster && disaster.type === l.hazard_type && l.component.trim(), 'layer disaster/hazard/component');
    requireValid(l.recommendation_ids.length > 0 && new Set(l.recommendation_ids).size === l.recommendation_ids.length, 'layer recommendation links');
    requireValid(l.recommendation_ids.every(id => templateById.get(id)?.hazard_type === l.hazard_type), 'unknown/cross-hazard recommendation');
    layerById.set(l.id, l);
  }
  const exposureByHousehold = new Map<Id, readonly ExposureEvidence<Id>[]>();
  for (const row of exposures) {
    requireValid(householdIds.has(row.householdId) && !exposureByHousehold.has(row.householdId), 'unknown/duplicate exposure household');
    const seen = new Set<Id>();
    for (const e of row.exposures) {
      const layer = layerById.get(e.layerId);
      requireValid(layer && !seen.has(e.layerId) && layer.disaster_id === e.disasterId && layer.hazard_type === e.hazardType && layer.component === e.component, 'exposure layer mismatch/duplicate');
      seen.add(e.layerId);
    }
    exposureByHousehold.set(row.householdId, row.exposures);
  }
  requireValid(exposureByHousehold.size === householdIds.size, 'missing exposure coverage');
  const historyIds = new Set<Id>();
  const currentHistory = new Map<Id, Map<string, PreparednessTaskHistory<Id>[]>>();
  for (const task of history) {
    requireValid(validId(task.id) && validId(task.householdId) && !historyIds.has(task.id) && task.scenarioRunId.trim() && task.recommendationId.trim() && ['pending', 'in_progress', 'completed'].includes(task.status), 'task history ID/run/status');
    historyIds.add(task.id);
    if (task.scenarioRunId !== scenarioRunId) continue;
    requireValid(householdIds.has(task.householdId) && templateById.has(task.recommendationId), 'current-run task reference');
    const byTemplate = currentHistory.get(task.householdId) ?? new Map<string, PreparednessTaskHistory<Id>[]>();
    const tasks = byTemplate.get(task.recommendationId) ?? [];
    tasks.push(task); byTemplate.set(task.recommendationId, tasks); currentHistory.set(task.householdId, byTemplate);
  }
  let suggestionCount = 0, suppressedCount = 0, householdsWithSuggestions = 0;
  const rows = [...households].sort((a, b) => compareIds(a.id, b.id)).map(h => {
    const supportFlags = [...new Set(h.vulnerabilityFlags.filter(f => policy.supportFlags.includes(f)))].sort();
    const candidateByTemplate = new Map<string, ExposureEvidence<Id>[]>();
    for (const e of exposureByHousehold.get(h.id)!) {
      const layer = layerById.get(e.layerId)!;
      if (disasterById.get(layer.disaster_id)!.phase !== 'preparedness') continue;
      for (const templateId of layer.recommendation_ids) {
        const rule = policy.rules[templateId];
        const eligible = rule === 'always' || (rule === 'support_needed' && supportFlags.length > 0) ||
          (rule === 'smoke_exposure' && e.component === 'smoke') ||
          (rule === 'isolation_or_support' && (e.component === 'isolation' || supportFlags.length > 0));
        if (!eligible) continue;
        const bucket = candidateByTemplate.get(templateId) ?? [];
        bucket.push(e); candidateByTemplate.set(templateId, bucket);
      }
    }
    const candidates = [...candidateByTemplate].sort(([a], [b]) => compareIds(a, b));
    const suggestions = [], suppressed = [];
    for (const [recommendationId, evidence] of candidates) {
      const tasks = currentHistory.get(h.id)?.get(recommendationId);
      if (tasks?.length) {
        suppressed.push({ recommendationId, existingTaskIds: tasks.map(t => t.id).sort(compareIds),
          statuses: [...new Set(tasks.map(t => t.status))].sort(), reason: 'Matching task already exists for this household, recommendation, and scenario run.' });
        continue;
      }
      const template = templateById.get(recommendationId)!;
      const layerIds = evidence.map(e => e.layerId).sort(compareIds);
      const disasterIds = [...new Set(evidence.map(e => e.disasterId))].sort(compareIds);
      const components = [...new Set(evidence.map(e => e.component))].sort();
      const reasons = [`Household coordinates match ${evidence.length} ${template.hazard_type} layer(s) in preparedness-phase disaster(s): ${components.join(', ')}.`];
      if (supportFlags.length) reasons.push(`Recorded support needs for employee review: ${supportFlags.join(', ')}.`);
      if (policy.rules[recommendationId] === 'support_needed') reasons.push('This support-specific template requires a matching recorded support flag.');
      if (policy.rules[recommendationId] === 'smoke_exposure') reasons.push('Smoke-specific guidance is selected only from matching smoke exposure.');
      suggestions.push({ recommendationId, hazardType: template.hazard_type, phase: 'preparedness' as const,
        title: template.title, description: template.description, requiresHumanReview: true as const,
        guidanceUrl: template.guidance_url, guidanceCheckedOn: template.guidance_checked_on, sourceLabel: template.source_label,
        layerIds, disasterIds, relevantVulnerabilityFlags: supportFlags, reasons });
    }
    suggestionCount += suggestions.length; suppressedCount += suppressed.length;
    if (suggestions.length) householdsWithSuggestions++;
    return { householdId: h.id, suggestions, suppressed };
  });
  return { scenarioRunId, assumptions: { ...policy, supportFlags: [...policy.supportFlags], rules: { ...policy.rules } },
    evaluatedHouseholds: rows.length, householdsWithSuggestions, suggestionCount, suppressedCount, households: rows };
}
