import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { rankHouseholds, DEFAULT_PRIORITY_CONFIG, type PriorityHousehold, type PriorityRequest, type HouseholdExposure } from './priority';
import { rankScenario, utcMicros, type PriorityScenario } from './priority-scenario';
import type { ExposureEvidence } from './exposure';

const now = utcMicros('2026-11-07T12:00:00Z');
const minute = 60_000_000n;
const h = (id = 'one'): PriorityHousehold => ({ id, checkInStatus: 'safe', vulnerabilityFlags: [], lastContactAtMicros: now });
const request = (changes: Partial<PriorityRequest> = {}): PriorityRequest => ({ id: 'request', householdId: 'one', needType: 'water', urgency: 5, status: 'open', ...changes });
const evidence = (changes: Partial<ExposureEvidence> = {}): ExposureEvidence => ({ layerId: 'layer', disasterId: 'event', hazardType: 'flood', component: 'inundation', severity: 'moderate', dataKind: 'simulation', isSimulated: true, source: 'Synthetic test', updatedAt: '2026-11-07T12:00:00Z', label: 'SIMULATION', ...changes });
function score(household = h(), requests: PriorityRequest[] = [], matched: ExposureEvidence[] = []) {
  return rankHouseholds([household], requests, [{ householdId: household.id, exposures: matched }], now).ranked[0];
}

