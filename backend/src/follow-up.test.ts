import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { detectFollowUp, DEFAULT_FOLLOW_UP_CONFIG, type FollowUpConfig } from './follow-up';
import { scenarioPriorityInputs, utcMicros, type PriorityScenario } from './priority-scenario';
import { DEFAULT_PRIORITY_CONFIG, type PriorityHousehold, type PriorityRequest, type HouseholdExposure } from './priority';
import type { ExposureEvidence } from './exposure';

const now = utcMicros('2026-11-07T12:00:00Z'), minute = 60_000_000n;
const h = (changes: Partial<PriorityHousehold> = {}): PriorityHousehold => ({ id: 'one', checkInStatus: 'safe', vulnerabilityFlags: [], lastContactAtMicros: undefined, ...changes });
const request = (changes: Partial<PriorityRequest> = {}): PriorityRequest => ({ id: 'r', householdId: 'one', needType: 'water', urgency: 3, status: 'open', ...changes });
const evidence = (changes: Partial<ExposureEvidence> = {}): ExposureEvidence => ({ layerId: 'layer', disasterId: 'event', hazardType: 'flood', component: 'inundation', severity: 'high', dataKind: 'simulation', isSimulated: true, source: 'Synthetic test', updatedAt: '2026-11-07T12:00:00Z', label: 'SIMULATION', ...changes });
function evaluate(household = h(), requests: PriorityRequest[] = [], matched: ExposureEvidence[] = [], config = DEFAULT_FOLLOW_UP_CONFIG) {
  return detectFollowUp([household], requests, [{ householdId: household.id, exposures: matched }], now, config).households[0];
}

