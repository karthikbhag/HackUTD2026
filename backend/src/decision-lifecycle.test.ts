import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ConnectionId, Timestamp } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import db, * as api from './index';
import { seed, resetOperationalData } from './seed';
import { source, type Scenario } from './scenario';

const start = 1900000000123456n;
const admin = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'decision-admin' }), new ConnectionId(81n));
const employee = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'decision-employee' }), new ConnectionId(82n));
const outsider = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'decision-outsider' }), new ConnectionId(83n));
function fixture() {
  const test = createModuleTestHarness(db, api); test.clock.set(new Timestamp(start));
  test.withReducerTx(admin, ctx => { api.init(ctx, {}); api.seedDemo(ctx, {}); api.setEmployee(ctx, { identity: test.viewContext(employee).sender, enabled: true }); });
  return test;
}
const detail = (test: ReturnType<typeof fixture>, householdId: bigint) => JSON.parse(api.householdDecisions(test.viewContext(employee), { householdId })[0].payload);

describe('integrated decision lifecycle', () => {
  it('seeds explicit Small impacts, compact summaries, provenance and authorized detail views', () => {
    const test = fixture();
    expect(test.db.impactLayer.count()).toBe(10n);
    expect(test.db.decisionSummary.count()).toBe(60n);
    expect(test.db.recommendationTemplate.count()).toBe(12n);
    expect(api.scenarioInfo(test.viewContext(admin))[0]).toMatchObject({ runId: 1n, canManageScenario: true });
    expect(api.scenarioInfo(test.viewContext(employee))[0].canManageScenario).toBe(false);
    expect(api.decisions(test.viewContext(outsider))).toEqual([]);
    expect(api.householdDecisions(test.viewContext(outsider), { householdId: 1n })).toEqual([]);
    expect(api.scenarioInfo(test.viewContext(outsider))).toEqual([]);
    const request = [...test.db.helpRequest.iter()][0];
    expect(api.teamRecommendations(test.viewContext(outsider), { requestId: request.id })).toEqual([]);
    const row = detail(test, request.householdId);
    expect(row.score).toBe(row.reasons.reduce((sum: number, r: { points: number }) => sum + r.points, 0));
    test.withReducerTx(admin, ctx => api.setEmployee(ctx, { identity: test.viewContext(employee).sender, enabled: false }));
    expect(api.decisions(test.viewContext(employee))).toEqual([]);
    expect(api.householdDecisions(test.viewContext(employee), { householdId: request.householdId })).toEqual([]);
  });

  it('initializes missing upgrade state without replacing operational rows or inventing legacy footprints', () => {
    const test = fixture();
    const requestIds = [...test.db.helpRequest.iter()].map(r => r.id);
    const contacts = [...test.db.household.iter()].map(h => [h.id, h.lastContactAt]);
    const history = test.db.activityEvent.count();
    test.withReducerTx(admin, ctx => {
      for (const row of [...ctx.db.decisionSummary.iter()]) ctx.db.decisionSummary.householdId.delete(row.householdId);
      for (const row of [...ctx.db.recommendationTemplate.iter()]) ctx.db.recommendationTemplate.id.delete(row.id);
      for (const row of [...ctx.db.decisionTick.iter()]) ctx.db.decisionTick.scheduledId.delete(row.scheduledId);
      ctx.db.scenarioState.id.delete(1);
      for (const row of [...ctx.db.impactLayer.iter()]) ctx.db.impactLayer.id.update({ ...row, recommendationIds: [] });
      api.refreshDecisionSnapshot(ctx, {});
    });
    expect(test.db.scenarioState.id.find(1)!.runId).toBe(0n);
    expect(test.db.decisionSummary.count()).toBe(60n);
    expect(test.db.recommendationTemplate.count()).toBe(12n);
    expect(test.db.decisionTick.count()).toBe(1n);
    expect([...test.db.impactLayer.iter()].every(l => l.recommendationIds.length === 2)).toBe(true);
    expect([...test.db.helpRequest.iter()].map(r => r.id)).toEqual(requestIds);
    expect([...test.db.household.iter()].map(h => [h.id, h.lastContactAt])).toEqual(contacts);
    expect(test.db.activityEvent.count()).toBe(history);
    test.withReducerTx(admin, ctx => {
      for (const row of [...ctx.db.impactLayer.iter()]) ctx.db.impactLayer.id.delete(row.id);
      api.refreshDecisionSnapshot(ctx, {});
    });
    expect(test.db.impactLayer.count()).toBe(0n);
    expect([...test.db.decisionSummary.iter()].every(s => s.layerIds.length === 0)).toBe(true);
    expect(test.db.decisionTick.count()).toBe(1n);
    expect(test.db.employee.identity.find(test.viewContext(employee).sender)).toBeDefined();
  });

  it('updates contact, safety and request resolution independently and transactionally', () => {
    const test = fixture();
    const summary = [...test.db.decisionSummary.iter()].find(r => r.overlooked && [...test.db.helpRequest.householdId.filter(r.householdId)].some(q => q.status === 'open'))!;
    const id = summary.householdId;
    test.withReducerTx(employee, ctx => api.recordOutreach(ctx, { householdId: id }));
    expect(test.db.decisionSummary.householdId.find(id)!.overlooked).toBe(false);
    expect(test.db.decisionSummary.householdId.find(id)!.needsFollowUp).toBe(true);
    test.withReducerTx(employee, ctx => api.updateCheckIn(ctx, { householdId: id, status: 'safe' }));
    expect(detail(test, id).unresolvedRequestCount).toBeGreaterThan(0);
    for (const request of [...test.db.helpRequest.householdId.filter(id)]) test.withReducerTx(employee, ctx => api.resolveRequest(ctx, { requestId: request.id }));
    expect(detail(test, id).unresolvedRequestCount).toBe(0);
    expect(detail(test, id).needsFollowUp).toBe(false);
  });

  it('approves a suggestion once, tracks completion and rejects stale-run approvals after reset', () => {
    const test = fixture();
    const selected = [...test.db.decisionSummary.iter()].map(r => ({ id: r.householdId, value: detail(test, r.householdId) })).find(r => r.value.preparation.suggestions.length)!;
    const recommendationId = selected.value.preparation.suggestions[0].recommendationId;
    const args = { householdId: selected.id, recommendationId, expectedRunId: 1n };
    test.withReducerTx(employee, ctx => api.approvePreparedness(ctx, args));
    expect(() => test.withReducerTx(employee, ctx => api.approvePreparedness(ctx, args))).toThrow(/already exists/);
    const task = [...test.db.preparednessTask.iter()].find(t => t.recommendationId === recommendationId)!;
    expect(task.scenarioRunId).toBe(1n);
    test.withReducerTx(employee, ctx => api.updateTask(ctx, { taskId: task.id, status: 'completed' }));
    expect(detail(test, selected.id).preparation.suppressed.some((s: { recommendationId: string }) => s.recommendationId === recommendationId)).toBe(true);
    test.clock.set(new Timestamp(start + 3600_000_000n));
    test.withReducerTx(admin, ctx => api.resetDemo(ctx, { confirmation: 'RESET SYNTHETIC DEMO' }));
    expect(test.db.scenarioState.id.find(1)!.runId).toBe(2n);
    expect(() => test.withReducerTx(employee, ctx => api.approvePreparedness(ctx, args))).toThrow(/changed/);
    expect(detail(test, selected.id).preparation.suggestions.some((s: { recommendationId: string }) => s.recommendationId === recommendationId)).toBe(true);
    expect(test.db.employee.identity.find(test.viewContext(employee).sender)).not.toBeNull();
    expect([...test.db.activityEvent.iter()].some(e => e.action === 'suggestion_approved')).toBe(true);
  });

  it('escalates each hazard in isolation, increases affected priority and saturates at critical', () => {
    const test = fixture();
    for (const disaster of [...test.db.disaster.iter()]) {
      const layers = [...test.db.impactLayer.disasterId.filter(disaster.id)];
      const ids = new Set(layers.map(l => l.id));
      const affected = [...test.db.decisionSummary.iter()].find(s => s.layerIds.some(id => ids.has(id)))!;
      const beforeScore = affected.score;
      const others = [...test.db.impactLayer.iter()].filter(l => l.disasterId !== disaster.id);
      test.withReducerTx(admin, ctx => api.escalateScenario(ctx, { disasterId: disaster.id }));
      expect(test.db.disaster.id.find(disaster.id)!.phase).toBe('response');
      expect([...test.db.impactLayer.disasterId.filter(disaster.id)].every(l => ['high', 'critical'].includes(l.severity))).toBe(true);
      for (const layer of others) expect(test.db.impactLayer.id.find(layer.id)).toEqual(layer);
      expect(test.db.decisionSummary.householdId.find(affected.householdId)!.score).toBeGreaterThan(beforeScore);
      expect(detail(test, affected.householdId).preparation.suggestions).toEqual([]);
      test.withReducerTx(admin, ctx => api.escalateScenario(ctx, { disasterId: disaster.id }));
      const capped = test.db.decisionSummary.householdId.find(affected.householdId)!.score;
      test.withReducerTx(admin, ctx => api.escalateScenario(ctx, { disasterId: disaster.id }));
      expect(test.db.decisionSummary.householdId.find(affected.householdId)!.score).toBe(capped);
      expect([...test.db.impactLayer.disasterId.filter(disaster.id)].every(l => l.severity === 'critical')).toBe(true);
    }
    expect(() => test.withReducerTx(employee, ctx => api.escalateScenario(ctx, { disasterId: 1n }))).toThrow(/authorization/);
    expect(() => test.withReducerTx(outsider, ctx => api.refreshDecisionSnapshot(ctx, {}))).toThrow(/authorization/);
  });

  it('refreshes time-derived flags through the private scheduled reducer without rewriting unchanged summaries', () => {
    const test = fixture();
    const request = [...test.db.helpRequest.iter()].find(r => r.urgency === 3)!;
    test.withReducerTx(employee, ctx => api.recordOutreach(ctx, { householdId: request.householdId }));
    const fresh = test.db.decisionSummary.householdId.find(request.householdId)!;
    expect(fresh.overlooked).toBe(false);
    const tick = [...test.db.decisionTick.iter()][0];
    expect(() => test.withReducerTx(employee, ctx => api.refreshDecisionClock(ctx, { timer: tick }))).toThrow();
    test.clock.set(new Timestamp(start + 1_000_000n));
    test.withReducerTx(TestAuth.internal(), ctx => api.refreshDecisionClock(ctx, { timer: tick }));
    expect(test.db.decisionSummary.householdId.find(request.householdId)!.computedAt).toEqual(fresh.computedAt);
    test.clock.set(new Timestamp(start + 360n * 60_000_000n));
    test.withReducerTx(TestAuth.internal(), ctx => api.refreshDecisionClock(ctx, { timer: tick }));
    expect(test.db.decisionSummary.householdId.find(request.householdId)!.overlooked).toBe(true);
    expect(test.db.decisionTick.count()).toBe(1n);
  });

  it.each(['small', 'demo', 'stress'])('resets %s reproducibly with relative times, fresh IDs and retained memberships/history', preset => {
    const data = preset === 'small' ? source : JSON.parse(execFileSync(process.env.PYTHON ?? 'python', ['../data/scenarios/generate.py', '--preset', preset], { maxBuffer: 96 * 1024 * 1024 }).toString()) as Scenario;
    const test = createModuleTestHarness(db, api); test.clock.set(new Timestamp(start));
    test.withReducerTx(admin, ctx => { api.init(ctx, {}); seed(ctx, data); });
    const digest = () => createHash('sha256').update(JSON.stringify([...test.db.decisionSummary.iter()]
      .sort((a, b) => a.householdId < b.householdId ? -1 : a.householdId > b.householdId ? 1 : 0)
      .map(s => [s.householdId.toString(), s.score, s.overlooked]))).digest('hex');
    const baseline = digest();
    const requestIds = new Set([...test.db.helpRequest.iter()].map(r => r.id));
    const selected = [...test.db.disaster.iter()][0];
    test.withReducerTx(admin, ctx => api.escalateScenario(ctx, { disasterId: selected.id }));
    const history = test.db.activityEvent.count();
    test.clock.set(new Timestamp(start + 7200_000_000n));
    test.withReducerTx(admin, ctx => resetOperationalData(ctx, data));
    expect(test.db.household.count()).toBe(BigInt({ small: 60, demo: 10000, stress: 100000 }[preset]!));
    expect(digest()).toBe(baseline);
    expect(test.db.scenarioState.id.find(1)!.runId).toBe(2n);
    expect([...test.db.disaster.iter()].every(d => d.phase === 'preparedness')).toBe(true);
    expect([...test.db.impactLayer.iter()].every(l => ['moderate', 'high'].includes(l.severity))).toBe(true);
    expect([...test.db.helpRequest.iter()].every(r => !requestIds.has(r.id))).toBe(true);
    expect([...test.db.helpRequest.iter()][0].createdAt.microsSinceUnixEpoch).toBe(start + 3600_000_000n);
    expect(test.db.activityEvent.count()).toBe(history);
    expect(test.db.employee.identity.find(test.viewContext(admin).sender)?.admin).toBe(true);
    expect(test.db.decisionTick.count()).toBe(1n);
  }, 300000);
});
