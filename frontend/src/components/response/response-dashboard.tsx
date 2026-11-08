"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { ResponseShell } from "./response-shell";
import { useMemo, useState } from "react";
import { useOperationalConnection } from "@/lib/response/use-operational-connection";
import { validateResponseRoutingConfig } from "../../../../shared/response-routing-config";
import { TeamRouteMap } from "./team-route-map";
import { TeamStopList } from "./team-stop-list";
import { RoutingSettings } from "./routing-settings";
import { SimulationControls } from "./simulation-controls";
export function ResponseDashboard({uri,database,browserKey,workerUrl}:{uri:string;database:string;browserKey:string;workerUrl:string}){
 const router=useRouter();
 const {conn,snapshot:s}=useOperationalConnection(uri,database,false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const params=useSearchParams(), requested=params.get('run')??'', requestedTeam=params.get('team')??'';
 const run=s.runs.find(r=>String(r.id)===requested&&r.status!=='reset'),states=s.teamStates.filter(t=>t.runId===run?.id),teamId=requestedTeam ? (states.some(t=>String(t.teamId)===requestedTeam)?requestedTeam:'') : String(states[0]?.teamId??'');
 const state=states.find(t=>String(t.teamId)===teamId),team=s.teams.find(t=>String(t.id)===teamId),route=s.routes.find(r=>r.runId===run?.id&&String(r.teamId)===teamId);
 const visits=s.visits.filter(v=>v.runId===run?.id),ordered=(route?.visitIds??[]).flatMap(id=>{const v=visits.find(v=>v.id===id);return v?[v]:[];});
 const stops=useMemo(()=>s.visits.filter(v=>v.runId===run?.id&&String(v.teamId)===teamId&&!['completed','cancelled'].includes(v.state)).sort((a,b)=>a.sequence-b.sequence).flatMap(v=>{const h=s.households.find(h=>h.id===v.householdId);return h?[h]:[];}),[s.visits,s.households,run,teamId]);
 const act=async(work:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');try{await work();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const safe=visits.find(v=>v.state==='queued'&&v.priority==='unknown'),current=visits.find(v=>v.id===state?.currentVisitId&&v.state==='en_route'),unknown=visits.find(v=>v.priority==='unknown'&&!['completed','cancelled'].includes(v.state));
 const invalidTeam=!!requestedTeam&&!states.some(t=>String(t.teamId)===requestedTeam);
 const config=run?validateResponseRoutingConfig(JSON.parse(run.config)):undefined;
 return <ResponseShell status={s.status}>
 <div className="response-content">
 <label>Area response run<select value={requested} onChange={e=>router.push(`/response?run=${e.target.value}`)}><option value="">Choose a run</option>{s.runs.filter(r=>r.status!=="reset").map(r=><option key={String(r.id)} value={String(r.id)}>{s.zones.find(z=>z.id===r.zoneId)?.name??`Area ${r.zoneId}`} · Scenario {String(r.scenarioRunId)} · {r.status}</option>)}</select></label>
 {requested&&!run&&s.status==="connected"&&<p role="alert">Requested run is unavailable or reset. Select an authorized active run.</p>}
 {run&&<h2>{s.zones.find(z=>z.id===run.zoneId)?.name??`Area ${run.zoneId}`} · Scenario {String(run.scenarioRunId)}</h2>}
 {run&&<a href={`/?area=${run.zoneId}`}>Return to area dispatcher</a>}
 <details className="response-identity"><summary>Connection details</summary><p>Identity: <code>{s.identity??'connecting'}</code></p></details>
 {s.routingError&&<p role="alert">{s.routingError}</p>}
 {(error||s.errorMessage)&&<p className="error-banner" role="alert">{error||s.errorMessage}</p>}

 {!run?<section className="workflow response-empty"><p className="eyebrow">Ready when you are</p><h2>Start a response exercise</h2><p>Select an area run above, or return to the dispatcher to approve welfare routing. Enroll this browser identity before starting the isolated fixture. The persistent routing worker must also be running and enrolled.</p><details><summary>Isolated exercise fixture</summary>{s.runs.some(r=>r.status!=="reset")&&<p role="status">A routing run already exists. Choose it in “Area response run” above to continue. To replace it with the Dallas fixture, open the existing run and release/reset it first.</p>}<button disabled={s.runs.some(r=>r.status!=="reset")||!conn||busy||s.status!=='connected'} onClick={()=>void act(()=>conn!.reducers.seedResponseRoutingDemo({}))}>Start Dallas routing fixture</button></details></section>:<>
 {invalidTeam&&<p role="alert">Requested team does not belong to this run. Choose a team below.</p>}
 <SimulationControls run={run} busy={busy} onPause={()=>void act(()=>conn!.reducers.pauseResponseDemo({runId:run.id}))} onResume={()=>void act(()=>conn!.reducers.resumeResponseDemo({runId:run.id}))} onReset={()=>void act(()=>conn!.reducers.resetResponseDemo({runId:run.id}))}/>
 <p className="queue-summary">{visits.filter(v=>v.priority==='urgent'&&!['completed','cancelled'].includes(v.state)).length} urgent · {visits.filter(v=>v.priority==='unknown'&&!['completed','cancelled'].includes(v.state)).length} unknown · {visits.filter(v=>v.state==='completed').length} completed</p>
 <label className="workflow-field">Selected simulated team <select value={teamId} onChange={e=>{router.replace(`/response?run=${run.id}&team=${e.target.value}`);}}><option value="" disabled>Choose a team</option>{states.map(t=><option key={String(t.teamId)} value={String(t.teamId)}>{s.teams.find(team=>team.id===t.teamId)?.name??String(t.teamId)}</option>)}</select></label>
 <p>{state?.mode} · last simulated location {state?.updatedAt.toDate().toLocaleTimeString()??'pending'} · {route?.provider??'waiting for worker'} · {route?.status??'unplanned'}</p>{route?.error&&<p role="status">{route.error}</p>}{run.planningError&&<p role="status">{run.planningError}</p>}{!run.leaseOwner&&<p>Waiting for an enrolled routing worker. Start it using the shared workflow instructions.</p>}
 {visits.filter(v=>v.notice).map(v=><p role="status" key={String(v.id)}>{s.households.find(h=>h.id===v.householdId)?.displayName??`Visit ${v.id}`}: {v.notice}</p>)}
 <div className="response-grid"><section className="workflow response-route-panel"><div><p className="eyebrow">Team operations</p><h2>Route & welfare checks</h2></div><TeamRouteMap browserKey={browserKey} workerUrl={workerUrl} runId={String(run.id)} teamId={teamId} version={String(route?.version??0)} epoch={String(run.epoch)} team={team} stops={stops}/><h2>Ordered stops</h2><TeamStopList visits={ordered} households={s.households}/><h2>Unassigned checks</h2>{visits.filter(v=>v.state==='pending').map(v=><p key={String(v.id)}>{s.households.find(h=>h.id===v.householdId)?.displayName}: {v.notice||'Awaiting planning'}</p>)}</section>
 <aside className="workflow response-settings">{config&&<RoutingSettings key={`${run.id}:${run.configVersion}`} config={config} onSave={value=>void act(async()=>{validateResponseRoutingConfig(value);await conn!.reducers.updateResponseSettings({runId:run.id,config:JSON.stringify(value)});})}/>}<h2>Scenario actions</h2><p>These record explicitly simulated replies; assistance requests remain separate.</p><button disabled={busy||!safe} onClick={()=>void act(()=>conn!.reducers.updateCheckIn({householdId:safe!.householdId,status:'safe'}))}>Report queued household safe</button>{' '}<button disabled={busy||!current} onClick={()=>void act(()=>conn!.reducers.updateCheckIn({householdId:current!.householdId,status:'safe'}))}>Report current destination safe</button>{' '}<button disabled={busy||!unknown} onClick={()=>void act(()=>conn!.reducers.updateCheckIn({householdId:unknown!.householdId,status:'urgent'}))}>Escalate unknown household</button>{' '}<button disabled={busy||!state} onClick={()=>void act(()=>conn!.reducers.setResponseTeamAvailability({runId:run.id,teamId:state!.teamId,available:!state!.available}))}>{state?.available?'Make team unavailable':'Restore team'}</button></aside></div></>}
 </div></ResponseShell>;
}
