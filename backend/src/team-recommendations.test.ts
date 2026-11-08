import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createTeamRecommender, straightLineKm, type DispatchHousehold, type DispatchRequest,
  type DispatchTeam, type DispatchAssignment, DEFAULT_TEAM_RECOMMENDATION_CONFIG } from './team-recommendations';
import { scenarioTeamInputs } from './team-recommendations-scenario';
import type { Scenario } from './scenario';
import { ConnectionId, Timestamp } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import db, * as api from './index';

const home: DispatchHousehold = { id: 'home', latitude: 0, longitude: 0 };
const request: DispatchRequest = { id: 'request', householdId: 'home', needType: 'water', people: 2, status: 'open' };
const team = (id = 'team', changes: Partial<DispatchTeam> = {}): DispatchTeam => ({ id, name: id, latitude: 0, longitude: 1,
  capacity: 2, status: 'available', capabilities: ['water'], ...changes });
const assignment = (changes: Partial<DispatchAssignment> = {}): DispatchAssignment => ({ id: 'assignment', requestId: 'other', teamId: 'team', status: 'assigned', ...changes });
function recommend(teams = [team()], assignments: DispatchAssignment[] = [], target = request) {
  return createTeamRecommender([home], [target, { ...request, id: 'other' }], teams, assignments).recommend(target.id, { includeExcludedTeams: true });
}

