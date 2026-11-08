/** Offline schema-v3 adapter; separate from the legacy database seed converter. */
import { calculateExposure, type ImpactLayer, type LocatedHousehold } from './exposure';
import { suggestPreparedness, DEFAULT_PREPAREDNESS_POLICY, type PreparednessDisaster, type PreparednessLayer,
  type PreparednessTemplate, type PreparednessTaskHistory, type PreparednessPolicy } from './preparedness';

export interface PreparednessScenario {
  schema_version: number; scenario_id: string;
  households: (LocatedHousehold & { vulnerability_flags: string[] })[];
  disasters: PreparednessDisaster[];
  impact_layers: (ImpactLayer & PreparednessLayer)[];
  preparedness_recommendations: PreparednessTemplate[];
}
export function suggestScenarioPreparedness(data: PreparednessScenario, options: {
  scenarioRunId?: string; history?: readonly PreparednessTaskHistory[]; policy?: PreparednessPolicy;
} = {}) {
  if (data.schema_version !== 3 || !Array.isArray(data.impact_layers) || !Array.isArray(data.preparedness_recommendations)) {
    throw new Error('Preparedness fixture requires schema v3 layers and recommendation catalog');
  }
  const exposure = calculateExposure(data.households, data.impact_layers);
  return suggestPreparedness(options.scenarioRunId ?? data.scenario_id,
    data.households.map(h => ({ id: h.id, vulnerabilityFlags: h.vulnerability_flags })),
    data.disasters, data.impact_layers, exposure.households, data.preparedness_recommendations,
    options.history ?? [], options.policy ?? DEFAULT_PREPAREDNESS_POLICY);
}
