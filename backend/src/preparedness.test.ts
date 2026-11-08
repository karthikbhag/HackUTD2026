import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { suggestPreparedness, DEFAULT_PREPAREDNESS_POLICY, type PreparednessHousehold, type PreparednessDisaster,
  type PreparednessLayer, type PreparednessTemplate, type PreparednessTaskHistory } from './preparedness';
import { suggestScenarioPreparedness, type PreparednessScenario } from './preparedness-scenario';
import type { ExposureEvidence } from './exposure';

function fixture() {
  const household: PreparednessHousehold = { id: 'h', vulnerabilityFlags: [] };
  const disaster: PreparednessDisaster = { id: 'd', type: 'tornado', phase: 'preparedness' };
  const layer: PreparednessLayer = { id: 'l', disaster_id: 'd', hazard_type: 'tornado', component: 'damage_corridor', recommendation_ids: ['tornado-shelter_plan', 'tornado-accessible_shelter'] };
  const templates: PreparednessTemplate[] = layer.recommendation_ids.map(id => ({ id, hazard_type: 'tornado', title: id,
    description: 'Existing sourced text', phase: 'preparedness', requires_human_review: true,
    guidance_url: 'https://www.weather.gov/safety/tornado-prepare', guidance_checked_on: '2026-11-07', source_label: 'Test source' }));
  const evidence: ExposureEvidence = { layerId: 'l', disasterId: 'd', hazardType: 'tornado', component: 'damage_corridor', severity: 'high', dataKind: 'simulation', isSimulated: true, source: 'Synthetic test', updatedAt: '2026-11-07T12:00:00Z', label: 'SIMULATION' };
  return { household, disaster, layer, templates, evidence };
}
function run(f = fixture(), history: PreparednessTaskHistory[] = []) {
  return suggestPreparedness('run-1', [f.household], [f.disaster], [f.layer], [{ householdId: f.household.id, exposures: [f.evidence] }], f.templates, history);
}
const task = (status: PreparednessTaskHistory['status'], changes: Partial<PreparednessTaskHistory> = {}): PreparednessTaskHistory => ({ id: 'task', householdId: 'h', recommendationId: 'tornado-shelter_plan', scenarioRunId: 'run-1', status, ...changes });

