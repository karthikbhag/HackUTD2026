/** Shared synthetic schedule: one impact per hazard and broad US region.
 * Times are rehearsal minutes, not live forecasts. Local fixture names carry
 * state abbreviations; deployed fixture names carry state codes or narrative regions.
 */
const regions = {
  South: 'DE FL GA MD NC SC VA DC WV AL KY MS TN AR LA OK TX',
  West: 'AK AZ CA CO HI ID MT NV NM OR UT WA WY',
  Midwest: 'IL IN MI OH WI IA KS MN MO NE ND SD',
  Northeast: 'CT ME MA NH RI VT NJ NY PA',
} as const;
export type ImpactRegion = keyof typeof regions | 'Unspecified region';
export function impactRegion(name: string): ImpactRegion {
  for (const [region, states] of Object.entries(regions)) {
    if (states.split(' ').some(state => new RegExp(`\\b${state}\\b`).test(name))) return region as ImpactRegion;
  }
  if (/California/i.test(name)) return 'West';
  if (/Oklahoma|Florida|Texas/i.test(name)) return 'South';
  if (/Minnesota|Midwest/i.test(name)) return 'Midwest';
  return 'Unspecified region';
}
const hazards = ['tornado', 'earthquake', 'hurricane', 'wildfire', 'blizzard', 'flood'];
export function scheduledImpactMinute(name: string, hazard: string): number {
  const hazardSlot = hazards.indexOf(hazard);
  if (hazardSlot < 0) throw new Error(`Unknown scheduled hazard: ${hazard}`);
  // Distinct group slots prevent unrelated regional hazards from all hitting at once.
  const regionSlot = [...Object.keys(regions), 'Unspecified region'].indexOf(impactRegion(name));
  return (hazardSlot * 5 + regionSlot) * 15;
}
