import fixture from '../../data/scenarios/response-routing-demo.json';
import { SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import type db from './schema';
import { responseRoutingDefaults, validateResponseRoutingConfig, type ResponseRoutingConfig } from '../../shared/response-routing-config';
type Ctx = ReducerCtx<InferSchema<typeof db>>;
export const terminal = (state: string) => state === 'completed' || state === 'cancelled';
export function configOf(config: string): ResponseRoutingConfig { return validateResponseRoutingConfig(JSON.parse(config)); }
export function runOf(ctx: Ctx, id: bigint) {
  const run = ctx.db.responseRun.id.find(id);
  if (!run || run.status === 'reset' || ctx.db.scenarioState.id.find(1)?.runId !== run.scenarioRunId) throw new SenderError('Routing run changed');
  return run;
}
export function minuteOf(ctx: Ctx, run: ReturnType<typeof runOf>) {
  const elapsed = run.elapsedMinutes + (run.status === 'running' && run.holdUntil <= ctx.timestamp.microsSinceUnixEpoch ? Number(ctx.timestamp.microsSinceUnixEpoch - run.anchorMicros) / 60000000 * configOf(run.config).simulationSpeed : 0);
  // The existing employee-controlled exercise can advance to the reply deadline.
  const exercise = ctx.db.areaExercise.disasterId.find(run.disasterId);
  return Math.max(elapsed, exercise ? exercise.minute - run.startMinute : 0);
}
export function workerRun(ctx: Ctx, id: bigint, fence: bigint) {
  const run = runOf(ctx, id);
  if (!ctx.db.routingWorker.identity.find(ctx.sender) || !run.leaseOwner?.equals(ctx.sender) || run.fence !== fence || run.leaseUntil <= ctx.timestamp.microsSinceUnixEpoch) throw new SenderError('Routing lease lost');
  return run;
}
export function synchronizeWelfare(ctx: Ctx, householdId: bigint) {
  const home = ctx.db.household.id.find(householdId);
  if (!home) return;
  for (const run of ctx.db.responseRun.iter()) {
    if (run.status === 'reset' || run.zoneId !== home.zoneId || ctx.db.scenarioState.id.find(1)?.runId !== run.scenarioRunId) continue;
    const round = [...ctx.db.exerciseCheckIn.householdId.filter(householdId)].find(r => r.runId === run.scenarioRunId && r.disasterId === run.disasterId && r.phase === 'after');
    if (!round) continue;
    const visits = [...ctx.db.welfareVisit.householdId.filter(householdId)].filter(v => v.runId === run.id);
    const active = visits.find(v => !terminal(v.state));
    const safe = home.checkInStatus === 'safe';
    const urgent = home.checkInStatus === 'urgent' || home.checkInStatus === 'needs_help';
    const now = run.startMinute + minuteOf(ctx, run);
    if (safe && active) {
      const keep = active.state === 'in_progress';
      ctx.db.welfareVisit.id.update({ ...active, state: keep ? active.state : 'cancelled', notice: 'Fresh safe report received', teamId: keep ? active.teamId : undefined });
      if (!keep && active.teamId !== undefined) {
        const team = ctx.db.responseTeamState.teamId.find(active.teamId);
        if (team?.currentVisitId === active.id) ctx.db.responseTeamState.teamId.update({ ...team, currentVisitId: undefined, mode: 'holding' });
      }
    } else if (!safe && (urgent || now >= round.deadlineMinute)) {
      if (active) ctx.db.welfareVisit.id.update({ ...active, priority: urgent ? 'urgent' : 'unknown' });
      // Completed checks stay completed. Reopening a cancelled case creates one fresh visit.
      else if (!visits.some(v => v.state === 'completed')) ctx.db.welfareVisit.insert({ id: 0n, runId: run.id, householdId, priority: urgent ? 'urgent' : 'unknown', eligibleSince: minuteOf(ctx, run), state: 'pending', teamId: undefined, sequence: 0, arrivalMinute: 0, serviceMinutes: configOf(run.config).visitMinutes, startedMinute: undefined, outcome: '', notice: '' });
    }
    ctx.db.responseRun.id.update({ ...run, epoch: run.epoch + 1n });
  }
}
export function createRun(ctx: Ctx, args: { zoneId: bigint; teamIds: bigint[]; stagingLatitude: number; stagingLongitude: number }) {
  const zone = ctx.db.zone.id.find(args.zoneId), scenario = ctx.db.scenarioState.id.find(1);
  const exercise = zone && ctx.db.areaExercise.disasterId.find(zone.disasterId);
  if (!zone || !scenario || !exercise?.postSent || exercise.runId !== scenario.runId || exercise.minute < 0) throw new SenderError('Fresh post-impact check-in required');
  if ([...ctx.db.responseRun.iter()].some(r => r.zoneId === zone.id && r.status !== 'reset' && r.scenarioRunId === scenario.runId)) throw new SenderError('Area already has a routing run');
  if (zone.level !== 'neighborhood' || [...ctx.db.household.zoneId.filter(zone.id)].length > responseRoutingDefaults.householdCount) throw new SenderError('Select a compact neighborhood within fixture bounds');
  if (new Set(args.teamIds).size !== args.teamIds.length || args.teamIds.length !== responseRoutingDefaults.teamCount) throw new SenderError('Select two distinct teams');
  if (!Number.isFinite(args.stagingLatitude) || Math.abs(args.stagingLatitude) > 90 || !Number.isFinite(args.stagingLongitude) || Math.abs(args.stagingLongitude) > 180) throw new SenderError('Invalid staging point');
  for (const id of args.teamIds) {
    const team = ctx.db.responseTeam.id.find(id), state = ctx.db.responseTeamState.teamId.find(id);
    if (!team || team.status !== 'available' || !team.capabilities.includes('welfare_check') || state || [...ctx.db.assignment.teamId.filter(id)].some(a => ['assigned','in_progress'].includes(a.status))) throw new SenderError('Team unavailable');
  }
  const run = ctx.db.responseRun.insert({ id: 0n, disasterId: zone.disasterId, zoneId: zone.id, scenarioRunId: scenario.runId, ownsFixture: false, config: JSON.stringify(responseRoutingDefaults), configVersion: 1, epoch: 1n, planVersion: 0n, status: 'paused', elapsedMinutes: 0, anchorMicros: ctx.timestamp.microsSinceUnixEpoch, startMinute: exercise.minute, stagingLatitude: args.stagingLatitude, stagingLongitude: args.stagingLongitude, holdUntil: 0n, leaseOwner: undefined, leaseUntil: 0n, fence: 0n, planningError: '' });
  ctx.db.activityEvent.insert({ id: 0n, entityType: 'zone', entityId: zone.id, action: 'routing_approved', summary: `Welfare routing approved for ${zone.name}; two teams reserved, exercise paused`, actorId: ctx.sender, timestamp: ctx.timestamp });
  for (const teamId of args.teamIds) ctx.db.responseTeamState.insert({ teamId, runId: run.id, positionVersion: 0n, updatedAt: ctx.timestamp, mode: 'holding', currentVisitId: undefined, available: true, tickSequence: 0n });
  for (const h of ctx.db.household.zoneId.filter(zone.id)) synchronizeWelfare(ctx, h.id);
}

/** Explicitly approved synthetic post-impact fixture; does not replace nationwide rows. */
export function seedRoutingFixture(ctx: Ctx) {
  const scenario = ctx.db.scenarioState.id.find(1);
  if (!scenario) throw new SenderError('Seed the shared scenario first');
  if ([...ctx.db.responseRun.iter()].some(r => r.scenarioRunId === scenario.runId && r.status !== 'reset')) throw new SenderError('Reset existing routing runs first');
  const nextId = (rows: Iterable<{ id: bigint }>) => [...rows].reduce((max, r) => r.id > max ? r.id : max, 0n) + 1n;
  const disasterId = nextId(ctx.db.disaster.iter()), zoneId = nextId(ctx.db.zone.iter());
  ctx.db.disaster.insert({ id: disasterId, name: fixture.name, type: 'tornado', phase: 'response', source: fixture.source, isSimulated: true, updatedAt: ctx.timestamp });
  ctx.db.zone.insert({ id: zoneId, disasterId, name: fixture.name, level: 'neighborhood', parentZoneId: undefined, boundary: JSON.stringify({ type:'Polygon', coordinates:[[[-96.777,32.828],[-96.763,32.828],[-96.763,32.839],[-96.777,32.839],[-96.777,32.828]]] }), riskLevel:4, updatedAt:ctx.timestamp });
  ctx.db.areaExercise.insert({ disasterId, runId:scenario.runId, minute:30, preSent:true, postSent:true, preMessage:'Synthetic fixture preparation round', postMessage:'Employee-started simulated welfare-routing exercise; no messages delivered' });
  let householdId = nextId(ctx.db.household.iter());
  for (const h of fixture.households.slice(0, responseRoutingDefaults.householdCount)) {
    const id = householdId++;
    ctx.db.household.insert({ id, zoneId, displayName:h.name, latitude:h.latitude, longitude:h.longitude, isCustomer:true, checkInStatus:h.status, vulnerabilityFlags:[], lastContactAt:undefined });
    ctx.db.exerciseCheckIn.insert({ id:`${scenario.runId}:${disasterId}:after:${id}`, disasterId, householdId:id, runId:scenario.runId, phase:'after', status:h.status, sentAtMinute:0, deadlineMinute:30, replyAtMinute:h.status === 'unknown' ? undefined : 0, requestId:undefined });
  }
  let teamId = nextId(ctx.db.responseTeam.iter());
  const teamIds = fixture.teams.slice(0, responseRoutingDefaults.teamCount).map(team => {
    const id = teamId++;
    ctx.db.responseTeam.insert({ id, name:team.name, latitude:fixture.staging.latitude, longitude:fixture.staging.longitude, status:'available', capacity:0, capabilities:['welfare_check'] });
    return id;
  });
  createRun(ctx, { zoneId, teamIds, stagingLatitude:fixture.staging.latitude, stagingLongitude:fixture.staging.longitude });
  const run = [...ctx.db.responseRun.iter()].find(r => r.zoneId === zoneId)!;
  ctx.db.responseRun.id.update({ ...run, ownsFixture: true });
}