describe('household preparedness suggestions', () => {
  it('selects exposure-based templates, preserves source text, and requires review', () => {
    const f = fixture(), report = run(f);
    expect(report.suggestionCount).toBe(1);
    expect(report.households[0].suggestions[0]).toMatchObject({ recommendationId: 'tornado-shelter_plan', description: 'Existing sourced text', requiresHumanReview: true, guidanceUrl: f.templates[0].guidance_url, layerIds: ['l'], disasterIds: ['d'] });
    expect(report.households[0].suggestions[0].reasons[0]).toContain('coordinates match');
    expect(suggestPreparedness('run-1', [f.household], [f.disaster], [f.layer], [{ householdId: 'h', exposures: [] }], f.templates).suggestionCount).toBe(0);
  });

  it('targets support templates to mobility/transport flags and ignores duplicates', () => {
    const f = fixture(); f.household.vulnerabilityFlags = ['transport_needed', 'transport_needed'];
    const report = run(f);
    expect(report.suggestionCount).toBe(2);
    expect(report.households[0].suggestions[0].relevantVulnerabilityFlags).toEqual(['transport_needed']);
    expect(report.households[0].suggestions.every(s => s.reasons.some(r => r.includes('support needs')))).toBe(true);
    f.household.vulnerabilityFlags = ['unknown_flag'];
    expect(run(f).suggestionCount).toBe(1);
  });

  it('deduplicates shared recommendations across overlapping layers and disasters', () => {
    const f = fixture();
    const other = { ...f.layer, id: 'other-layer', disaster_id: 'other-disaster' };
    const result = suggestPreparedness('run-1', [f.household], [f.disaster, { ...f.disaster, id: 'other-disaster' }], [f.layer, other],
      [{ householdId: 'h', exposures: [f.evidence, { ...f.evidence, layerId: 'other-layer', disasterId: 'other-disaster' }] }], f.templates);
    expect(result.suggestionCount).toBe(1);
    expect(result.households[0].suggestions[0].layerIds).toEqual(['l', 'other-layer']);
    expect(result.households[0].suggestions[0].disasterIds).toEqual(['d', 'other-disaster']);
  });

  it('does not suggest preparedness actions for response-phase disasters', () => {
    const f = fixture(); f.disaster.phase = 'response';
    expect(run(f).suggestionCount).toBe(0);
  });

  it('selects smoke guidance only for smoke and isolation checks for isolation or support needs', () => {
    const f = fixture();
    f.disaster.type = 'wildfire'; f.layer.hazard_type = 'wildfire'; f.evidence.hazardType = 'wildfire';
    f.layer.component = 'fire_perimeter'; f.evidence.component = 'fire_perimeter';
    f.layer.recommendation_ids = ['wildfire-smoke_plan', 'wildfire-local_alerts'];
    f.templates = f.layer.recommendation_ids.map(id => ({ ...f.templates[0], id, hazard_type: 'wildfire' }));
    expect(run(f).households[0].suggestions.map(s => s.recommendationId)).toEqual(['wildfire-local_alerts']);
    f.layer.component = 'smoke'; f.evidence.component = 'smoke';
    expect(run(f).suggestionCount).toBe(2);
    f.disaster.type = 'blizzard'; f.layer.hazard_type = 'blizzard'; f.evidence.hazardType = 'blizzard';
    f.layer.component = 'snow_wind'; f.evidence.component = 'snow_wind';
    f.layer.recommendation_ids = ['blizzard-winter_supplies', 'blizzard-isolation_check'];
    f.templates = f.layer.recommendation_ids.map(id => ({ ...f.templates[0], id, hazard_type: 'blizzard' }));
    expect(run(f).suggestionCount).toBe(1);
    f.household.vulnerabilityFlags = ['limited_mobility'];
    expect(run(f).suggestionCount).toBe(2);
    f.household.vulnerabilityFlags = []; f.layer.component = 'isolation'; f.evidence.component = 'isolation';
    expect(run(f).suggestionCount).toBe(2);
  });

  it('filters phase per disaster when a household overlaps preparedness and response events', () => {
    const f = fixture();
    const response = { ...f.disaster, id: 'response', phase: 'response' as const };
    const layer = { ...f.layer, id: 'response-layer', disaster_id: 'response' };
    const result = suggestPreparedness('run-1', [f.household], [f.disaster, response], [f.layer, layer],
      [{ householdId: 'h', exposures: [f.evidence, { ...f.evidence, layerId: layer.id, disasterId: response.id }] }], f.templates);
    expect(result.households[0].suggestions[0].layerIds).toEqual(['l']);
  });

  it('retains distinct guidance for a household exposed to different hazards', () => {
    const f = fixture();
    const flood: PreparednessDisaster = { id: 'flood-event', type: 'flood', phase: 'preparedness' };
    const floodLayer: PreparednessLayer = { id: 'flood-layer', disaster_id: flood.id, hazard_type: 'flood', component: 'inundation', recommendation_ids: ['flood-flood_plan'] };
    const floodTemplate: PreparednessTemplate = { ...f.templates[0], id: 'flood-flood_plan', hazard_type: 'flood' };
    const report = suggestPreparedness('run-1', [f.household], [f.disaster, flood], [f.layer, floodLayer],
      [{ householdId: 'h', exposures: [f.evidence, { ...f.evidence, layerId: floodLayer.id, disasterId: flood.id, hazardType: 'flood', component: 'inundation' }] }], [...f.templates, floodTemplate]);
    expect(report.households[0].suggestions.map(s => s.recommendationId)).toEqual(['flood-flood_plan', 'tornado-shelter_plan']);
  });

  it.each(['pending', 'in_progress', 'completed'] as const)('suppresses a matching %s task in the current run', status => {
    const report = run(fixture(), [task(status)]);
    expect(report.suggestionCount).toBe(0);
    expect(report.suppressedCount).toBe(1);
    expect(report.households[0].suppressed[0]).toMatchObject({ existingTaskIds: ['task'], statuses: [status] });
  });

  it('does not let old runs or another recommendation suppress current suggestions', () => {
    expect(run(fixture(), [task('completed', { scenarioRunId: 'old-run' })]).suggestionCount).toBe(1);
    expect(run(fixture(), [task('pending', { recommendationId: 'tornado-accessible_shelter' })]).suggestionCount).toBe(1);
  });

  it('isolates suppression to the matching household', () => {
    const f = fixture();
    const report = suggestPreparedness('run-1', [f.household, { ...f.household, id: 'other' }], [f.disaster], [f.layer],
      [{ householdId: 'h', exposures: [f.evidence] }, { householdId: 'other', exposures: [f.evidence] }], f.templates,
      [task('completed', { householdId: 'other' })]);
    expect(report.households.find(h => h.householdId === 'h')!.suggestions).toHaveLength(1);
    expect(report.households.find(h => h.householdId === 'other')!.suggestions).toHaveLength(0);
  });

  it('is customer-neutral, supports bigint IDs and preserves stable ordering', () => {
    const f = fixture();
    expect(run({ ...f, household: { ...f.household, ...{ isCustomer: true } } })).toEqual(run({ ...f, household: { ...f.household, ...{ isCustomer: false } } }));
    const normal = run(f);
    expect(suggestPreparedness('run-1', [f.household], [f.disaster], [f.layer], [{ householdId: 'h', exposures: [f.evidence] }], [...f.templates].reverse())).toEqual(normal);
    expect(suggestPreparedness('run-1', [{ ...f.household, id: 1n }], [{ ...f.disaster, id: 2n }], [{ ...f.layer, id: 3n, disaster_id: 2n }],
      [{ householdId: 1n, exposures: [{ ...f.evidence, layerId: 3n, disasterId: 2n }] }], f.templates).suggestionCount).toBe(1);
    expect(suggestPreparedness('run-1', [], [], [], [], []).suggestionCount).toBe(0);
  });

  it('rejects missing evidence, broken joins, missing policies and unsafe template metadata', () => {
    const f = fixture();
    expect(() => suggestPreparedness('run-1', [f.household], [f.disaster], [f.layer], [], f.templates)).toThrow(/coverage/);
    expect(() => run({ ...f, evidence: { ...f.evidence, disasterId: 'missing' } })).toThrow(/mismatch/);
    expect(() => run({ ...f, templates: f.templates.map(t => ({ ...t, requires_human_review: false })) })).toThrow(/review/);
    expect(() => suggestPreparedness('run-1', [f.household], [f.disaster], [f.layer], [{ householdId: 'h', exposures: [f.evidence] }], f.templates, [], { ...DEFAULT_PREPAREDNESS_POLICY, rules: {} })).toThrow(/rule/);
    expect(() => run(f, [task('pending'), task('pending')])).toThrow(/history/);
    expect(() => run(f, [task('pending', { householdId: 'missing' })])).toThrow(/reference/);
  });

  it.each(['small', 'demo', 'stress'])('handles all six hazards in the %s preset and respects suppression history', preset => {
    const data = JSON.parse(execFileSync(process.env.PYTHON ?? 'python', ['../data/scenarios/generate.py', '--preset', preset], { maxBuffer: 96 * 1024 * 1024 }).toString()) as PreparednessScenario;
    const result = suggestScenarioPreparedness(data, { scenarioRunId: 'test-run' });
    expect(result.evaluatedHouseholds).toBe({ small: 60, demo: 10000, stress: 100000 }[preset]);
    expect(result.suggestionCount).toBeGreaterThan(0);
    const hazards = new Set<string>();
    let count = 0;
    for (const row of result.households) {
      expect(new Set(row.suggestions.map(s => s.recommendationId)).size).toBe(row.suggestions.length);
      for (const s of row.suggestions) { hazards.add(s.hazardType); count++; expect(s.requiresHumanReview).toBe(true); }
    }
    expect(hazards.size).toBe(6);
    expect(count).toBe(result.suggestionCount);
    const first = result.households.find(h => h.suggestions.length)!;
    const history: PreparednessTaskHistory[] = first.suggestions.map((s, i) => ({ id: `history-${i}`, householdId: first.householdId,
      recommendationId: s.recommendationId, scenarioRunId: 'test-run', status: 'completed' }));
    const repeated = suggestScenarioPreparedness(data, { scenarioRunId: 'test-run', history });
    expect(repeated.households.find(h => h.householdId === first.householdId)!.suggestions).toEqual([]);
    expect(repeated.suppressedCount).toBe(history.length);
    expect(suggestScenarioPreparedness(data, { scenarioRunId: 'new-run', history }).suggestionCount).toBe(result.suggestionCount);
  }, 60000);
});
