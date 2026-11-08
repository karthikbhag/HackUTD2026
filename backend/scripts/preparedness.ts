/** Offline review report; creates no operational tasks or outreach. */
import { readFileSync, writeFileSync } from 'node:fs';
import { suggestScenarioPreparedness, type PreparednessScenario } from '../src/preparedness-scenario';
import type { PreparednessTaskHistory } from '../src/preparedness';

const args = process.argv.slice(2);
const [input, output, ...flags] = args;
const summary = flags.includes('--summary-only');
const historyIndex = flags.indexOf('--history');
const runIndex = flags.indexOf('--run');
const allowed = new Set(['--summary-only', '--history', '--run']);
for (let i = 0; i < flags.length; i++) {
  if (!allowed.has(flags[i])) throw new Error(`Unknown preparedness option: ${flags[i]}`);
  if (flags[i] !== '--summary-only') {
    if (!flags[i + 1] || flags[i + 1].startsWith('--')) throw new Error(`Missing value for ${flags[i]}`);
    i++;
  }
}
if (!input || !output) throw new Error('Usage: npm run preparedness -- INPUT.json OUTPUT.json [--summary-only] [--history TASKS.json] [--run RUN_ID]');
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const data = read(input) as PreparednessScenario;
const history = historyIndex < 0 ? [] : read(flags[historyIndex + 1]) as PreparednessTaskHistory[];
const report = suggestScenarioPreparedness(data, { history, scenarioRunId: runIndex < 0 ? undefined : flags[runIndex + 1] });
writeFileSync(output, JSON.stringify({ ...report, scope: summary ? 'first25_with_suggestions' : 'all',
  households: summary ? report.households.filter(h => h.suggestions.length).slice(0, 25) : report.households }, null, 2) + '\n');
console.log(`${report.suggestionCount} suggestions for ${report.householdsWithSuggestions}/${report.evaluatedHouseholds} households; ${report.suppressedCount} suppressed. Wrote ${output}`);