describe('demo priority rules', () => {
  it('explains every point and exposes its assumption configuration', () => {
    const row = score({ ...h(), checkInStatus: 'urgent', vulnerabilityFlags: ['limited_mobility', 'transport_needed'], lastContactAtMicros: undefined }, [request()], [evidence({ severity: 'high' })]);
    expect(row.score).toBe(165); // 50 urgency + 5 need + 20 check-in + 30 exposure + 30 vulnerability + 30 contact.
    expect(row.reasons.reduce((sum, r) => sum + r.points, 0)).toBe(row.score);
    expect(row.reasons.every(r => r.explanation.length > 0)).toBe(true);
    expect(rankHouseholds([], [], [], now).assumptions.label).toContain('demo assumptions');
  });

  it('retains unresolved needs for safe households and ignores customer status', () => {
    const customer = { ...h(), isCustomer: true };
    const community = { ...h(), isCustomer: false };
    expect(score(customer, [request()])).toEqual(score(community, [request()]));
    expect(score(customer, [request()]).score).toBe(55);
    expect(score(customer).score).toBe(0);
  });

  it('increases score for explicit urgency and exposure escalation without overlap inflation', () => {
    expect(score(h(), [request()]).score).toBeGreaterThan(score(h(), [request({ urgency: 2 })]).score);
    const moderate = score(h(), [], [evidence()]);
    const high = score(h(), [], [evidence({ severity: 'high' })]);
    expect(high.score - moderate.score).toBe(15);
    expect(score(h(), [], [evidence(), evidence({ layerId: 'second', severity: 'high' })]).score).toBe(high.score);
    expect(score(h(), [], [evidence(), evidence({ layerId: 'second', severity: 'high' })]).exposureEvidence).toHaveLength(2);
  });

  it('counts distinct unresolved needs, uses maximum urgency, and caps need breadth', () => {
    const duplicates = [request(), request({ id: 'copy' })];
    expect(score(h(), duplicates).score).toBe(55);
    const requests = ['water', 'food', 'shelter', 'welfare_check', 'evacuation'].map((needType, i) => request({ id: String(i), needType }));
    expect(score(h(), requests).score).toBe(65);
    expect(score(h(), requests).unresolvedNeeds).toHaveLength(5);
  });

  it('removes resolved request contributions and retains assigned/in-progress needs', () => {
    expect(score(h(), [request({ status: 'resolved' })]).score).toBe(0);
    for (const status of ['open', 'assigned', 'in_progress'] as const) expect(score(h(), [request({ status })]).score).toBe(55);
    const resolved = score({ ...h(), checkInStatus: 'urgent' }, [request({ status: 'resolved' })], [evidence()]);
    expect(resolved.unresolvedRequestCount).toBe(0);
    expect(resolved.score).toBe(35); // Check-in and exposure remain independent.
  });

  it('deduplicates vulnerability flags, caps points and identifies unweighted flags', () => {
    expect(score({ ...h(), vulnerabilityFlags: ['limited_mobility', 'limited_mobility'] }).score).toBe(15);
    expect(score({ ...h(), vulnerabilityFlags: ['unreviewed_flag'] }).reasons.find(r => r.factor === 'vulnerability')?.explanation).toContain('Unweighted flags');
  });

  it('handles contact thresholds exactly and uses an explicit clock', () => {
    for (const [minutes, points] of [[59, 0], [60, 5], [359, 5], [360, 15], [1439, 15], [1440, 25]] as const) {
      expect(score({ ...h(), lastContactAtMicros: now - BigInt(minutes) * minute }).score).toBe(points);
    }
    expect(score({ ...h(), lastContactAtMicros: undefined }).score).toBe(30);
    expect(utcMicros('2026-11-07T12:00:00.123456Z') - now).toBe(123456n);
    expect(() => utcMicros('2026-02-30T12:00:00Z')).toThrow();
  });

  it('supports custom weights, preserves defaults, and rejects nonmonotonic configuration', () => {
    const config = { ...DEFAULT_PRIORITY_CONFIG, label: 'Test configuration', exposurePoints: { moderate: 2, high: 8 } };
    expect(rankHouseholds([h()], [], [{ householdId: 'one', exposures: [evidence({ severity: 'high' })] }], now, config).ranked[0].score).toBe(8);
    expect(DEFAULT_PRIORITY_CONFIG.exposurePoints.high).toBe(30);
    expect(() => rankHouseholds([], [], [], now, { ...config, exposurePoints: { moderate: 9, high: 1 } })).toThrow();
    expect(() => rankHouseholds([], [], [], now, { ...config, pointsPerDistinctNeed: -1 })).toThrow();
  });

  it('sorts ties consistently by urgency, contact age, and ID including bigint IDs', () => {
    const households = [h('b'), h('a')];
    const exposures: HouseholdExposure[] = households.map(r => ({ householdId: r.id, exposures: [] }));
    const normal = rankHouseholds(households, [], exposures, now);
    expect(normal.ranked.map(r => r.householdId)).toEqual(['a', 'b']);
    expect(rankHouseholds([...households].reverse(), [], [...exposures].reverse(), now)).toEqual(normal);
    expect(rankHouseholds([{ ...h(), id: 2n }, { ...h(), id: 1n }], [], [{ householdId: 1n, exposures: [] }, { householdId: 2n, exposures: [] }], now).ranked.map(r => r.householdId)).toEqual([1n, 2n]);
  });

  it('uses urgency and oldest/missing contact as secondary tie-breakers', () => {
    const config = { ...DEFAULT_PRIORITY_CONFIG, urgencyPoints: [0, 0, 0, 0, 0] as const,
      pointsPerDistinctNeed: 0, contactTiers: [], neverContactedPoints: 0 };
    const households = [h('a'), h('b')];
    const exposures = households.map(row => ({ householdId: row.id, exposures: [] }));
    const requests = [request({ id: 'a-r', householdId: 'a', urgency: 1 }), request({ id: 'b-r', householdId: 'b', urgency: 5 })];
    expect(rankHouseholds(households, requests, exposures, now, config).ranked.map(r => r.householdId)).toEqual(['b', 'a']);
    households[1].lastContactAtMicros = now - 100n * minute;
    expect(rankHouseholds(households, [], exposures, now, config).ranked.map(r => r.householdId)).toEqual(['b', 'a']);
    households[0].lastContactAtMicros = undefined;
    expect(rankHouseholds(households, [], exposures, now, config).ranked.map(r => r.householdId)).toEqual(['a', 'b']);
  });

  it('rejects missing exposure coverage, broken references, duplicates and future contact', () => {
    expect(() => rankHouseholds([h()], [], [], now)).toThrow(/coverage/);
    expect(() => score({ ...h(), lastContactAtMicros: now + 1n })).toThrow(/contact/);
    expect(() => score(h(), [request(), request()])).toThrow(/duplicate/);
    expect(() => score(h(), [request({ householdId: 'missing' })])).toThrow(/unknown/);
    expect(() => score(h(), [request({ urgency: 6 })])).toThrow(/urgency/);
    expect(() => score(h(), [], [evidence(), evidence()])).toThrow(/evidence/);
    expect(() => rankHouseholds([h(), h()], [], [], now)).toThrow(/duplicate/);
  });

  it.each(['small', 'demo', 'stress'])('scores the full %s dataset with reproducible explanations', preset => {
    const data = JSON.parse(execFileSync(process.env.PYTHON ?? 'python', ['../data/scenarios/generate.py', '--preset', preset], { maxBuffer: 96 * 1024 * 1024 }).toString()) as PriorityScenario;
    const report = rankScenario(data);
    expect(report.ranked).toHaveLength({ small: 60, demo: 10000, stress: 100000 }[preset]!);
    const ids = new Set(report.ranked.map(r => r.householdId));
    expect(ids.size).toBe(report.ranked.length);
    for (const row of report.ranked) {
      expect(row.score).toBe(row.reasons.reduce((sum, r) => sum + r.points, 0));
      expect(Number.isSafeInteger(row.score)).toBe(true);
    }
    if (preset === 'small') expect(rankScenario(data)).toEqual(report);
  }, 60000);
});
