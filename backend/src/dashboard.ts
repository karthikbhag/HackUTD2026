import { scheduledImpactMinute } from "./event-schedule";
import { eventRevision, riskLevel } from './risk-bands';
import { parseRiskMessages, expectedEventVersion } from './risk-messages';
/** Authoritative adapter for the new dashboard policy. No delivery/network I/O. */
import { SenderError, type InferSchema, type ReducerCtx, type ViewCtx } from 'spacetimedb/server';
import type db from './schema';
import { calculateExposure } from './exposure';
import { operationalLayers, refreshDecisions } from './decisions';
import { straightLineKm } from './team-recommendations';
type Ctx = ReducerCtx<InferSchema<typeof db>>;
type ReadCtx = Pick<Ctx, 'db'> | Pick<ViewCtx<InferSchema<typeof db>>, 'db'>;
export function clock(ctx: ReadCtx) {
  return ctx.db.dashboardClock.id.find(1) ?? { id: 1, runId: ctx.db.scenarioState.id.find(1)?.runId ?? 0n, minute: -120 };
}
export function validateClock(ctx: Ctx, args: { expectedRunId: bigint; expectedMinute: number }) {
  const state = clock(ctx);
  if (state.runId !== args.expectedRunId || state.minute !== args.expectedMinute) throw new SenderError('Dashboard changed; review the latest shared state');
  return state;
}
function saveClock(ctx: Ctx, state: ReturnType<typeof clock>) {
  if (ctx.db.dashboardClock.id.find(1)) ctx.db.dashboardClock.id.update(state); else ctx.db.dashboardClock.insert(state);
}
function event(ctx: Ctx, id: bigint, action: string, summary: string) {
  ctx.db.activityEvent.insert({ id: 0n, entityType: 'dashboard', entityId: id, action, summary, actorId: ctx.sender, timestamp: ctx.timestamp });
}
function area(ctx: ReadCtx, id: bigint) {
  const zone = ctx.db.zone.id.find(id);
  if (!zone || zone.level !== 'neighborhood' || !ctx.db.disaster.id.find(zone.disasterId)) throw new SenderError('Synthetic dashboard area not found');
  return zone;
}
function homeArea(ctx: ReadCtx, householdId: bigint) {
  const home = ctx.db.household.id.find(householdId);
  const zone = home && ctx.db.zone.id.find(home.zoneId);
  if (!home || !zone) throw new SenderError('Household not found');
  const hotspot = [...ctx.db.zone.disasterId.filter(zone.disasterId)].find(z => z.level === 'neighborhood');
  if (!hotspot) throw new SenderError('Household area not found');
  return { home, hotspot };
}
function areaPhase(ctx: ReadCtx, areaId: bigint, minute: number) {
  const disaster = ctx.db.disaster.id.find(area(ctx, areaId).disasterId)!;
  return minute < scheduledImpactMinute(disaster.name, disaster.type) ? 'before' : 'after';
}
function updatePhases(ctx: Ctx, minute: number) {
  for (const d of [...ctx.db.disaster.iter()]) if (d.isSimulated) {
    const phase = minute >= scheduledImpactMinute(d.name, d.type) ? 'response' : 'preparedness';
    if (d.phase !== phase) ctx.db.disaster.id.update({ ...d, phase, updatedAt: ctx.timestamp });
  }
}
const noticeId = (run: bigint, areaId: bigint, phase: string) => `${run}:${areaId}:${phase}`;
function safe(ctx: ReadCtx, run: bigint, areaId: bigint, home: { id: bigint; isCustomer: boolean; checkInStatus: string }, phase: string) {
  if (!home.isCustomer) return home.checkInStatus === 'safe';
  const repliedSafe = (p: string) => ctx.db.dashboardRecipient.id.find(`${noticeId(run, areaId, p)}:${home.id}`)?.status === 'safe';
  return repliedSafe(phase) || (phase === 'after' && repliedSafe('before'));
}
function welfare(ctx: Ctx, householdId: bigint) {
  return [...ctx.db.helpRequest.householdId.filter(householdId)].find(r => r.needType === 'welfare_check' && r.status !== 'resolved')
    ?? ctx.db.helpRequest.insert({ id: 0n, householdId, needType: 'welfare_check', urgency: 3, people: 1, status: 'open', createdAt: ctx.timestamp, resolvedAt: undefined });
}
export function sendNotice(ctx: Ctx, args: { expectedRunId: bigint; expectedMinute: number; areaId: bigint; message: string }) {
  const state = validateClock(ctx, args), zone = area(ctx, args.areaId), phase = areaPhase(ctx, zone.id, state.minute);
  const id = noticeId(state.runId, zone.id, phase), message = args.message.trim();
  const messages = parseRiskMessages(message);
  if (!message || message.length > (messages ? 76000 : 4000)) throw new SenderError('Review a message of 1–4000 characters');
  if (ctx.db.dashboardNotice.id.find(id)) throw new SenderError('This area already has an approved notice for this phase');
  const layers = operationalLayers(ctx).filter(l => l.disaster_id === String(zone.disasterId));
  const version = eventRevision(layers);
  if (expectedEventVersion(message) && expectedEventVersion(message) !== version) throw new SenderError('Risk changed; review the latest event before approval');
  const exposed = calculateExposure([...ctx.db.household.iter()].map(h => ({ id: String(h.id), latitude: h.latitude, longitude: h.longitude })), layers);
  const affected = new Set(exposed.households.filter(h => h.affected).map(h => h.householdId));
  const homes = [...ctx.db.household.iter()].filter(h => affected.has(String(h.id)))
    .filter(h => h.isCustomer && !safe(ctx, state.runId, zone.id, h, phase) && currentResponse(ctx, state.runId, h.id)?.status !== 'completed');
  if (!homes.length) throw new SenderError('No unconfirmed customer recipients remain');
  saveClock(ctx, state);
  ctx.db.dashboardNotice.insert({ id, runId: state.runId, areaId: zone.id, phase, sentAt: state.minute, deadline: state.minute + 30, message });
  const risks = new Map(exposed.households.map(h => [h.householdId, riskLevel(h.highestSeverity)]));
  for (const h of homes) {
    const band = risks.get(String(h.id))!;
    ctx.db.dashboardRecipient.insert({ id: `${id}:${h.id}`, noticeId: id, householdId: h.id, status: 'unknown', repliedAt: undefined,
      riskLevel: band, approvedMessage: messages && band !== 'None' ? messages[band] : message, eventVersion: version });
  }
  event(ctx, zone.id, 'notification_approved', `${phase} simulated notice approved for ${homes.length} recipients; no messages delivered`);
}
export function recordReply(ctx: Ctx, args: { expectedRunId: bigint; expectedMinute: number; householdId: bigint; reply: string; areaId?: bigint }) {
  const state = validateClock(ctx, args), original = homeArea(ctx, args.householdId), home = original.home, hotspot = args.areaId === undefined ? original.hotspot : area(ctx,args.areaId), phase = areaPhase(ctx, hotspot.id, state.minute);
  if (!['safe', 'needs_help'].includes(args.reply) || (phase === 'before' && args.reply !== 'safe')) throw new SenderError('Invalid reply for this notification phase');
  const recipient = ctx.db.dashboardRecipient.id.find(`${noticeId(state.runId, hotspot.id, phase)}:${home.id}`);
  if (!recipient || safe(ctx, state.runId, hotspot.id, home, phase)) throw new SenderError('Household is not awaiting a reply in this round');
  if (currentResponse(ctx, state.runId, home.id)) throw new SenderError('Response unit already approved');
  ctx.db.dashboardRecipient.id.update({ ...recipient, status: args.reply, repliedAt: ctx.timestamp });
  ctx.db.household.id.update({ ...home, checkInStatus: args.reply, lastContactAt: ctx.timestamp });
  if (args.reply === 'needs_help') welfare(ctx, home.id);
  refreshDecisions(ctx, home.id);
  event(ctx, home.id, 'notification_reply', `${phase} simulated ${args.reply} reply; existing assistance records preserved`);
}
export function advanceClock(ctx: Ctx, args: { expectedRunId: bigint; expectedMinute: number; step: string }) {
  const state = validateClock(ctx, args), notices = [...ctx.db.dashboardNotice.iter()].filter(n => n.runId === state.runId);
  if (args.step === 'impact') {
    const next = Math.min(...[...ctx.db.disaster.iter()].filter(d => d.isSimulated).map(d => scheduledImpactMinute(d.name, d.type)).filter(t => t > state.minute));
    if (!Number.isFinite(next)) throw new SenderError('No pending scheduled impacts');
    saveClock(ctx, { ...state, minute: next });
    updatePhases(ctx, next);
    event(ctx, 1n, 'dashboard_impact', `Shared clock advanced to T+${next}; only due disasters enter response`);
  } else if (args.step === 'deadline' || args.step === 'complete_rescues') {
    if (args.step === 'complete_rescues') {
      const active = [...ctx.db.dashboardResponse.iter()].some(r => r.runId === state.runId
        && ['assigned', 'in_progress'].includes(ctx.db.assignment.id.find(r.assignmentId)?.status ?? ''));
      if (state.minute < 0 || !active) throw new SenderError('No active dashboard rescues to complete');
    } else if (state.minute < 0 || !notices.some(n => n.phase === 'after' && n.deadline > state.minute)) throw new SenderError('No pending second-notification deadline');
    const minute = state.minute + 30;
    saveClock(ctx, { ...state, minute });
    updatePhases(ctx, minute);
    event(ctx, 1n, args.step === 'complete_rescues' ? 'dashboard_rescues_completed' : 'dashboard_deadline', `Shared clock advanced to T+${minute}${args.step === 'complete_rescues' ? '; active dashboard rescues completed and units released' : ''}; due unanswered cases have welfare-review requests, not automatic dispatch`);
  } else throw new SenderError('Unknown clock step');
  for (const notice of notices.filter(n => n.phase === 'after' && n.deadline <= clock(ctx).minute)) {
      for (const r of [...ctx.db.dashboardRecipient.noticeId.filter(notice.id)]) {
        const h = ctx.db.household.id.find(r.householdId);
        if (h && r.status === 'unknown' && !safe(ctx, state.runId, notice.areaId, h, 'after') && !currentResponse(ctx, state.runId, h.id)) welfare(ctx, h.id);
      }
    }
  refreshDecisions(ctx);
}
function currentResponse(ctx: ReadCtx, run: bigint, householdId: bigint) {
  const response = ctx.db.dashboardResponse.id.find(`${run}:${householdId}`);
  const assignment = response && ctx.db.assignment.id.find(response.assignmentId);
  return assignment && assignment.status !== 'cancelled' ? assignment : undefined;
}
export function prepareResponse(ctx: Ctx, args: { expectedRunId: bigint; expectedMinute: number; householdId: bigint; teamId: bigint; areaId?: bigint }, automatic = false) {
  const state = validateClock(ctx,args), original = homeArea(ctx,args.householdId), home = original.home, hotspot = args.areaId === undefined ? original.hotspot : area(ctx,args.areaId);
  if (areaPhase(ctx, hotspot.id, state.minute) !== 'after' || safe(ctx, state.runId, hotspot.id, home, 'after')) throw new SenderError('Confirmed-safe or pre-impact households cannot receive dashboard response units');
  if (currentResponse(ctx, state.runId, home.id)) throw new SenderError('Response unit already approved');
  let requests = [...ctx.db.helpRequest.householdId.filter(home.id)].filter(r => r.status !== 'resolved');
  const notice = ctx.db.dashboardNotice.id.find(noticeId(state.runId, hotspot.id, 'after'));
  const recipient = notice && ctx.db.dashboardRecipient.id.find(`${notice.id}:${home.id}`);
  if (automatic ? recipient?.status !== 'needs_help' : !recipient || recipient.status !== 'unknown' || state.minute < notice!.deadline) {
    throw new SenderError(automatic ? 'No explicit help reply' : 'No overdue unanswered second-notification reply');
  }
  if (!requests.length) requests = [welfare(ctx, home.id)];
  if (requests.some(r => r.status !== 'open')) throw new SenderError('Household already has assigned assistance');
  const team = ctx.db.responseTeam.id.find(args.teamId);
  if (!team || team.status !== 'available' || requests.some(r => !team.capabilities.includes(r.needType) || team.capacity < r.people)) throw new SenderError('Team capability, capacity or availability no longer matches');
  requests.sort((a, b) => b.urgency - a.urgency || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { state, requestId: requests[0].id };
}
/** Choose a compatible free unit; a missing unit must not discard the help reply. */
export function prepareAutomaticResponse(ctx: Ctx, args: { expectedRunId: bigint; expectedMinute: number; householdId: bigint; areaId?: bigint }) {
  const state = validateClock(ctx, args), { home, hotspot } = homeArea(ctx, args.householdId);
  const selectedArea = args.areaId ?? hotspot.id;
  const recipient = ctx.db.dashboardRecipient.id.find(`${noticeId(state.runId, selectedArea, 'after')}:${home.id}`);
  if (areaPhase(ctx, selectedArea, state.minute) !== 'after' || recipient?.status !== 'needs_help' || safe(ctx, state.runId, selectedArea, home, 'after') || currentResponse(ctx, state.runId, home.id)) return;
  const requests = [...ctx.db.helpRequest.householdId.filter(home.id)].filter(r => r.status !== 'resolved');
  if (!requests.length || requests.some(r => r.status !== 'open' || [...ctx.db.assignment.requestId.filter(r.id)].some(a => ['assigned', 'in_progress'].includes(a.status)))) return;
  const candidates = [...ctx.db.responseTeam.iter()].filter(team => team.status === 'available'
    && !ctx.db.responseTeamState.teamId.find(team.id)
    && ![...ctx.db.assignment.teamId.filter(team.id)].some(a => ['assigned', 'in_progress'].includes(a.status))
    && requests.every(r => team.capabilities.includes(r.needType) && team.capacity >= r.people));
  const ranked = candidates.map(team => ({ team, distance: straightLineKm(home, team) }))
    .sort((a, b) => a.distance - b.distance || (a.team.id < b.team.id ? -1 : a.team.id > b.team.id ? 1 : 0));
  const team = ranked[0]?.team;
  if (!team) return;
  return { ...prepareResponse(ctx, { ...args, teamId: team.id }, true), teamId: team.id };
}
export function saveResponse(ctx: Ctx, run: bigint, householdId: bigint, requestId: bigint) {
  const assignment = [...ctx.db.assignment.requestId.filter(requestId)].find(a => ['assigned', 'in_progress'].includes(a.status));
  if (!assignment) throw new SenderError('Committed assignment not found');
  const row = { id: `${run}:${householdId}`, runId: run, householdId, requestId, assignmentId: assignment.id };
  if (ctx.db.dashboardResponse.id.find(row.id)) ctx.db.dashboardResponse.id.update(row); else ctx.db.dashboardResponse.insert(row);
}
export function resetDashboardState(ctx: Ctx) {
  const state = clock(ctx);
  for (const r of [...ctx.db.dashboardRecipient.iter()]) ctx.db.dashboardRecipient.id.delete(r.id);
  for (const n of [...ctx.db.dashboardNotice.iter()]) ctx.db.dashboardNotice.id.delete(n.id);
  for (const r of [...ctx.db.dashboardResponse.iter()]) ctx.db.dashboardResponse.id.delete(r.id);
  saveClock(ctx, { ...state, runId: state.runId + 1n, minute: -120 });
}
