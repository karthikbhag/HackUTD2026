import { describe, it, expect } from 'vitest';
import { ConnectionId, Timestamp } from 'spacetimedb';
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils';
import db, * as api from './index';
const admin = TestAuth.fromJwtPayload(JSON.stringify({ iss:'test', sub:'admin' }), new ConnectionId(81n));
const other = TestAuth.fromJwtPayload(JSON.stringify({ iss:'test', sub:'worker2' }), new ConnectionId(82n));
function fixture() {
  const test = createModuleTestHarness(db, api); test.clock.set(new Timestamp(1900000000000000n));
  test.withReducerTx(admin, ctx => { api.init(ctx, {}); api.seedDemo(ctx, {}); });
  const zone = [...test.db.zone.iter()].find(z => z.level === 'neighborhood')!;
  const scenarioRunId = test.db.scenarioState.id.find(1)!.runId;
  test.withReducerTx(admin, ctx => {
    ctx.db.areaExercise.insert({ disasterId: zone.disasterId, runId: scenarioRunId, minute:30, preSent:true, postSent:true, preMessage:'test', postMessage:'test' });
    for (const h of ctx.db.household.zoneId.filter(zone.id)) ctx.db.exerciseCheckIn.insert({ id:`${scenarioRunId}:${zone.disasterId}:after:${h.id}`, disasterId:zone.disasterId, householdId:h.id, runId:scenarioRunId, phase:'after', status:'unknown', sentAtMinute:0, deadlineMinute:30, replyAtMinute:undefined, requestId:undefined });
    for (const id of [90001n,90002n]) ctx.db.responseTeam.insert({ id, name:'Synthetic route team', latitude:32.8, longitude:-96.8, status:'available', capacity:0, capabilities:['welfare_check'] });
    api.startResponseDemo(ctx, { zoneId:zone.id, teamIds:[90001n,90002n], stagingLatitude:32.8, stagingLongitude:-96.8 });
    api.setRoutingWorker(ctx,{ identity:ctx.sender, enabled:true });
    api.claimRoutingLease(ctx,{runId:1n});
  });
  return test;
}
function plan(test: ReturnType<typeof fixture>) {
  const run = test.db.responseRun.id.find(1n)!;
  const visit = [...test.db.welfareVisit.iter()][0];
  return { runId:1n, fence:run.fence, epoch:run.epoch, configVersion:run.configVersion, provider:'fixture', routes:[{teamId:90001n, positionVersion:0n, visitIds:[visit.id], arrivalMinutes:[1],returnMinute:10}] };
}
describe('transactional routing lifecycle', () => {
  it('creates a dedicated queue without passenger capacity checks or new requests', () => {
    const test = fixture(); expect([...test.db.welfareVisit.iter()].length).toBeGreaterThan(0);
    const count = test.db.helpRequest.count(); const proposal = plan(test); test.withReducerTx(admin,ctx=>api.publishResponsePlan(ctx,proposal));
    expect(test.db.helpRequest.count()).toBe(count);
    const request = [...test.db.helpRequest.iter()].find(r=>r.status==='open')!;
    expect(()=>test.withReducerTx(admin,ctx=>api.assignTeam(ctx,{requestId:request.id,teamId:90001n}))).toThrow(/reserved/);
  });
  it('cancels safe stops immediately and rejects stale results without changing assistance', () => {
    const test=fixture(), proposal=plan(test), visit=test.db.welfareVisit.id.find(proposal.routes[0].visitIds[0])!;
    test.withReducerTx(admin,ctx=>api.publishResponsePlan(ctx,proposal));
    const requests=[...test.db.helpRequest.iter()];
    test.withReducerTx(admin,ctx=>api.updateCheckIn(ctx,{householdId:visit.householdId,status:'safe'}));
    expect(test.db.welfareVisit.id.find(visit.id)!.state).toBe('cancelled');
    expect(()=>test.withReducerTx(admin,ctx=>api.publishResponsePlan(ctx,proposal))).toThrow(/Stale/);
    expect([...test.db.helpRequest.iter()]).toEqual(requests);
  });
  it('rejects duplicate stops atomically and fences competing workers', () => {
    const test=fixture(), proposal=plan(test); proposal.routes[0].visitIds.push(proposal.routes[0].visitIds[0]); proposal.routes[0].arrivalMinutes.push(7);
    expect(()=>test.withReducerTx(admin,ctx=>api.publishResponsePlan(ctx,proposal))).toThrow(/duplicate/);
    expect(test.db.teamRoute.count()).toBe(0n);
    test.withReducerTx(admin,ctx=>api.setRoutingWorker(ctx,{identity:test.viewContext(other).sender,enabled:true}));
    expect(()=>test.withReducerTx(other,ctx=>api.claimRoutingLease(ctx,{runId:1n}))).toThrow(/leased/);
  });
  it('invalidates late work on reset and releases reserved teams', () => {
    const test=fixture(), proposal=plan(test);
    test.withReducerTx(admin,ctx=>api.resetResponseDemo(ctx,{runId:1n}));
    expect(()=>test.withReducerTx(admin,ctx=>api.publishResponsePlan(ctx,proposal))).toThrow(/changed/);
    expect(test.db.responseTeamState.count()).toBe(0n);
  });
});
describe('routing simulation safety', () => {
  it('preserves an in-progress check on safe reply and requires configured dwell', () => {
    const test=fixture(), proposal=plan(test), visitId=proposal.routes[0].visitIds[0];
    test.withReducerTx(admin,ctx=>{ api.publishResponsePlan(ctx,proposal); api.resumeResponseDemo(ctx,{runId:1n}); });
    const tick={runId:1n,fence:1n,teamId:90001n,routeVersion:1n,sequence:1n,latitude:32.8,longitude:-96.8,action:'arrive',outcome:''};
    test.clock.set(new Timestamp(1900000006000000n)); // one simulated minute at 10x
    test.withReducerTx(admin,ctx=>api.advanceResponseSimulation(ctx,tick));
    const home=test.db.welfareVisit.id.find(visitId)!.householdId;
    test.withReducerTx(admin,ctx=>api.updateCheckIn(ctx,{householdId:home,status:'safe'}));
    expect(test.db.welfareVisit.id.find(visitId)!.state).toBe('in_progress');
    expect(test.db.welfareVisit.id.find(visitId)!.notice).toMatch(/safe/);
    expect(()=>test.withReducerTx(admin,ctx=>api.advanceResponseSimulation(ctx,{...tick,sequence:2n,action:'complete',outcome:'Simulated check'}))).toThrow(/not complete/);
    test.withReducerTx(admin,ctx=>api.renewRoutingLease(ctx,{runId:1n,fence:1n}));
    test.clock.set(new Timestamp(1900000020000000n));
    test.withReducerTx(admin,ctx=>api.renewRoutingLease(ctx,{runId:1n,fence:1n}));
    test.clock.set(new Timestamp(1900000036000000n));
    test.withReducerTx(admin,ctx=>api.advanceResponseSimulation(ctx,{...tick,sequence:2n,action:'complete',outcome:'Simulated check; follow-up needed'}));
    expect(test.db.welfareVisit.id.find(visitId)!.state).toBe('completed');
  });
  it('freezes travel after safe cancellation and rejects duplicate ticks', () => {
    const test=fixture(), proposal=plan(test), visit=test.db.welfareVisit.id.find(proposal.routes[0].visitIds[0])!;
    test.withReducerTx(admin,ctx=>{api.publishResponsePlan(ctx,proposal);api.resumeResponseDemo(ctx,{runId:1n});});
    const tick={runId:1n,fence:1n,teamId:90001n,routeVersion:1n,sequence:1n,latitude:32.8,longitude:-96.8,action:'move',outcome:''};
    test.withReducerTx(admin,ctx=>api.advanceResponseSimulation(ctx,tick));
    expect(()=>test.withReducerTx(admin,ctx=>api.advanceResponseSimulation(ctx,tick))).toThrow(/Stale/);
    test.withReducerTx(admin,ctx=>api.updateCheckIn(ctx,{householdId:visit.householdId,status:'safe'}));
    expect(test.db.responseTeamState.teamId.find(90001n)!.currentVisitId).toBeUndefined();
    expect(()=>test.withReducerTx(admin,ctx=>api.advanceResponseSimulation(ctx,{...tick,sequence:2n}))).toThrow();
  });
  it('seeds and resets only the isolated fixture, leaving nationwide data intact', () => {
    const test=fixture(); test.withReducerTx(admin,ctx=>api.resetResponseDemo(ctx,{runId:1n}));
    const households=test.db.household.count(), teams=test.db.responseTeam.count();
    test.withReducerTx(admin,ctx=>api.seedResponseRoutingDemo(ctx,{}));
    expect(test.db.household.count()).toBe(households+20n);expect(test.db.responseTeam.count()).toBe(teams+2n);
    const run=[...test.db.responseRun.iter()].find(r=>r.status!=='reset')!;
    expect([...test.db.welfareVisit.runId.filter(run.id)]).toHaveLength(17);
    test.withReducerTx(admin,ctx=>api.resetResponseDemo(ctx,{runId:run.id}));
    expect(test.db.household.count()).toBe(households);expect(test.db.responseTeam.count()).toBe(teams);
  });
});
describe('routing versions and clock', () => {
  it('rejects expired owners after takeover with an increasing fence', () => {
    const test=fixture(), old=plan(test);
    test.withReducerTx(admin,ctx=>api.setRoutingWorker(ctx,{identity:test.viewContext(other).sender,enabled:true}));
    test.clock.set(new Timestamp(1900000031000000n));
    test.withReducerTx(other,ctx=>api.claimRoutingLease(ctx,{runId:1n}));
    expect(test.db.responseRun.id.find(1n)!.fence).toBe(2n);
    expect(()=>test.withReducerTx(admin,ctx=>api.publishResponsePlan(ctx,old))).toThrow(/lease lost/);
  });
  it('preserves elapsed time on pause and speed changes', () => {
    const test=fixture(); test.withReducerTx(admin,ctx=>api.resumeResponseDemo(ctx,{runId:1n}));
    test.clock.set(new Timestamp(1900000006000000n));
    test.withReducerTx(admin,ctx=>api.pauseResponseDemo(ctx,{runId:1n}));
    expect(test.db.responseRun.id.find(1n)!.elapsedMinutes).toBe(1);
    test.clock.set(new Timestamp(1900000012000000n));
    const config=JSON.parse(test.db.responseRun.id.find(1n)!.config); config.simulationSpeed=20;
    test.withReducerTx(admin,ctx=>api.updateResponseSettings(ctx,{runId:1n,config:JSON.stringify(config)}));
    expect(test.db.responseRun.id.find(1n)!.elapsedMinutes).toBe(1);
    test.withReducerTx(admin,ctx=>api.resumeResponseDemo(ctx,{runId:1n}));
    test.clock.set(new Timestamp(1900000015000000n));
    test.withReducerTx(admin,ctx=>api.pauseResponseDemo(ctx,{runId:1n}));
    expect(test.db.responseRun.id.find(1n)!.elapsedMinutes).toBe(2);
  });
  it('rejects changed origins and infeasible return timing', () => {
    const test=fixture(), proposal=plan(test);
    proposal.routes[0].positionVersion=1n;
    expect(()=>test.withReducerTx(admin,ctx=>api.publishResponsePlan(ctx,proposal))).toThrow(/origin changed/);
    proposal.routes[0].positionVersion=0n; proposal.routes[0].returnMinute=121;
    expect(()=>test.withReducerTx(admin,ctx=>api.publishResponsePlan(ctx,proposal))).toThrow(/shift timing/);
  });
  it('requeues future work when a team becomes unavailable', () => {
    const test=fixture(), proposal=plan(test);
    test.withReducerTx(admin,ctx=>api.publishResponsePlan(ctx,proposal));
    test.withReducerTx(admin,ctx=>api.setResponseTeamAvailability(ctx,{runId:1n,teamId:90001n,available:false}));
    expect(test.db.welfareVisit.id.find(proposal.routes[0].visitIds[0])!.state).toBe('pending');
    expect(test.db.responseTeamState.teamId.find(90001n)!.available).toBe(false);
    expect(()=>test.withReducerTx(admin,ctx=>api.publishResponsePlan(ctx,proposal))).toThrow(/Stale/);
  });
});
describe('planning coordination',()=>{
 it('holds the current origin and playback clock while a solve is in flight',()=>{
  const test=fixture(),proposal=plan(test);
  test.withReducerTx(admin,ctx=>{api.publishResponsePlan(ctx,proposal);api.resumeResponseDemo(ctx,{runId:1n});});
  test.clock.set(new Timestamp(1900000006000000n));
  test.withReducerTx(admin,ctx=>api.holdResponsePlanning(ctx,{runId:1n,fence:1n}));
  const held=test.db.responseRun.id.find(1n)!;expect(held.elapsedMinutes).toBe(1);
  test.clock.set(new Timestamp(1900000012000000n));
  expect(()=>test.withReducerTx(admin,ctx=>api.advanceResponseSimulation(ctx,{runId:1n,fence:1n,teamId:90001n,routeVersion:1n,sequence:1n,latitude:32.8,longitude:-96.8,action:'move',outcome:''}))).toThrow(/Planning hold/);
  test.withReducerTx(admin,ctx=>api.responsePlanningFailed(ctx,{runId:1n,fence:1n,message:'Provider unavailable'}));
  expect(test.db.responseRun.id.find(1n)!.elapsedMinutes).toBe(1);expect([...test.db.teamRoute.iter()][0].status).toBe('stale');
 });
 it('does not allow a provider failure to resurrect a safe destination',()=>{
  const test=fixture(),proposal=plan(test),visit=test.db.welfareVisit.id.find(proposal.routes[0].visitIds[0])!;
  test.withReducerTx(admin,ctx=>{api.publishResponsePlan(ctx,proposal);api.resumeResponseDemo(ctx,{runId:1n});api.updateCheckIn(ctx,{householdId:visit.householdId,status:'safe'});api.responsePlanningFailed(ctx,{runId:1n,fence:1n,message:'Provider unavailable'});});
  expect(test.db.welfareVisit.id.find(visit.id)!.state).toBe('cancelled');
  expect(()=>test.withReducerTx(admin,ctx=>api.publishResponsePlan(ctx,proposal))).toThrow(/Stale/);
 });
});
