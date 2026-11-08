import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DbConnection, tables } from '../../frontend/src/module_bindings';
import type { ResponseRun } from '../../frontend/src/module_bindings/types';
import { responseRoutingDefaults, validateResponseRoutingConfig } from '../../shared/response-routing-config';
const configOf = (value: string) => validateResponseRoutingConfig(JSON.parse(value));
import { solve, type Visit, type Team } from './solver';
import { GoogleTravelProvider, FixtureTravelProvider, interpolate, type Leg, type Point } from './travel-provider';
// Keep SDK/server imports out of worker: config parsing is pure.
const uri=process.env.SPACETIMEDB_URI??process.env.NEXT_PUBLIC_SPACETIMEDB_URI??'http://127.0.0.1:3100';
const database=process.env.SPACETIMEDB_DATABASE??process.env.NEXT_PUBLIC_SPACETIMEDB_DATABASE;
if(!database)throw new Error('Database environment required');
const root=resolve(import.meta.dirname,'../..'), tokenPath=resolve(root,'.tmp/routing-worker-token');
mkdirSync(resolve(root,'.tmp'),{recursive:true});
let token=process.env.ROUTING_WORKER_TOKEN;try{token??=readFileSync(tokenPath,'utf8').trim();}catch{}
const provider=process.env.ROUTING_PROVIDER==='fixture'?new FixtureTravelProvider():new GoogleTravelProvider(process.env.GOOGLE_MAPS_API_KEY??'',responseRoutingDefaults.maxProviderRetries,'demo');
interface Playback { version:bigint; epoch:bigint; legs:Leg[]; starts:number[]; visitIds:bigint[]; origin:Point; expires:number }
const playback=new Map<string,Playback>(), lastPlan=new Map<string,{epoch:bigint;config:number;at:number}>(), dirtySince=new Map<string,number>(), retryAfter=new Map<string,number>();
let ready=false,busy=false,connected=false;
const c=DbConnection.builder().withUri(uri).withDatabaseName(database).withToken(token).withAutomaticReconnect().onConnect((conn,identity,t)=>{
  connected=true;writeFileSync(tokenPath,t,{mode:0o600});
  console.log(`Routing worker identity: ${identity.toHexString()} (enroll with set_routing_worker)`);
}).onDisconnect(()=>{ready=false;connected=false;playback.clear();}).onConnectError(()=>console.error('Routing connection unavailable')).build();
c.subscriptionBuilder().onApplied(()=>{ready=true;}).onError(()=>{ready=false;console.error('Routing subscriptions unavailable; publish module/enroll worker');}).subscribe([tables.responseRuns,tables.welfareVisits,tables.teamRoutes,tables.responseTeamStates,tables.routingHouseholds,tables.routingTeams]);
const elapsed=(run:ResponseRun)=>run.elapsedMinutes+(run.status==='running'&&Number(run.holdUntil/1000n)<=Date.now()?(Date.now()-Number(run.anchorMicros/1000n))/60000*configOf(run.config).simulationSpeed:0);
const own=(run:ResponseRun)=>run.leaseOwner?.equals(c.identity!)&&Number(run.leaseUntil/1000n)>Date.now();
async function planning(run:ResponseRun){
  const config=configOf(run.config);
  await c.reducers.holdResponsePlanning({runId:run.id,fence:run.fence});
  // Reducer success follows transaction application; positions cannot move during this hold.
  run=c.db.responseRuns.id.find(run.id)!;
  const now=elapsed(run), staging={latitude:run.stagingLatitude,longitude:run.stagingLongitude};
  const states=[...c.db.responseTeamStates.iter()].filter(s=>s.runId===run.id&&s.available);
  const homes=new Map([...c.db.routingHouseholds.iter()].map(h=>[h.id,h]));
  const rows=[...c.db.welfareVisits.iter()].filter(v=>v.runId===run.id&&!['cancelled','completed'].includes(v.state));
  const points:Point[]=[staging],visits:Visit[]=[];
  for(const row of rows){const h=homes.get(row.householdId);if(!h||h.checkInStatus==='safe'&&row.state!=='in_progress')continue;const point=points.push(h)-1;visits.push({id:String(row.id),point,urgent:row.priority==='urgent',eligibleSince:row.eligibleSince,previousTeamId:row.teamId===undefined?undefined:String(row.teamId),serviceMinutes:row.state==='in_progress'?Math.max(0,(row.startedMinute??now)+row.serviceMinutes-now):config.visitMinutes});}
  const teams:Team[]=states.flatMap(state=>{
    const team=c.db.routingTeams.id.find(state.teamId);if(!team)return [];
    const point=points.push(team)-1;
    const current=rows.find(v=>v.id===state.currentVisitId), anyNewUrgent=rows.some(v=>v.priority==='urgent'&&v.id!==current?.id&&v.state==='pending');
    const fixed=current&&(current.state==='in_progress'||current.state==='en_route'&&!anyNewUrgent)?visits.filter(v=>v.id===String(current.id)):[];
    // Active dwell begins at the current position with no extra driving leg.
    if(current?.state==='in_progress'&&fixed[0])fixed[0].point=point;
    return [{id:String(state.teamId),point,remainingMinutes:Math.max(0,config.shiftMinutes-now),fixed}];
  });
  const matrix=teams.length?await provider.matrix(points,new Date().toISOString()):points.map(()=>points.map(()=>null));
  const result=solve(visits,teams,matrix,0,config.visitMinutes,{now,urgentTargetMinutes:config.urgentTargetMinutes,timeBudgetMs:config.solverTimeBudgetMs});
  const routes: {teamId:bigint;positionVersion:bigint;visitIds:bigint[];arrivalMinutes:number[];returnMinute:number}[]=[], pending=new Map<string,Playback>();
  for(const route of result.routes){
    const state=states.find(s=>String(s.teamId)===route.teamId)!, team=teams.find(t=>t.id===route.teamId)!;
    let stops=[...route.visits], legs:Leg[]=[], arrivals:number[]=[], starts:number[]=[], end=now;
    for(;;){
      legs=await provider.directions(points[team.point],stops.map(v=>points[v.point]),staging);
      end=now;arrivals=[];starts=[];
      stops.forEach((v,i)=>{starts.push(end);end+=legs[i].minutes;arrivals.push(end);end+=v.serviceMinutes??config.visitMinutes;});starts.push(end);end+=legs.at(-1)!.minutes;
      if(end<=config.shiftMinutes||!stops.length)break;
      // Remove optional unknowns first; preserve active service and pinned destination.
      let remove=-1;for(let i=stops.length-1;i>=(team.fixed?.length??0);i--)if(!stops[i].urgent){remove=i;break;}
      if(remove<0)remove=stops.length-1;
      if(remove<(team.fixed?.length??0))throw new Error('Active work cannot return within shift; escalation required');
      const [removed]=stops.splice(remove,1);result.unassigned.push({visitId:removed.id,reason:'insufficient remaining time after road directions revalidation'});
    }
    if(end>config.shiftMinutes)throw new Error('Staging unreachable within remaining shift');
    routes.push({teamId:state.teamId,positionVersion:state.positionVersion,visitIds:stops.map(v=>BigInt(v.id)),arrivalMinutes:arrivals,returnMinute:end});
    pending.set(`${run.id}:${state.teamId}`,{version:run.planVersion+1n,epoch:run.epoch,legs,starts,visitIds:stops.map(v=>BigInt(v.id)),origin:points[team.point],expires:Date.now()+config.travelRefreshSeconds*1000});
  }
  await c.reducers.publishResponsePlan({runId:run.id,fence:run.fence,epoch:run.epoch,configVersion:run.configVersion,routes,provider:provider.name,uncovered:result.unassigned.map(u=>({visitId:BigInt(u.visitId),reason:u.reason}))});
  for(const [key,value]of pending)playback.set(key,value);
  lastPlan.set(String(run.id),{epoch:run.epoch,config:run.configVersion,at:Date.now()});dirtySince.delete(String(run.id));
  console.log(`Run ${run.id}: plan committed; ${result.unassigned.length} uncovered by matrix solver`);
}
async function tick(run:ResponseRun){
  const now=elapsed(run);
  for(const state of c.db.responseTeamStates.iter()){
    if(state.runId!==run.id||!state.available)continue;
    const data=playback.get(`${run.id}:${state.teamId}`),route=[...c.db.teamRoutes.iter()].find(r=>r.runId===run.id&&r.teamId===state.teamId);
    if(!data||!route||route.version!==data.version)continue;
    const next=route.visitIds.map(id=>c.db.welfareVisits.id.find(id)).find(v=>v&&!['cancelled','completed'].includes(v.state));
    if(route.planningEpoch!==run.epoch&&next?.state!=='in_progress')continue;
    let action='move',point:Point;
    if(next?.state==='in_progress'){
      if(now<(next.startedMinute??now)+next.serviceMinutes)continue;
      action='complete';const team=c.db.routingTeams.id.find(state.teamId)!;point=team;
    }else{
      const i=next?data.visitIds.indexOf(next.id):data.legs.length-1;
      if(i<0||!data.legs[i])continue;
      const leg=data.legs[i],start=data.starts[i],fraction=leg.minutes?((now-start)/leg.minutes):1;
      point=interpolate(leg.path,fraction);
      if(!next&&now>=route.returnMinute){if(state.mode==='idle')continue;action='return';}
      else if(next&&now>=next.arrivalMinute)action='arrive';
      else if(!next){
        // Return travel uses a separate action to avoid inventing a visit.
        action='return_move';
      }
    }
    await c.reducers.advanceResponseSimulation({runId:run.id,fence:run.fence,teamId:state.teamId,routeVersion:route.version,sequence:state.tickSequence+1n,latitude:point.latitude,longitude:point.longitude,action,outcome:action==='complete'?'Simulated welfare check completed; unresolved needs remain for dispatcher review':''});
  }
}
async function loop(){if(busy||!ready||!connected)return;busy=true;try{
  for(let run of c.db.responseRuns.iter()){
    if(run.status==='reset')continue;
    if(!own(run)){
      if(Number(run.leaseUntil/1000n)>Date.now())continue;
      await c.reducers.claimRoutingLease({runId:run.id});run=c.db.responseRuns.id.find(run.id)!;
    }else if(Number(run.leaseUntil/1000n)-Date.now()<15000){await c.reducers.renewRoutingLease({runId:run.id,fence:run.fence});run=c.db.responseRuns.id.find(run.id)!;}
    const last=lastPlan.get(String(run.id)),config=configOf(run.config);
    const changed=!last||last.epoch!==run.epoch||last.config!==run.configVersion;
    const missing=[...c.db.responseTeamStates.iter()].some(s=>s.runId===run.id&&s.available&&!playback.has(`${run.id}:${s.teamId}`));
    const urgent=[...c.db.welfareVisits.iter()].some(v=>v.runId===run.id&&v.priority==='urgent'&&v.state==='pending');
    if(changed&&!dirtySince.has(String(run.id)))dirtySince.set(String(run.id),Date.now());
    const immediate=urgent||[...c.db.responseTeamStates.iter()].some(s=>s.runId===run.id&&s.mode==='holding');
    if(missing||changed&&(immediate||Date.now()-(dirtySince.get(String(run.id))??0)>=config.ordinaryReplanDebounceMs)||run.status==='running'&&last&&Date.now()-last.at>=config.travelRefreshSeconds*1000){
      if((retryAfter.get(String(run.id))??0)>Date.now())continue;
      try{await planning(run);retryAfter.delete(String(run.id));}catch(error){retryAfter.set(String(run.id),Date.now()+15000);const message=error instanceof Error&&/^Routes API (HTTP|process)/.test(error.message)?error.message:'Travel provider failed or plan superseded; retry pending';console.error(`Run ${run.id}: ${message}`);try{await c.reducers.responsePlanningFailed({runId:run.id,fence:run.fence,message});}catch{} }
    }
    run=c.db.responseRuns.id.find(run.id)!;
    if(own(run)&&run.status==='running')await tick(run);
  }
}catch{console.error('Worker update rejected or disconnected; refreshing authoritative state');}finally{busy=false;}}
const timer=setInterval(()=>void loop(),responseRoutingDefaults.simulationTickMs);
// Long provider batches must not lose their fencing lease or planning hold.
const heartbeat=setInterval(()=>{if(!ready||!connected)return;for(const run of c.db.responseRuns.iter())if(run.status!=='reset'&&own(run)&&Number(run.leaseUntil/1000n)-Date.now()<15000)void c.reducers.renewRoutingLease({runId:run.id,fence:run.fence}).catch(()=>{});},5000);
// Ephemeral geometry endpoint: loopback only, no durable Google geometry cache.
const server=createServer((req,res)=>{
  const origin=req.headers.origin;
  if(origin&&!['http://localhost:3000','http://127.0.0.1:3000'].includes(origin)){res.writeHead(403).end();return;}
  if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  const url=new URL(req.url??'/', 'http://localhost');
  if(url.pathname!=='/route'){res.writeHead(404).end();return;}
  const key=`${url.searchParams.get('run')}:${url.searchParams.get('team')}`,data=playback.get(key);
  const run=[...c.db.responseRuns.iter()].find(r=>String(r.id)===url.searchParams.get('run'));
  if(!data||!run||run.status==='reset'||data.epoch!==run.epoch||data.expires<Date.now()){res.writeHead(404).end(JSON.stringify({error:'Route unavailable or superseded'}));return;}
  res.end(JSON.stringify({version:String(data.version),provider:provider.name,paths:data.legs.map(l=>l.path)}));
});
server.listen(Number(process.env.ROUTING_WORKER_PORT??3201),'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM']as const)process.on(signal,()=>{clearInterval(timer);clearInterval(heartbeat);server.close();c.disconnect();process.exit(0);});
