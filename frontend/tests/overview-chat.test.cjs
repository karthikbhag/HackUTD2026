// Offline checks for the dataset-wide AI assistant (no network, no Gemini key).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const overview = require('../src/lib/ai/overview-chat.ts');
const { demoMapData } = require('../src/lib/map/demo-data.ts');

const snapshot = overview.buildOverviewSnapshot(demoMapData, 'after', '2026-11-08T12:00:00.000Z');
const body = over => JSON.parse(JSON.stringify({ snapshot, history: [], question: 'Which areas have the most urgent check-ins?', ...over }));

test('overview summarizes every shown area with counts only', () => {
  assert.equal(snapshot.totals.areas, demoMapData.zones.length);
  assert.equal(snapshot.areas.length + snapshot.areasOmitted, demoMapData.zones.length);
  const members = demoMapData.households.filter(row => demoMapData.zones.some(zone => zone.id === (row.hotspotId ?? row.zoneId)));
  assert.equal(snapshot.totals.households, members.length);
  assert.equal(snapshot.areas.reduce((sum, area) => sum + area.households, 0), members.length, 'per-area counts add up to the total');
  assert.equal(snapshot.simulated, true);
  const text = JSON.stringify(snapshot);
  for (const row of demoMapData.households) { assert.ok(!text.includes(row.name), 'no household names'); assert.ok(!text.includes(`"${row.id}"`), 'no household IDs'); }
  assert.ok(!text.includes(String(demoMapData.zones[0].boundary[0][0])), 'no coordinates');
  const rank = { critical: 3, high: 2, moderate: 1 };
  for (let i = 1; i < snapshot.areas.length; i++) assert.ok(rank[snapshot.areas[i - 1].severity] >= rank[snapshot.areas[i].severity], 'most severe first');
});

test('large datasets are capped at 12 areas, with the rest counted in totals', () => {
  const zones = Array.from({ length: 20 }, (_, i) => ({ ...demoMapData.zones[0], id: `z${i}`, name: `Zone ${i}` }));
  const big = overview.buildOverviewSnapshot({ zones, households: [], teams: [] }, 'before', '2026-11-08T12:00:00.000Z');
  assert.equal(big.areas.length, overview.OVERVIEW_LIMITS.areas);
  assert.equal(big.areasOmitted, 8);
  assert.equal(big.totals.areas, 20);
  assert.ok(JSON.stringify(big).length < 12000, 'stays small');
});

test('request validation accepts built overviews and rejects tampering', () => {
  assert.ok('request' in overview.parseOverviewChatRequest(body()));
  assert.ok('error' in overview.parseOverviewChatRequest(null));
  assert.ok('error' in overview.parseOverviewChatRequest(body({ question: ' ' })));
  assert.ok('error' in overview.parseOverviewChatRequest(body({ question: 'x'.repeat(301) })));
  assert.ok('error' in overview.parseOverviewChatRequest(body({ snapshot: { ...snapshot, phase: 'during' } })));
  assert.ok('error' in overview.parseOverviewChatRequest(body({ snapshot: { ...snapshot, areas: [...snapshot.areas, snapshot.areas[0]] } })), 'duplicate areas');
  assert.ok('error' in overview.parseOverviewChatRequest(body({ snapshot: { ...snapshot, areas: [{ ...snapshot.areas[0], households: -1 }] } })));
  assert.ok('error' in overview.parseOverviewChatRequest(body({ history: Array(4).fill({ question: 'Q?', answer: 'A.' }) })));
});

test('answers keep only known area IDs and cannot add numbers', () => {
  const [first] = snapshot.areas;
  const ok = overview.parseOverviewChatAnswer({ answer: `${first.name} has ${first.households} households.`, relatedAreaIds: [first.id, 'not-an-area', first.id, 7] }, snapshot);
  assert.deepEqual(ok.answer.relatedAreaIds, [first.id]);
  assert.match(overview.parseOverviewChatAnswer({ answer: 'About 4321 households were evacuated.', relatedAreaIds: [] }, snapshot).error, /4321/);
  assert.equal(overview.parseOverviewChatAnswer({ answer: '1. Check outreach.', relatedAreaIds: [] }, snapshot).answer.answer, '- Check outreach.');
  assert.ok('error' in overview.parseOverviewChatAnswer({ answer: '', relatedAreaIds: [] }, snapshot));
  assert.ok('error' in overview.parseOverviewChatAnswer('text', snapshot));
  const many = overview.parseOverviewChatAnswer({ answer: 'See these.', relatedAreaIds: snapshot.areas.map(area => area.id) }, snapshot);
  assert.ok(many.answer.relatedAreaIds.length <= overview.OVERVIEW_LIMITS.relatedAreas);
});
