import { describe, expect, it } from 'vitest';
import { ConnectionId, Timestamp } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import db, * as api from './index';
const admin = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'admin' }), new ConnectionId(51n));
const employee = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'employee' }), new ConnectionId(52n));
const stranger = TestAuth.fromJwtPayload(JSON.stringify({ iss: 'test', sub: 'stranger' }), new ConnectionId(53n));
function fixture() {
  const test = createModuleTestHarness(db, api); test.clock.set(new Timestamp(1900000000000000n));
  test.withReducerTx(admin, ctx => { api.init(ctx, {}); api.seedDemo(ctx, {}); api.setEmployee(ctx, { identity: test.viewContext(employee).sender, enabled: true }); });
  const disasterId = [...test.db.disaster.iter()][0].id, expectedRunId = test.db.scenarioState.id.find(1)!.runId;
  return { test, args: { disasterId, expectedRunId, expectedMinute: -120 } };
}
describe('authoritative decisions and shared exercise', () => {
  it('exposes actual scores and reviewed suggestions only to employees', () => {
    const { test } = fixture();
    expect(api.decisions(test.viewContext(employee))).toHaveLength(60);
    expect(api.decisions(test.viewContext(stranger))).toEqual([]);
    const summary = [...test.db.decisionSummary.iter()].find(r => r.layerIds.length)!;
    const detail = JSON.parse(api.householdDecisions(test.viewContext(employee), { householdId: summary.householdId })[0].payload);
    expect(detail.score).toBe(detail.reasons.reduce((n: number, r: { points: number }) => n + r.points, 0));
    const suggestion = detail.preparation.suggestions[0]; expect(suggestion).toBeDefined();
    const args = { householdId: summary.householdId, recommendationId: suggestion.recommendationId, expectedRunId: 1n };
    test.withReducerTx(employee, ctx => api.approvePreparedness(ctx, args));
    expect(() => test.withReducerTx(employee, ctx => api.approvePreparedness(ctx, args))).toThrow(/already exists/);
    const task = [...test.db.preparednessTask.iter()].find(t => t.recommendationId === suggestion.recommendationId)!;
    test.withReducerTx(employee, ctx => api.updateTask(ctx, { taskId: task.id, status: 'completed' }));
    expect(JSON.parse(api.householdDecisions(test.viewContext(employee), { householdId: summary.householdId })[0].payload).preparation.suppressed).toHaveLength(1);
  });
  it('shares separate rounds, preserves earlier replies and flags fresh post-impact nonresponses', () => {
    const { test, args } = fixture();
    test.withReducerTx(employee, ctx => api.approveExerciseNotice(ctx, { ...args, message: 'Reviewed preparation notice' }));
    const rows = api.exerciseReplies(test.viewContext(employee), { disasterId: args.disasterId }); expect(rows).toHaveLength(10);
    const householdId = rows[0].householdId;
    test.withReducerTx(employee, ctx => api.recordExerciseReply(ctx, { ...args, householdId, status: 'safe' }));
    test.withReducerTx(admin, ctx => api.advanceExerciseClock(ctx, args));
    expect(test.db.disaster.id.find(args.disasterId)!.phase).toBe('response');
    expect(test.db.exerciseCheckIn.id.find(rows[0].id)!.status).toBe('safe');
    const after = { ...args, expectedMinute: 0 };
    test.withReducerTx(employee, ctx => api.approveExerciseNotice(ctx, { ...after, message: 'Fresh post-impact safety check-in' }));
    expect(test.db.household.id.find(householdId)!.checkInStatus).toBe('unknown');
    test.withReducerTx(admin, ctx => api.advanceExerciseClock(ctx, after));
    const post = [...test.db.exerciseCheckIn.householdId.filter(householdId)].find(r => r.phase === 'after')!;
    expect(post.status).toBe('unknown'); expect(post.requestId).toBeDefined();
    expect(test.db.decisionSummary.householdId.find(householdId)!.overlooked).toBe(true);
    const count = test.db.helpRequest.count();
    test.withReducerTx(employee, ctx => api.recordExerciseReply(ctx, { ...args, expectedMinute: 30, householdId, status: 'needs_help' }));
    expect(test.db.helpRequest.count()).toBe(count); // Reuse existing active welfare request.
    test.withReducerTx(employee, ctx => api.recordExerciseReply(ctx, { ...args, expectedMinute: 30, householdId, status: 'safe' }));
    expect(test.db.helpRequest.id.find(post.requestId!)!.status).toBe('open'); // Safety never resolves assistance.
  });
  it('rejects unauthorized, stale, duplicate and out-of-order operations without partial changes', () => {
    const { test, args } = fixture();
    expect(() => test.withReducerTx(stranger, ctx => api.approveExerciseNotice(ctx, { ...args, message: 'notice' }))).toThrow(/authorization/);
    expect(() => test.withReducerTx(admin, ctx => api.advanceExerciseClock(ctx, args))).toThrow(/preparation notice/);
    expect(test.db.areaExercise.count()).toBe(0n);
    test.withReducerTx(employee, ctx => api.approveExerciseNotice(ctx, { ...args, message: 'notice' }));
    expect(() => test.withReducerTx(employee, ctx => api.approveExerciseNotice(ctx, { ...args, message: 'duplicate' }))).toThrow(/already/);
    expect(() => test.withReducerTx(stranger, ctx => api.advanceExerciseClock(ctx, args))).toThrow(/authorization/);
    expect(() => test.withReducerTx(employee, ctx => api.recordExerciseReply(ctx, { ...args, householdId: 999n, status: 'safe' }))).toThrow(/not in/);
    test.withReducerTx(admin, ctx => api.advanceExerciseClock(ctx, args));
    expect(() => test.withReducerTx(employee, ctx => api.recordExerciseReply(ctx, { ...args, householdId: 1n, status: 'safe' }))).toThrow(/advanced/);
    expect(api.exercises(test.viewContext(stranger))).toEqual([]);
    expect(api.exerciseReplies(test.viewContext(stranger), { disasterId: args.disasterId })).toEqual([]);
  });
  it('keeps other hazards unchanged and resets exercise/run state while preserving access/history', () => {
    const { test, args } = fixture();
    const others = [...test.db.impactLayer.iter()].filter(r => r.disasterId !== args.disasterId);
    test.withReducerTx(employee, ctx => api.approveExerciseNotice(ctx, { ...args, message: 'notice' }));
    test.withReducerTx(admin, ctx => api.advanceExerciseClock(ctx, args));
    for (const row of others) expect(test.db.impactLayer.id.find(row.id)).toEqual(row);
    const requestIds = new Set([...test.db.helpRequest.iter()].map(r => r.id)), history = test.db.activityEvent.count();
    test.withReducerTx(admin, ctx => api.resetDemo(ctx, { confirmation: 'RESET SYNTHETIC DEMO' }));
    expect(test.db.exerciseCheckIn.count()).toBe(0n); expect(test.db.areaExercise.count()).toBe(0n);
    expect(test.db.scenarioState.id.find(1)!.runId).toBe(2n); expect(test.db.decisionSummary.count()).toBe(60n);
    expect([...test.db.helpRequest.iter()].every(r => !requestIds.has(r.id))).toBe(true);
    expect(test.db.activityEvent.count()).toBeGreaterThan(history);
    expect(api.decisions(test.viewContext(employee))).toHaveLength(60);
    expect(() => test.withReducerTx(employee, ctx => api.approveExerciseNotice(ctx, { ...args, message: 'stale' }))).toThrow(/changed/);
  });
});
