/** Directional durations in simulated minutes. Missing edges are unreachable. */
export type Matrix = ReadonlyArray<ReadonlyArray<number | null>>;
export interface Visit { id: string; point: number; urgent: boolean; eligibleSince: number; serviceMinutes?: number; previousTeamId?: string }
export interface Team { id: string; point: number; remainingMinutes: number; fixed?: Visit[] }
export interface Route { teamId: string; visits: Visit[]; minutes: number }
export interface SolverOptions { now?: number; urgentTargetMinutes?: number; timeBudgetMs?: number }
export function solve(visits: Visit[], teams: Team[], matrix: Matrix, staging: number, serviceMinutes: number, options: SolverOptions = {}) {
  if (!Number.isFinite(serviceMinutes) || serviceMinutes <= 0) throw new Error('Invalid service duration');
  const now=options.now??0, target=options.urgentTargetMinutes??30, deadline=Date.now()+(options.timeBudgetMs??250);
  const edge = (a: number,b: number) => { const value=matrix[a]?.[b]; return value!=null && Number.isFinite(value) && value>=0 ? value : Infinity; };
  const duration = (team: Team, stops: Visit[]) => {
    let total=0, point=team.point;
    for (const stop of stops) { total+=edge(point,stop.point)+(stop.serviceMinutes??serviceMinutes); point=stop.point; }
    return total+edge(point,staging);
  };
  const fixedIds=new Set(teams.flatMap(t=>(t.fixed??[]).map(v=>v.id)));
  if (new Set(visits.map(v=>v.id)).size!==visits.length) throw new Error('Duplicate visit');
  const routes: Route[]=teams.map(t=>({teamId:t.id,visits:[...(t.fixed??[])],minutes:duration(t,t.fixed??[])}));
  const metric=(rs: Route[])=> {
    let urgent=0,misses=0,wait=0,unknown=0,travel=0,churn=0;
    rs.forEach((r,ti)=>{let time=0,point=teams[ti].point; for(const v of r.visits){churn+=Number(v.previousTeamId!==undefined&&v.previousTeamId!==r.teamId);time+=edge(point,v.point);if(v.urgent){urgent++;const age=Math.max(0,now+time-v.eligibleSince);misses+=Number(age>target);wait+=age;}else unknown++;time+=v.serviceMinutes??serviceMinutes;point=v.point;}travel+=r.minutes;});
    return [-urgent,misses,wait,-unknown,churn,travel];
  };
  const less=(a:number[],b:number[])=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]<b[i];return false;};
  const validOrder=(stops:Visit[],ti:number)=>{let unknown=false;for(const v of stops.slice(teams[ti].fixed?.length??0)){if(unknown&&v.urgent)return false;unknown ||= !v.urgent;}return true;};
  const unassigned: {visitId:string;reason:string}[]=[];
  const pending=[...visits].filter(v=>!fixedIds.has(v.id)).sort((a,b)=>Number(b.urgent)-Number(a.urgent)||a.eligibleSince-b.eligibleSince||a.id.localeCompare(b.id));
  while(pending.length){
    let next=0;
    if(!pending[0].urgent){
      let cheapest=Infinity;
      pending.forEach((v,index)=>routes.forEach((route,ti)=>{
        for(let at=teams[ti].fixed?.length??0;at<=route.visits.length;at++){
          const stops=[...route.visits];stops.splice(at,0,v);if(!validOrder(stops,ti))continue;
          const minutes=duration(teams[ti],stops),delta=minutes-route.minutes;
          if(minutes<=teams[ti].remainingMinutes&&delta<cheapest){cheapest=delta;next=index;}
        }
      }));
    }
    const [visit]=pending.splice(next,1);
    let best: Route[]|undefined, score:number[]|undefined;
    routes.forEach((route,ti)=>{for(let at=teams[ti].fixed?.length??0;at<=route.visits.length;at++){
      const stops=[...route.visits];stops.splice(at,0,visit);if(!validOrder(stops,ti))continue;
      const minutes=duration(teams[ti],stops);if(minutes>teams[ti].remainingMinutes)continue;
      const candidate=routes.map((r,i)=>i===ti?{...r,visits:stops,minutes}:r), value=metric(candidate);
      if(!score||less(value,score)){best=candidate;score=value;}
    }});
    if(best) routes.splice(0,routes.length,...best);
    else unassigned.push({visitId:visit.id,reason:!teams.length?'no eligible team':teams.every(t=>!Number.isFinite(edge(t.point,visit.point))||!Number.isFinite(edge(visit.point,staging)))?'unreachable':'insufficient remaining time'});
  }
  // Bounded intra-route reversal and cross-team relocation; fixed work never moves.
  let improved=true;
  while(improved&&Date.now()<deadline){improved=false;const old=metric(routes);
    outer:for(let ti=0;ti<routes.length;ti++)for(let i=teams[ti].fixed?.length??0;i<routes[ti].visits.length;i++)for(let tj=0;tj<routes.length;tj++)for(let j=teams[tj].fixed?.length??0;j<=routes[tj].visits.length;j++){
      if(Date.now()>=deadline)break outer;
      const candidate=routes.map(r=>({...r,visits:[...r.visits]}));
      if(ti===tj){if(j<=i+1)continue;candidate[ti].visits.splice(i,j-i,...candidate[ti].visits.slice(i,j).reverse());}
      else {const [v]=candidate[ti].visits.splice(i,1);candidate[tj].visits.splice(j,0,v);}
      let feasible=true;candidate.forEach((r,k)=>{r.minutes=duration(teams[k],r.visits);if(r.minutes>teams[k].remainingMinutes||!validOrder(r.visits,k))feasible=false;});
      if(feasible&&less(metric(candidate),old)){routes.splice(0,routes.length,...candidate);improved=true;break outer;}
    }
  }
  // Cross-team swaps can improve a plan where neither relocation is feasible.
  swap:for(let a=0;a<routes.length;a++)for(let b=a+1;b<routes.length;b++)for(let i=teams[a].fixed?.length??0;i<routes[a].visits.length;i++)for(let j=teams[b].fixed?.length??0;j<routes[b].visits.length;j++){
    if(Date.now()>=deadline)break swap;
    const candidate=routes.map(r=>({...r,visits:[...r.visits]}));
    [candidate[a].visits[i],candidate[b].visits[j]]=[candidate[b].visits[j],candidate[a].visits[i]];
    candidate[a].minutes=duration(teams[a],candidate[a].visits);candidate[b].minutes=duration(teams[b],candidate[b].visits);
    if(candidate[a].minutes<=teams[a].remainingMinutes&&candidate[b].minutes<=teams[b].remainingMinutes&&validOrder(candidate[a].visits,a)&&validOrder(candidate[b].visits,b)&&less(metric(candidate),metric(routes)))routes.splice(0,routes.length,...candidate);
  }
  return {routes,unassigned};
}
