/** Offline report only; not imported by the published module. */
import { readFileSync, writeFileSync } from 'node:fs';
import { rankScenario, type PriorityScenario } from '../src/priority-scenario';
const [input, output, mode] = process.argv.slice(2);
if (!input || !output || (mode !== undefined && mode !== '--summary-only')) throw new Error('Usage: npm run priority -- INPUT.json OUTPUT.json [--summary-only]');
const data = JSON.parse(readFileSync(input, 'utf8').replace(/^\uFEFF/, '')) as PriorityScenario;
const report = rankScenario(data);
writeFileSync(output, JSON.stringify({ referenceTime: data.reference_time, totalHouseholdsRanked: report.ranked.length,
  scope: mode === '--summary-only' ? 'top25' : 'all', assumptions: report.assumptions,
  ranked: mode === '--summary-only' ? report.ranked.slice(0, 25) : report.ranked }, null, 2) + '\n');
console.log(`Ranked ${report.ranked.length} households. Top score: ${report.ranked[0]?.score ?? 0}. Wrote ${output}`);
