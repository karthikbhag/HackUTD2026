/** End-to-end offline test restricted to a dedicated disposable loopback database. */
import assert from 'node:assert/strict';
import { execFile,spawn,type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { DbConnection,tables } from '../../frontend/src/module_bindings';
const database='riskreach-response-routing-check',uri='http://127.0.0.1:3100',execute=promisify(execFile);
const root=resolve(import.meta.dirname,'../..');let worker:ChildProcess|undefined,c:DbConnection|undefined,workerIdentity='';
async function call(name:string,...args:string[]){await execute('spacetime',['call',database,name,...args,'--server',uri,'--no-config']);}
async function until(check:()=>boolean,message:string,timeout=30000){const deadline=Date.now()+timeout;while(!check()){assert(Date.now()<deadline,message);await new Promise(r=>setTimeout(r,50));}}
const watchdog=setTimeout(()=>{worker?.kill();console.error('Routing verifier timed out');process.exit(1);},120000);
try{
 c=await new Promise<DbConnection>((resolve,reject)=>DbConnection.builder().withUri(uri).withDatabaseName(database).onConnect(resolve).onConnectError((_ctx,e)=>reject(e)).build());
 await call('set_employee',JSON.stringify(c.identity!.toHexString()),'true');
 await new Promise<void>((resolve,reject)=>c!.subscriptionBuilder().onApplied(()=>resolve()).onError(ctx=>reject(ctx.event)).subscribe([tables.responseRuns,tables.welfareVisits,tables.teamRoutes,tables.responseTeamStates,tables.routingHouseholds,tables.routingTeams]));
 await call('reset_demo',JSON.stringify('RESET SYNTHETIC DEMO'));
 await c.reducers.seedResponseRoutingDemo({});
 await until(()=>c!.db.responseRuns.count()>0n,'fixture not synchronized');
 const run=[...c.db.responseRuns.iter()].find(r=>r.status!=='reset')!;
 const config=JSON.parse(run.config);config.simulationSpeed=10;config.visitMinutes=1;
 await call('update_response_settings',String(run.id),JSON.stringify(JSON.stringify(config)));
 worker=spawn(process.execPath,['--env-file='+resolve(root,'frontend/.env.local'),resolve(root,'backend/.test-output/routing-worker.mjs')],{cwd:root,env:{...process.env,SPACETIMEDB_URI:uri,SPACETIMEDB_DATABASE:database,ROUTING_PROVIDER:'fixture',ROUTING_WORKER_PORT:'3202'},stdio:['ignore','pipe','pipe']});
 worker.stdout!.on('data',data=>{const match=String(data).match(/Routing worker identity: ([0-9a-f]+)/);if(match)workerIdentity=match[1];});
 worker.stderr!.on('data',data=>process.stderr.write(String(data)));
 await until(()=>!!workerIdentity,'worker identity not available');await call('set_routing_worker',JSON.stringify(workerIdentity),'true');
 await until(()=>c!.db.teamRoutes.count()===2n,'two team plans not published');
 assert.equal(c.db.routingHouseholds.count(),20n);assert.equal(c.db.routingTeams.count(),2n);
 await c.reducers.resumeResponseDemo({runId:run.id});
 await until(()=>[...c!.db.responseTeamStates.iter()].every(s=>s.positionVersion>0n),'both teams did not move');
 const safe=[...c.db.welfareVisits.iter()].find(v=>v.state==='queued'&&v.priority==='unknown')!;assert(safe);
 await call('update_check_in',String(safe.householdId),JSON.stringify('safe'));
 await until(()=>c!.db.welfareVisits.id.find(safe.id)?.state==='cancelled','queued safe not cancelled');
 await until(()=>[...c!.db.welfareVisits.iter()].some(v=>v.state==='en_route'),'no active travel');
 const current=[...c.db.welfareVisits.iter()].find(v=>v.state==='en_route')!;
 await call('update_check_in',String(current.householdId),JSON.stringify('safe'));
 await until(()=>c!.db.welfareVisits.id.find(current.id)?.state==='cancelled','current safe not cancelled');
 const urgent=[...c.db.welfareVisits.iter()].find(v=>v.priority==='unknown'&&!['completed','cancelled'].includes(v.state))!;
 const previous=[...c.db.responseRuns.iter()].find(r=>r.id===run.id)!.planVersion;
 await call('update_check_in',String(urgent.householdId),JSON.stringify('urgent'));
 await until(()=>c!.db.responseRuns.id.find(run.id)!.planVersion>previous,'urgent replan not committed');
 assert.equal(c.db.welfareVisits.id.find(urgent.id)!.priority,'urgent');
 await c.reducers.pauseResponseDemo({runId:run.id});
 const positions=[...c.db.responseTeamStates.iter()].map(s=>String(s.positionVersion));
 await new Promise(r=>setTimeout(r,1800));assert.deepEqual([...c.db.responseTeamStates.iter()].map(s=>String(s.positionVersion)),positions);
 const team=[...c.db.responseTeamStates.iter()][0];
 if(team.mode!=='in_progress')await c.reducers.setResponseTeamAvailability({runId:run.id,teamId:team.teamId,available:false});
 const response=await fetch(`http://127.0.0.1:3202/route?run=${run.id}&team=${team.teamId}`);assert([200,404].includes(response.status));
 console.log('PASS: isolated 20/two fixture; fenced persistent worker; both teams move; queued/current safe cancellation; urgent replan; pause; loopback geometry endpoint. Provider: explicitly offline.');
}finally{
 clearTimeout(watchdog);worker?.kill();
 if(workerIdentity)await call('set_routing_worker',JSON.stringify(workerIdentity),'false').catch(()=>{});
 if(c){await call('set_employee',JSON.stringify(c.identity!.toHexString()),'false').catch(()=>{});c.disconnect();}
}