describe('overdue-contact and overlooked-case rules', () => {
  it('distinguishes stale contact from an overlooked concern', () => {
    const row = evaluate();
    expect(row.contactState).toBe('never_contacted');
    expect(row.contactOverdue).toBe(true);
    expect(row.needsFollowUp).toBe(false);
    expect(row.overlooked).toBe(false);
    expect(row.concerns).toEqual([]);
  });

  it('uses an inclusive six-hour boundary with microsecond precision', () => {
    expect(evaluate(h({ lastContactAtMicros: now - 360n * minute + 1n }), [request()]).overlooked).toBe(false);
    const boundary = evaluate(h({ lastContactAtMicros: now - 360n * minute }), [request()]);
    expect(boundary.overlooked).toBe(true);
    expect(boundary.thresholdMinutes).toBe(360);
    expect(boundary.contactExplanation).toContain('inclusive');
  });

  it('shortens the threshold for urgent requests or urgent check-ins', () => {
    const household = h({ lastContactAtMicros: now - 60n * minute });
    expect(evaluate(household, [request({ urgency: 4 })]).overlooked).toBe(true);
    expect(evaluate({ ...household, lastContactAtMicros: household.lastContactAtMicros! + 1n }, [request({ urgency: 4 })]).overlooked).toBe(false);
    expect(evaluate(household, [request({ urgency: 3 })]).overlooked).toBe(false);
    expect(evaluate({ ...household, checkInStatus: 'urgent' }).thresholdMinutes).toBe(60);
    expect(evaluate({ ...household, checkInStatus: 'urgent' }).overlooked).toBe(true);
  });

  it('flags a never-contacted unresolved case immediately', () => {
    const row = evaluate(h(), [request()]);
    expect(row.overlooked).toBe(true);
    expect(row.concerns[0].requestIds).toEqual(['r']);
    expect(row.contactExplanation).toContain('No contact');
  });

  it('clears the overdue flag after contact but preserves unresolved assistance', () => {
    expect(evaluate(h(), [request()]).overlooked).toBe(true);
    const contacted = evaluate(h({ lastContactAtMicros: now }), [request()]);
    expect(contacted.overlooked).toBe(false);
    expect(contacted.contactOverdue).toBe(false);
    expect(contacted.needsFollowUp).toBe(true);
    expect(contacted.unresolvedRequestCount).toBe(1);
  });

  it('resolution removes only request concerns, preserving check-in or exposure concerns', () => {
    expect(evaluate(h(), [request({ status: 'resolved' })]).overlooked).toBe(false);
    const checkIn = evaluate(h({ checkInStatus: 'needs_help' }), [request({ status: 'resolved' })]);
    expect(checkIn.overlooked).toBe(true);
    expect(checkIn.concerns.map(c => c.code)).toEqual(['check_in_need']);
    const exposed = evaluate(h({ checkInStatus: 'unknown' }), [request({ status: 'resolved' })], [evidence()]);
    expect(exposed.concerns.map(c => c.code)).toEqual(['unconfirmed_exposure']);
    expect(exposed.overlooked).toBe(true);
  });

  it('safe check-in never hides an open, assigned, or in-progress request', () => {
    for (const status of ['open', 'assigned', 'in_progress'] as const) {
      const row = evaluate(h(), [request({ status })]);
      expect(row.overlooked).toBe(true);
      expect(row.concerns.map(c => c.code)).toEqual(['unresolved_requests']);
    }
  });

  it('requires unknown safety for exposure-only concerns and retains layer IDs', () => {
    expect(evaluate(h({ checkInStatus: 'unknown' }), [], [evidence()]).overlooked).toBe(true);
    expect(evaluate(h(), [], [evidence()]).overlooked).toBe(false);
    expect(evaluate(h({ checkInStatus: 'unknown' }), [], [evidence({ severity: 'moderate' })]).overlooked).toBe(false);
    const vulnerable = evaluate(h({ checkInStatus: 'unknown', vulnerabilityFlags: ['limited_mobility'] }), [], [evidence({ severity: 'moderate' })]);
    expect(vulnerable.concerns[0]).toMatchObject({ code: 'vulnerable_exposure', layerIds: ['layer'] });
    expect(vulnerable.overlooked).toBe(true);
  });

  it('supports configured exposure and urgency thresholds', () => {
    expect(evaluate(h({ checkInStatus: 'unknown' }), [], [evidence({ severity: 'moderate' })], { ...DEFAULT_FOLLOW_UP_CONFIG, minimumExposureSeverity: 'moderate' }).overlooked).toBe(true);
    expect(evaluate(h({ checkInStatus: 'unknown', vulnerabilityFlags: ['limited_mobility'] }), [], [evidence({ severity: 'moderate' })], { ...DEFAULT_FOLLOW_UP_CONFIG, includeVulnerableExposure: false }).overlooked).toBe(false);
    const contacted = h({ lastContactAtMicros: now - 90n * minute });
    expect(evaluate(contacted, [request()], [], { ...DEFAULT_FOLLOW_UP_CONFIG, urgentRequestThreshold: 3 }).overlooked).toBe(true);
  });

  it('deduplicates overall counts while retaining multiple concern reasons', () => {
    const household = h({ checkInStatus: 'needs_help' });
    const report = detectFollowUp([household], [request()], [{ householdId: 'one', exposures: [] }], now);
    expect(report.overlookedHouseholds).toBe(1);
    expect(report.byConcern.unresolved_requests).toBe(1);
    expect(report.byConcern.check_in_need).toBe(1);
    expect(report.households[0].concerns).toHaveLength(2);
  });

  it('re-evaluates with the supplied clock and does not flag by priority score', () => {
    const households = [h({ lastContactAtMicros: now })];
    const exposures: HouseholdExposure[] = [{ householdId: 'one', exposures: [] }];
    expect(detectFollowUp(households, [request()], exposures, now).overlookedHouseholds).toBe(0);
    const later = now + 360n * minute;
    const normal = detectFollowUp(households, [request()], exposures, later);
    expect(normal.overlookedHouseholds).toBe(1);
    const noScore = { ...DEFAULT_PRIORITY_CONFIG, urgencyPoints: [0, 0, 0, 0, 0] as const,
      pointsPerDistinctNeed: 0, contactTiers: [], neverContactedPoints: 0 };
    const changed = detectFollowUp(households, [request()], exposures, later, DEFAULT_FOLLOW_UP_CONFIG, noScore);
    expect(changed.households[0].score).toBe(0);
    expect(changed.overlookedHouseholds).toBe(normal.overlookedHouseholds);
  });

  it('is customer-neutral and deterministic across input order', () => {
    expect(evaluate({ ...h(), ...{ isCustomer: true } }, [request()])).toEqual(evaluate({ ...h(), ...{ isCustomer: false } }, [request()]));
    const households = [h({ id: 'b' }), h({ id: 'a' })];
    const requests = [request({ id: 'r-b', householdId: 'b' }), request({ id: 'r-a', householdId: 'a' })];
    const exposures: HouseholdExposure[] = households.map(row => ({ householdId: row.id, exposures: [] }));
    expect(detectFollowUp(households, requests, exposures, now)).toEqual(detectFollowUp([...households].reverse(), [...requests].reverse(), [...exposures].reverse(), now));
  });

  it('accepts bigint IDs and empty inputs', () => {
    const report = detectFollowUp([{ ...h(), id: 1n }], [{ ...request(), id: 2n, householdId: 1n }], [{ householdId: 1n, exposures: [] }], now);
    expect(report.households[0].concerns[0].requestIds).toEqual([2n]);
    expect(detectFollowUp([], [], [], now).overlookedHouseholds).toBe(0);
  });

  it('rejects invalid config, future contacts, missing evidence and broken requests', () => {
    const changes: Partial<FollowUpConfig>[] = [{ standardAfterMinutes: 0 }, { urgentAfterMinutes: 361 }, { standardAfterMinutes: NaN }, { urgentRequestThreshold: 6 }, { label: '' }];
    for (const change of changes) expect(() => evaluate(h(), [], [], { ...DEFAULT_FOLLOW_UP_CONFIG, ...change })).toThrow(/configuration/);
    expect(() => evaluate(h({ lastContactAtMicros: now + 1n }))).toThrow(/contact/);
    expect(() => detectFollowUp([h()], [], [], now)).toThrow(/coverage/);
    expect(() => evaluate(h(), [request({ householdId: 'missing' })])).toThrow(/unknown/);
  });

  it.each(['small', 'demo', 'stress'])('evaluates every %s household and clears a seeded case on contact', preset => {
    const data = JSON.parse(execFileSync(process.env.PYTHON ?? 'python', ['../data/scenarios/generate.py', '--preset', preset], { maxBuffer: 96 * 1024 * 1024 }).toString()) as PriorityScenario;
    const { households, requests, exposures, nowMicros } = scenarioPriorityInputs(data);
    const report = detectFollowUp(households, requests, exposures, nowMicros);
    expect(report.evaluatedHouseholds).toBe({ small: 60, demo: 10000, stress: 100000 }[preset]);
    expect(report.overlookedHouseholds).toBe(report.households.filter(h => h.overlooked).length);
    expect(report.overlookedHouseholds).toBeGreaterThan(0);
    for (const row of report.households) expect(row.overlooked).toBe(row.needsFollowUp && row.contactOverdue);
    const seeded = report.households.find(h => h.overlooked && h.unresolvedRequestCount > 0)!;
    const contacted = households.map(h => h.id === seeded.householdId ? { ...h, lastContactAtMicros: nowMicros } : h);
    const after = detectFollowUp(contacted, requests, exposures, nowMicros).households.find(h => h.householdId === seeded.householdId)!;
    expect(after.overlooked).toBe(false);
    expect(after.needsFollowUp).toBe(true);
    expect(after.unresolvedRequestCount).toBe(seeded.unresolvedRequestCount);
  }, 60000);
});
