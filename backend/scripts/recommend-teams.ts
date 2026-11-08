/** Offline selected-request report; no publish, task creation, or dispatch. */
import { readFileSync, writeFileSync } from 'node:fs';
import { scenarioTeamInputs } from '../src/team-recommendations-scenario';
import { createTeamRecommender, DEFAULT_TEAM_RECOMMENDATION_CONFIG } from '../src/team-recommendations';
import type { Scenario } from '../src/scenario';

const [input, output, sourceRequestId, ...flags] = process.argv.slice(2);
if (!input || !output || !sourceRequestId) throw new Error('Usage: npm run recommend-teams -- INPUT.json OUTPUT.json SOURCE_REQUEST_ID [--include-excluded] [--speed KMH] [--limit N]');
let speed = 30, limit = 5, includeExcludedTeams = false;
const seen = new Set<string>();
for (let i = 0; i < flags.length; i++) {
  const flag = flags[i];
  if (seen.has(flag)) throw new Error(`Duplicate option ${flag}`);
  seen.add(flag);
  if (flag === '--include-excluded') includeExcludedTeams = true;
  else if ((flag === '--speed' || flag === '--limit') && flags[i + 1] && !flags[i + 1].startsWith('--')) {
    const value = Number(flags[++i]);
    if (flag === '--speed') speed = value; else limit = value;
  } else throw new Error(`Unknown option or missing value: ${flag}`);
}
const data = JSON.parse(readFileSync(input, 'utf8').replace(/^\uFEFF/, '')) as Scenario;
const normalized = scenarioTeamInputs(data);
const requestId = normalized.sourceRequestIds.get(sourceRequestId);
if (requestId === undefined) throw new Error(`Unknown source request ID: ${sourceRequestId}`);
const recommender = createTeamRecommender(normalized.households, normalized.requests, normalized.teams, normalized.assignments,
  { ...DEFAULT_TEAM_RECOMMENDATION_CONFIG, assumedSpeedKmh: speed });
const report = recommender.recommend(requestId, { limit, includeExcludedTeams });
writeFileSync(output, JSON.stringify({ scenarioId: 'scenario_id' in data ? data.scenario_id : undefined,
  sourceRequestId, conversionAssumptions: normalized.conversionAssumptions,
  idEncoding: 'Source fixture IDs preserved as strings; programmatic backend usage also supports bigint IDs.', ...report },
  (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
console.log(`${report.recommendations.length}/${report.eligibleTeamCount} eligible teams shown; ${report.excludedTeamCount} excluded; ${report.requestBlockReasons.length} request blockers. Wrote ${output}`);
