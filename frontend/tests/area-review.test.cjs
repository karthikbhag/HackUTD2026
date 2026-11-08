// Offline checks for the AI area review contract (no network, no Gemini key).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const load = file => {
  const filename = path.resolve(__dirname, file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loaded = new Module(filename, module);
  loaded._compile(compiled, filename);
  return loaded.exports;
};
const { buildAreaSnapshot, parseAreaSnapshot, parseAreaReview, snapshotFingerprint, LIMITS } = load('../src/lib/ai/area-review.ts');
const { demoMapData } = load('../src/lib/map/demo-data.ts');

const zone = demoMapData.zones[0];
const snapshot = buildAreaSnapshot(demoMapData, zone, 'before', '2026-11-08T12:00:00.000Z');
const review = over => ({ summary: 'Simulated tornado scenario with 3 customers in the area.', expectedConditions: ['Simulated core impact area.'], reportedImpacts: [], keyRisks: ['1 household has limited mobility.'], nextSteps: ['Employee reviews outreach.'], limitations: ['Simulated data.'], ...over });

test('snapshot is scoped to the selected area and carries counts, not household identities', () => {
  assert.equal(snapshot.areaId, zone.id);
  assert.equal(snapshot.households.total, 4);
  assert.equal(snapshot.households.customers, 3);
  assert.deepEqual(snapshot.households.checkIns, { unknown: 2, safe: 1, needs_help: 1, urgent: 0 });
  assert.equal(snapshot.impactLayers.length, 2);
  assert.ok(snapshot.impactLayers.every(layer => layer.simulated && layer.dataKind === 'unspecified'));
  assert.equal(snapshot.area.simulated, true);
  const text = JSON.stringify(snapshot);
  for (const household of demoMapData.households) { assert.ok(!text.includes(household.name)); assert.ok(!text.includes(household.id)); }
  assert.ok(!text.includes(String(zone.boundary[0][0])), 'no coordinates');
  assert.ok(text.length < 4000, `snapshot stays small (${text.length} chars)`);
});

test('snapshot validation accepts built snapshots and rejects tampered or oversized ones', () => {
  assert.ok('snapshot' in parseAreaSnapshot(JSON.parse(JSON.stringify(snapshot))));
  assert.ok('error' in parseAreaSnapshot(null));
  assert.ok('error' in parseAreaSnapshot({ ...snapshot, phase: 'during' }));
  assert.ok('error' in parseAreaSnapshot({ ...snapshot, area: { ...snapshot.area, hazard: 'meteor' } }));
  assert.ok('error' in parseAreaSnapshot({ ...snapshot, households: { ...snapshot.households, total: -1 } }));
  assert.ok('error' in parseAreaSnapshot({ ...snapshot, impactLayers: Array(LIMITS.layers + 1).fill(snapshot.impactLayers[0]) }));
  assert.ok('error' in parseAreaSnapshot({ ...snapshot, guidance: ['x'.repeat(LIMITS.text + 1)] }));
});

test('review validation accepts grounded output and rejects missing fields or invented numbers', () => {
  const ok = parseAreaReview(review(), snapshot);
  assert.ok('review' in ok, JSON.stringify(ok));
  assert.ok('error' in parseAreaReview({ ...review(), summary: '' }, snapshot));
  assert.ok('error' in parseAreaReview({ ...review(), nextSteps: 'call everyone' }, snapshot));
  const invented = parseAreaReview(review({ summary: 'About 250 households are exposed.' }), snapshot);
  assert.ok('error' in invented && invented.error.includes('250'));
  assert.ok('error' in parseAreaReview(review({ keyRisks: ['Winds of 1,200 mph.'] }), snapshot));
});

test('fingerprint ignores snapshot time but changes when area evidence changes', () => {
  const later = buildAreaSnapshot(demoMapData, zone, 'before', '2026-11-08T13:00:00.000Z');
  assert.equal(snapshotFingerprint(later), snapshotFingerprint(snapshot));
  const changed = { ...demoMapData, households: demoMapData.households.map(h => h.zoneId === zone.id ? { ...h, checkIn: 'safe' } : h) };
  assert.notEqual(snapshotFingerprint(buildAreaSnapshot(changed, zone, 'before', '')), snapshotFingerprint(snapshot));
  assert.notEqual(snapshotFingerprint(buildAreaSnapshot(demoMapData, zone, 'after', '')), snapshotFingerprint(snapshot));
});
