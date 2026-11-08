import { synchronizeWelfare } from './response-routing';
/** Shared, employee-controlled synthetic clock. Delivery is recorded, never sent. */
import { SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import type db from './schema';
import { refreshDecisions } from './decisions';
type Ctx = ReducerCtx<InferSchema<typeof db>>;
export function exerciseState(ctx: Ctx, disasterId: bigint, expectedRunId: bigint, expectedMinute: number) {
  const run = ctx.db.scenarioState.id.find(1), disaster = ctx.db.disaster.id.find(disasterId);
  if (!run || run.runId !== expectedRunId) throw new SenderError('Scenario changed; refresh the desk');
  if (!disaster?.isSimulated) throw new SenderError('Synthetic disaster not found');
  const existing = ctx.db.areaExercise.disasterId.find(disasterId);
  const state = existing ?? { disasterId, runId: run.runId, minute: disaster.phase === 'response' ? 0 : -120,
    preSent: false, postSent: false, preMessage: '', postMessage: '' };
  if (state.runId !== expectedRunId || state.minute !== expectedMinute) throw new SenderError('Exercise advanced; refresh the desk');
  return state;
}
function save(ctx: Ctx, state: ReturnType<typeof exerciseState>) {
  if (ctx.db.areaExercise.disasterId.find(state.disasterId)) ctx.db.areaExercise.disasterId.update(state);
  else ctx.db.areaExercise.insert(state);
}
function homes(ctx: Ctx, disasterId: bigint) {
  return [...ctx.db.zone.disasterId.filter(disasterId)].flatMap(z => [...ctx.db.household.zoneId.filter(z.id)]);
}
function event(ctx: Ctx, disasterId: bigint, action: string, summary: string) {
  ctx.db.activityEvent.insert({ id: 0n, entityType: 'disaster', entityId: disasterId, action, summary,
    actorId: ctx.sender, timestamp: ctx.timestamp });
}
export function sendExerciseNotice(ctx: Ctx, args: { disasterId: bigint; expectedRunId: bigint; expectedMinute: number; message: string }) {
  const state = exerciseState(ctx, args.disasterId, args.expectedRunId, args.expectedMinute);
  const before = state.minute < 0;
  if (before ? state.preSent : state.postSent) throw new SenderError('This round already has an approved notice');
  const message = args.message.trim();
  if (!message || message.length > 2000) throw new SenderError('Review a notice of 1–2000 characters');
  const households = homes(ctx, args.disasterId);
  if (!households.length) throw new SenderError('No households in this exercise area');
  save(ctx, { ...state, preSent: before || state.preSent, postSent: !before || state.postSent,
    preMessage: before ? message : state.preMessage, postMessage: before ? state.postMessage : message });
  for (const h of households) {
    ctx.db.exerciseCheckIn.insert({ id: `${state.runId}:${state.disasterId}:${before ? 'before' : 'after'}:${h.id}`,
      disasterId: state.disasterId, householdId: h.id, runId: state.runId, phase: before ? 'before' : 'after', status: 'unknown',
      sentAtMinute: state.minute, deadlineMinute: state.minute + 30, replyAtMinute: undefined, requestId: undefined });
    // A pre-impact reply is not confirmation of post-impact safety.
    if (!before) ctx.db.household.id.update({ ...h, checkInStatus: 'unknown' });
  }
  if (!before) refreshDecisions(ctx);
  event(ctx, state.disasterId, 'notice_approved', `${before ? 'Preparation' : 'Fresh post-impact'} notice recorded for ${households.length} households; no messages delivered`);
}
function welfareRequest(ctx: Ctx, householdId: bigint) {
  const active = [...ctx.db.helpRequest.householdId.filter(householdId)].find(r => r.needType === 'welfare_check' && r.status !== 'resolved');
  return active?.id ?? ctx.db.helpRequest.insert({ id: 0n, householdId, needType: 'welfare_check', urgency: 3, people: 1,
    status: 'open', createdAt: ctx.timestamp, resolvedAt: undefined }).id;
}
export function advanceExercise(ctx: Ctx, args: { disasterId: bigint; expectedRunId: bigint; expectedMinute: number }) {
  const state = exerciseState(ctx, args.disasterId, args.expectedRunId, args.expectedMinute);
  if (state.minute < 0) {
    if (!state.preSent) throw new SenderError('Approve a preparation notice before advancing to impact');
    save(ctx, { ...state, minute: 0 });
    event(ctx, state.disasterId, 'exercise_impact', 'Shared synthetic clock advanced two hours to impact; pre-impact replies retained');
    return true;
  }
  if (!state.postSent || state.minute >= 30) throw new SenderError('Send the post-impact check-in before advancing to its deadline');
  save(ctx, { ...state, minute: 30 });
  for (const row of [...ctx.db.exerciseCheckIn.disasterId.filter(state.disasterId)]) {
    if (row.runId === state.runId && row.phase === 'after' && row.status === 'unknown') {
      const home = ctx.db.household.id.find(row.householdId);
      const routed = home && [...ctx.db.responseRun.iter()].some(r => r.zoneId === home.zoneId && r.scenarioRunId === state.runId && r.status !== 'reset');
      if (routed) synchronizeWelfare(ctx, row.householdId);
      else ctx.db.exerciseCheckIn.id.update({ ...row, requestId: row.requestId ?? welfareRequest(ctx, row.householdId) });
    }
  }
  refreshDecisions(ctx);
  event(ctx, state.disasterId, 'exercise_deadline', 'Shared 30-minute reply deadline reached; unanswered check-ins have reviewable welfare requests, no automatic dispatch');
  return false;
}
export function replyToExercise(ctx: Ctx, args: { disasterId: bigint; householdId: bigint; expectedRunId: bigint; expectedMinute: number; status: string }) {
  const state = exerciseState(ctx, args.disasterId, args.expectedRunId, args.expectedMinute);
  if (!['safe', 'needs_help'].includes(args.status)) throw new SenderError('Reply must be safe or needs_help');
  const phase = state.minute < 0 ? 'before' : 'after';
  const row = ctx.db.exerciseCheckIn.id.find(`${state.runId}:${state.disasterId}:${phase}:${args.householdId}`);
  const home = ctx.db.household.id.find(args.householdId);
  if (!row || !home) throw new SenderError('Household is not in this approved check-in round');
  ctx.db.exerciseCheckIn.id.update({ ...row, status: args.status, replyAtMinute: state.minute,
    requestId: args.status === 'needs_help' ? welfareRequest(ctx, home.id) : row.requestId });
  ctx.db.household.id.update({ ...home, checkInStatus: args.status, lastContactAt: ctx.timestamp });
  if (phase === 'after') synchronizeWelfare(ctx, home.id);
  refreshDecisions(ctx, home.id);
  event(ctx, state.disasterId, 'exercise_reply', `Household ${home.id}: ${phase} simulated ${args.status} reply; assistance resolution remains separate`);
}
