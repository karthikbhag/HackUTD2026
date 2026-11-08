/** Pure, explicit-unit defaults shared by routing consumers. */
export const responseRoutingDefaults = {
  householdCount: 20, teamCount: 2, shiftMinutes: 120, visitMinutes: 5,
  returnToStaging: true, priorityPolicy: 'urgent-first', urgentTargetMinutes: 30,
  ordinaryReplanDebounceMs: 5000, travelRefreshSeconds: 120,
  simulationTickMs: 1000, simulationSpeed: 10, solverTimeBudgetMs: 250,
  maxProviderRetries: 2,
} as const;
export type ResponseRoutingConfig = { [K in keyof typeof responseRoutingDefaults]:
  (typeof responseRoutingDefaults)[K] extends number ? number : (typeof responseRoutingDefaults)[K] };
export function validateResponseRoutingConfig(config: ResponseRoutingConfig): ResponseRoutingConfig {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid routing configuration');
  for (const [key, defaultValue] of Object.entries(responseRoutingDefaults)) {
    const value = config[key as keyof ResponseRoutingConfig];
    if (typeof value !== typeof defaultValue) throw new Error(`Invalid ${key}`);
    if (typeof value === 'number' && (!Number.isFinite(value) || value < (key === 'maxProviderRetries' ? 0 : 1))) throw new Error(`Invalid ${key}`);
  }
  if (config.householdCount > 20 || config.teamCount > 2 || config.simulationSpeed > 100 || config.shiftMinutes > 1440 || config.visitMinutes > config.shiftMinutes || config.maxProviderRetries > 5) throw new Error('Routing configuration exceeds demo bounds');
  for (const key of ['householdCount', 'teamCount', 'maxProviderRetries'] as const) if (!Number.isInteger(config[key])) throw new Error(`Invalid ${key}`);
  if (config.priorityPolicy !== 'urgent-first' || config.returnToStaging !== true) throw new Error('Unsupported routing policy');
  return { ...config };
}
