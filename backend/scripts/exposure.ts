/** Offline fixture report. Runtime module helpers do not import this Node CLI. */
import { readFileSync, writeFileSync } from 'node:fs';
import { calculateExposure, type ImpactLayer, type LocatedHousehold } from '../src/exposure';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: npm run exposure -- INPUT.json OUTPUT.json');
const data = JSON.parse(readFileSync(input, 'utf8').replace(/^\uFEFF/, ''));
if (data.schema_version !== 3 || !Array.isArray(data.households) || !Array.isArray(data.impact_layers)) {
  throw new Error('Expected schema v3 with explicit households and impact_layers; context rectangles are not impact layers.');
}
const report = calculateExposure(data.households as LocatedHousehold[], data.impact_layers as ImpactLayer[]);
writeFileSync(output, JSON.stringify({ scenarioId: data.scenario_id, referenceTime: data.reference_time, ...report }, null, 2) + '\n');
console.log(`${report.affectedHouseholds}/${report.totalHouseholds} unique households exposed; ${report.candidateChecks} candidate checks. Wrote ${output}`);