describe('team recommendation eligibility and approximation', () => {
  it('matches exact capabilities and people capacity with readable approval-required results', () => {
    const report = recommend();
    expect(report.eligibleTeamCount).toBe(1);
    expect(report.recommendations[0]).toMatchObject({ teamId: 'team', requiresHumanApproval: true });
    expect(report.recommendations[0].reasons.join(' ')).toContain('2 requested people');
    expect(recommend([team('short', { capacity: 1 }), team('wrong', { capabilities: ['shelter'] })]).exclusionCounts).toMatchObject({ insufficient_capacity: 1, missing_capability: 1 });
  });

  it('reports all applicable exclusion reasons without inflating unique excluded counts', () => {
    const result = recommend([team('team', { status: 'unavailable', capacity: 1, capabilities: [] })], [assignment()]);
    expect(result.excludedTeamCount).toBe(1);
    expect(Object.values(result.exclusionCounts).reduce((a, b) => a + b, 0)).toBe(4);
    expect(result.excludedTeams[0].reasons.map(r => r.code)).toEqual(['unavailable', 'active_assignment', 'missing_capability', 'insufficient_capacity']);
    expect(result.excludedTeams[0].reasons[1].assignmentIds).toEqual(['assignment']);
  });

  it.each(['assigned', 'in_progress'] as const)('excludes teams with a %s assignment despite available status or spare capacity', status => {
    expect(recommend([team('team', { capacity: 100 })], [assignment({ status })]).eligibleTeamCount).toBe(0);
  });

  it.each(['completed', 'cancelled'] as const)('releases assignment blocking after %s but still checks team status', status => {
    expect(recommend([team()], [assignment({ status })]).eligibleTeamCount).toBe(1);
    expect(recommend([team('team', { status: 'unavailable' })], [assignment({ status })]).eligibleTeamCount).toBe(0);
  });

  it('blocks non-open requests and stale open requests with active assignments', () => {
    for (const status of ['assigned', 'in_progress', 'resolved'] as const) {
      const report = recommend([team()], [], { ...request, status });
      expect(report.requestBlockReasons[0].code).toBe('request_not_open');
      expect(report.evaluatedTeamCount).toBe(0);
      expect(report.recommendations).toEqual([]);
    }
    const report = recommend([team()], [assignment({ requestId: 'request' })]);
    expect(report.requestBlockReasons[0].code).toBe('active_request_assignment');
    expect(report.recommendations).toEqual([]);
  });

  it('ranks raw straight-line distances with stable ID ties and bounded top-K', () => {
    const teams = [team('b'), team('a'), team('far', { longitude: 2 }), team('near', { longitude: 0 })];
    const recommender = createTeamRecommender([home], [request], teams, []);
    const result = recommender.recommend('request', { limit: 2 });
    expect(result.recommendations.map(t => t.teamId)).toEqual(['near', 'a']);
    expect(result.eligibleTeamCount).toBe(4);
    expect(result.omittedEligibleTeamCount).toBe(2);
    expect(result.excludedTeamCount).toBe(0);
    expect(createTeamRecommender([home], [request], [...teams].reverse(), []).recommend('request', { limit: 2 })).toEqual(result);
  });

  it('uses the reducer distance convention, zero distance, custom speed, and finite antipodal/dateline results', () => {
    expect(straightLineKm(home, home)).toBe(0);
    expect(straightLineKm(home, team())).toBeCloseTo(111.1949266, 5);
    expect(straightLineKm({ latitude: 0, longitude: 179.9 }, { latitude: 0, longitude: -179.9 })).toBeCloseTo(22.2389853, 5);
    expect(straightLineKm(home, { latitude: 0, longitude: 180 })).toBeCloseTo(20015.086796, 5);
    const result = createTeamRecommender([home], [request], [team()], [], { ...DEFAULT_TEAM_RECOMMENDATION_CONFIG, assumedSpeedKmh: 60 }).recommend('request');
    expect(result.recommendations[0].approximateEtaMinutes).toBe(result.recommendations[0].distanceKm);
    expect(recommend([team('same', { longitude: 0 })]).recommendations[0].approximateEtaMinutes).toBe(0);
  });

  it('does not dispatch or reserve teams, and snapshots require explicit rebuilding', () => {
    const rows = [team()];
    const recommender = createTeamRecommender([home], [request], rows, []);
    expect(recommender.recommend('request').eligibleTeamCount).toBe(1);
    expect(recommender.recommend('request').eligibleTeamCount).toBe(1);
    expect(rows[0].status).toBe('available');
    rows[0].status = 'assigned';
    expect(recommender.recommend('request').eligibleTeamCount).toBe(1);
    expect(createTeamRecommender([home], [request], rows, []).recommend('request').eligibleTeamCount).toBe(0);
  });

  it('is customer-neutral and excludes assigned/responding teams even without assignment rows', () => {
    const customer = { ...home, isCustomer: true }, community = { ...home, isCustomer: false };
    expect(createTeamRecommender([customer], [request], [team()], []).recommend('request')).toEqual(
      createTeamRecommender([community], [request], [team()], []).recommend('request'));
    for (const status of ['assigned', 'responding', 'unavailable'] as const) {
      expect(recommend([team('busy-status', { status })]).exclusionCounts.unavailable).toBe(1);
    }
  });

  it('supports bigint IDs, zero eligible teams, and optional exclusion details', () => {
    const result = createTeamRecommender([{ ...home, id: 1n }], [{ ...request, id: 2n, householdId: 1n }], [{ ...team(), id: 3n }], []).recommend(2n);
    expect(result.recommendations[0].teamId).toBe(3n);
    expect(recommend([]).eligibleTeamCount).toBe(0);
    const hidden = createTeamRecommender([home], [request], [team('x', { status: 'unavailable' })], []).recommend('request');
    expect(hidden.excludedTeams).toEqual([]);
    expect(hidden.exclusionCounts.unavailable).toBe(1);
  });

  it.each(['cancelled', 'completed'] as const)('agrees with actual dispatch and team release after %s', status => {
    const test = createModuleTestHarness(db, api);
    const admin = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'team-recommendation-admin' }), new ConnectionId(71n));
    test.clock.set(new Timestamp(1900000000000000n));
    test.withReducerTx(admin, ctx => { api.init(ctx, {}); api.seedDemo(ctx, {}); });
    const current = () => createTeamRecommender([...test.db.household.iter()],
      [...test.db.helpRequest.iter()] as DispatchRequest<bigint>[], [...test.db.responseTeam.iter()] as DispatchTeam<bigint>[],
      [...test.db.assignment.iter()] as DispatchAssignment<bigint>[]);
    const first = [...test.db.helpRequest.iter()].find(r => current().recommend(r.id).recommendations.length > 0)!;
    const selected = current().recommend(first.id).recommendations[0];
    const activityCount = test.db.activityEvent.count();
    expect(test.db.assignment.count()).toBe(0n); // Advisory reads have not dispatched.
    expect(test.db.activityEvent.count()).toBe(activityCount);
    test.withReducerTx(admin, ctx => api.assignTeam(ctx, { requestId: first.id, teamId: selected.teamId }));
    const active = [...test.db.assignment.iter()][0];
    expect(active.estimatedDistance).toBeCloseTo(selected.distanceKm, 10);
    expect(active.estimatedEta).toBeCloseTo(selected.approximateEtaMinutes, 10);
    expect(current().recommend(first.id).recommendations).toEqual([]);
    const other = [...test.db.helpRequest.iter()].find(r => r.id !== first.id && r.status === 'open')!;
    const excluded = current().recommend(other.id, { includeExcludedTeams: true }).excludedTeams.find(t => t.teamId === selected.teamId)!;
    expect(excluded.reasons.some(r => r.code === 'active_assignment')).toBe(true);
    test.withReducerTx(admin, ctx => api.updateAssignment(ctx, { assignmentId: active.id, status }));
    expect(test.db.responseTeam.id.find(selected.teamId)!.status).toBe('available');
    const after = current().recommend(other.id, { includeExcludedTeams: true });
    expect(after.excludedTeams.find(t => t.teamId === selected.teamId)?.reasons.some(r => r.code === 'active_assignment') ?? false).toBe(false);
    if (status === 'cancelled') expect(current().recommend(first.id).recommendations[0].teamId).toBe(selected.teamId);
    else expect(current().recommend(first.id).requestBlockReasons.some(r => r.code === 'request_not_open')).toBe(true);
  });

  it('rejects duplicates, invalid values, broken references, speed and limit', () => {
    expect(() => recommend([team(), team()])).toThrow(/duplicate/);
    expect(() => recommend([team('bad', { latitude: NaN })])).toThrow(/coordinates/);
    expect(() => recommend([team('bad', { capacity: 0 })])).toThrow(/resources/);
    expect(() => recommend([team()], [], { ...request, people: 1.5 })).toThrow(/people/);
    expect(() => recommend([team()], [assignment({ requestId: 'missing' })])).toThrow(/missing/);
    expect(() => recommend([team()], [], { ...request, householdId: 'missing' })).toThrow(/missing/);
    expect(() => recommend([team()], [assignment(), assignment()])).toThrow(/duplicate/);
    expect(() => createTeamRecommender([home], [request], [], [], { ...DEFAULT_TEAM_RECOMMENDATION_CONFIG, assumedSpeedKmh: 0 })).toThrow(/speed/);
    expect(() => createTeamRecommender([home], [request], [], []).recommend('missing')).toThrow(/not found/);
    expect(() => createTeamRecommender([home], [request], [], []).recommend('request', { limit: 0 })).toThrow(/limit/);
  });

  it.each(['small', 'demo', 'stress'])('matches every request in the %s dataset without retaining a request-by-team matrix', preset => {
    const data = JSON.parse(execFileSync(process.env.PYTHON ?? 'python', ['../data/scenarios/generate.py', '--preset', preset], { maxBuffer: 96 * 1024 * 1024 }).toString()) as Scenario;
    const input = scenarioTeamInputs(data);
    expect(input.households).toHaveLength({ small: 60, demo: 10000, stress: 100000 }[preset]!);
    const recommender = createTeamRecommender(input.households, input.requests, input.teams, input.assignments);
    const teams = new Map(input.teams.map(t => [t.id, t]));
    for (const request of input.requests) {
      const result = recommender.recommend(request.id, { limit: 3 });
      expect(result.requestBlockReasons).toEqual([]);
      expect(result.evaluatedTeamCount).toBe(input.teams.length);
      expect(result.eligibleTeamCount + result.excludedTeamCount).toBe(input.teams.length);
      expect(result.recommendations.length).toBeLessThanOrEqual(3);
      expect(result.eligibleTeamCount).toBeGreaterThan(0);
      for (const candidate of result.recommendations) {
        const team = teams.get(candidate.teamId)!;
        expect(team.status).toBe('available');
        expect(team.capabilities).toContain(request.needType);
        expect(team.capacity).toBeGreaterThanOrEqual(request.people);
        expect(Number.isFinite(candidate.approximateEtaMinutes)).toBe(true);
      }
    }
  }, 60000);
});
