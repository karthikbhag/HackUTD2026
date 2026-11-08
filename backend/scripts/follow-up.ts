/** Offline follow-up report; never imported by the published module. */
import { readFileSync, writeFileSync } from 'node:fs';
import { scenarioPriorityInputs, type PriorityScenario } from '../src/priority-scenario';
import { detectFollowUp } from '../src/follow-up';

const [input, output, mode] = process.argv.slice(2);
if (!input || !output || (mode !== undefined && mode !== '--summary-only')) throw new Error('Usage: npm run follow-up -- INPUT.json OUTPUT.json [--summary-only]');
const data = JSON.parse(readFileSync(input, 'utf8').replace(/^\uFEFF/, '')) as PriorityScenario;
const { households, requests, exposures, nowMicros } = scenarioPriorityInputs(data);
const report = detectFollowUp(households, requests, exposures, nowMicros);
const rows = mode === '--summary-only' ? report.households.filter(h => h.overlooked).slice(0, 25) : report.households;
writeFileSync(output, JSON.stringify({ referenceTime: data.reference_time, ...report,
  scope: mode === '--summary-only' ? 'top25_overlooked' : 'all', households: rows }, null, 2) + '\n');
console.log(`${report.overlookedHouseholds}/${report.evaluatedHouseholds} households flagged overlooked; ${report.followUpHouseholds} retain follow-up concerns. Wrote ${output}`);
