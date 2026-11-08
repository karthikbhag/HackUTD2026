import {describe,it,expect} from 'vitest';
import {ConnectionId,Timestamp} from 'spacetimedb';
import {createModuleTestHarness,TestAuth} from 'spacetimedb/server/test-utils';
import db,* as api from './index';
import {toMapData} from '../../frontend/src/lib/map/backend-data';
import {eventRevision} from './risk-bands';
import {operationalLayers} from './decisions';
const admin=TestAuth.fromJwtPayload(JSON.stringify({iss:'test',sub:'weather-admin'}),new ConnectionId(301n));
const outsider=TestAuth.fromJwtPayload(JSON.stringify({iss:'test',sub:'weather-outsider'}),new ConnectionId(302n));
function setup(){
  const test=createModuleTestHarness(db,api);test.clock.set(new Timestamp(1900000000000000n));
  test.withReducerTx(admin,ctx=>{api.init(ctx,{});api.seedDemo(ctx,{});});
  const area=[...test.db.zone.iter()].find(z=>z.level==='neighborhood')!;
  const run=()=>test.db.scenarioState.id.find(1)!.runId;
  const next=()=>{const expectedRunId=run();test.withReducerTx(admin,ctx=>api.advanceDummyWeather(ctx,{areaId:area.id,expectedRunId}));};
  return {test,area,run,next};
}
describe('shared dummy weather stream',()=>{
 it('emits type, severity, location and consistent bands without replacing households or advancing the scenario clock',()=>{
  const {test,area,next}=setup();const households=[...test.db.household.iter()],teams=[...test.db.responseTeam.iter()],requests=[...test.db.helpRequest.iter()];
  next();const layers=api.impactLayers(test.viewContext(admin)).filter(l=>l.disasterId===area.disasterId);
  expect(layers).toHaveLength(3);
  expect(layers.map(l=>JSON.parse(l.geometry).riskCircle.radiusMeters).sort((a,b)=>a-b)).toEqual([500,1500,3000]);
  expect(JSON.parse(layers[0].geometry).riskCircle.eventSeverity).toBe('moderate');
  const rows={disasters:api.disasters(test.viewContext(admin)),zones:api.zones(test.viewContext(admin)),households:api.households(test.viewContext(admin)),teams:api.teams(test.viewContext(admin)),requests:api.requests(test.viewContext(admin)),assignments:[],tasks:api.tasks(test.viewContext(admin)),impactLayers:api.impactLayers(test.viewContext(admin))};
  const model=toMapData(rows),zone=model.zones.find(z=>z.id===String(area.id))!;
  expect(zone.radiiMeters).toEqual([500,1500,3000]);
  expect(model.households.every(h=>['High','Medium','Low','None'].includes(h.riskLevel!))).toBe(true);
  test.withReducerTx(admin,ctx=>expect(zone.eventVersion).toBe(eventRevision(operationalLayers(ctx).filter(l=>l.disaster_id===String(area.disasterId)))));
  expect([...test.db.household.iter()]).toEqual(households);expect([...test.db.responseTeam.iter()]).toEqual(teams);expect([...test.db.helpRequest.iter()]).toEqual(requests);
  expect(api.dashboardState(test.viewContext(admin))[0].minute).toBe(-120);
  next();expect(JSON.parse(api.impactLayers(test.viewContext(admin)).find(l=>l.disasterId===area.disasterId)!.geometry).riskCircle.eventSeverity).toBe('high');
 });
 it('shares play/pause, prevents duplicate timers, validates intervals and authorization, and stops on reset',()=>{
  const {test,area,run,next}=setup();
  const args={areaId:area.id,expectedRunId:run(),enabled:true,intervalSeconds:15};
  expect(()=>test.withReducerTx(outsider,ctx=>api.setDummyWeatherFeed(ctx,args))).toThrow(/authorization/);
  expect(()=>test.withReducerTx(admin,ctx=>api.setDummyWeatherFeed(ctx,{...args,intervalSeconds:1}))).toThrow(/interval/);
  test.withReducerTx(admin,ctx=>api.setDummyWeatherFeed(ctx,args));test.withReducerTx(admin,ctx=>api.setDummyWeatherFeed(ctx,args));
  expect(test.db.hazardFeedTick.count()).toBe(1n);expect(api.dummyWeatherState(test.viewContext(outsider))).toEqual([]);
  next();test.withReducerTx(admin,ctx=>api.setDummyWeatherFeed(ctx,{...args,enabled:false}));expect(test.db.hazardFeedTick.count()).toBe(0n);
  test.withReducerTx(admin,ctx=>api.resetDemo(ctx,{confirmation:'RESET SYNTHETIC DEMO'}));
  expect(test.db.hazardFeedState.id.find(1)?.enabled).toBe(false);expect(()=>test.withReducerTx(admin,ctx=>api.advanceDummyWeather(ctx,{areaId:area.id,expectedRunId:args.expectedRunId}))).toThrow(/Scenario changed/);
 });
 it('preserves approved per-band messages and recipients across weather updates and rejects a stale review',()=>{
  const {test,area,run,next}=setup();next();
  const layers=api.impactLayers(test.viewContext(admin)).filter(l=>l.disasterId===area.disasterId);
  let version='';test.withReducerTx(admin,ctx=>{version=eventRevision(operationalLayers(ctx).filter(l=>l.disaster_id===String(area.disasterId)));});
  const messages={High:'HIGH approved',Medium:'MEDIUM approved',Low:'LOW approved'};
  const args={areaId:area.id,expectedRunId:run(),expectedMinute:-120,message:JSON.stringify({format:'risk-messages-v1',messages,eventVersion:version})};
  next();expect(()=>test.withReducerTx(admin,ctx=>api.approveDashboardNotice(ctx,args))).toThrow(/Risk changed/);
  test.withReducerTx(admin,ctx=>{const current=eventRevision(operationalLayers(ctx).filter(l=>l.disaster_id===String(area.disasterId)));api.approveDashboardNotice(ctx,{...args,message:JSON.stringify({format:'risk-messages-v1',messages,eventVersion:current})});});
  const recipients=api.dashboardRecipients(test.viewContext(admin));expect(recipients.length).toBeGreaterThan(0);
  expect(recipients.every(r=>r.riskLevel!=='None' && r.approvedMessage===messages[r.riskLevel as keyof typeof messages])).toBe(true);
  next();expect(api.dashboardRecipients(test.viewContext(admin))).toEqual(recipients);
 });
});
