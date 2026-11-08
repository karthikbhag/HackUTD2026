import { describe,it,expect,vi,afterEach } from 'vitest';
import { GoogleTravelProvider, decodePolyline, interpolate } from '../../routing-worker/src/travel-provider';
import { solve } from '../../routing-worker/src/solver';
afterEach(()=>vi.unstubAllGlobals());
describe('routing provider and movement',()=>{
 it('decodes and follows intermediate road vertices',()=>{
  const path=decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  expect(path).toEqual([{latitude:38.5,longitude:-120.2},{latitude:40.7,longitude:-120.95},{latitude:43.252,longitude:-126.453}]);
  expect(interpolate(path,0)).toEqual(path[0]);expect(interpolate(path,1)).toEqual(path[2]);
  expect(interpolate([{latitude:0,longitude:0},{latitude:0,longitude:1},{latitude:1,longitude:1}],.5).longitude).toBeCloseTo(1);
 });
 it('keeps per-element failures unreachable and uses narrow field masks',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify([{originIndex:0,destinationIndex:0,condition:'ROUTE_EXISTS',duration:'0s'},{originIndex:0,destinationIndex:1,status:{code:5},condition:'ROUTE_NOT_FOUND'}])));vi.stubGlobal('fetch',request);
  const provider=new GoogleTravelProvider('test-key',0,'matrix'),points=[{latitude:32,longitude:-96},{latitude:33,longitude:-96}];
  const matrix=await provider.matrix(points,'2026-01-01T00:00:00Z');expect(matrix).toEqual([[0,null],[null,null]]);
  const options=request.mock.calls[0][1];expect(options.headers['X-Goog-FieldMask']).toContain('status');expect(JSON.parse(options.body).routingPreference).toBe('TRAFFIC_AWARE');
 });
 it('fails closed on provider errors without silently using offline travel',async()=>{
  const request=vi.fn().mockResolvedValue(new Response('{}',{status:403}));vi.stubGlobal('fetch',request);
  await expect(new GoogleTravelProvider('test-key',0,'matrix').matrix([{latitude:32,longitude:-96}],new Date().toISOString())).rejects.toThrow('HTTP 403');expect(request).toHaveBeenCalledTimes(1);
 });
 it('does not let provider reorder priority stops',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({routes:[{legs:[{duration:'60s',distanceMeters:100,polyline:{encodedPolyline:'_p~iF~ps|U_ulLnnqC'}}]}]})));vi.stubGlobal('fetch',request);
  await new GoogleTravelProvider('test-key').directions({latitude:32,longitude:-96},[],{latitude:32.1,longitude:-96});
  expect(JSON.parse(request.mock.calls[0][1].body).optimizeWaypointOrder).toBe(false);
 });
});
describe('priority heuristic reference cases',()=>{
 it('matches exact enumeration on a small urgent tour',()=>{
  const matrix=[[0,2,8,4],[2,0,3,5],[8,3,0,2],[4,5,2,0]],visits=[1,2,3].map(point=>({id:String(point),point,urgent:true,eligibleSince:0}));
  const permutations=(xs:number[]):number[][]=>xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>i!==j)).map(rest=>[x,...rest])):[[]];
  const objective=(order:number[])=>{let time=0,wait=0,point=0;for(const next of order){time+=matrix[point][next];wait+=time;time+=5;point=next;}return wait;};
  const result=solve(visits,[{id:'t',point:0,remainingMinutes:120}],matrix,0,5);
  expect(objective(result.routes[0].visits.map(v=>v.point))).toBe(Math.min(...permutations([1,2,3]).map(objective)));
 });
 it('pins active work and accounts for residual service',()=>{
  const pinned={id:'active',point:0,urgent:false,eligibleSince:0,serviceMinutes:2};
  const result=solve([pinned,{id:'urgent',point:1,urgent:true,eligibleSince:0}],[{id:'t',point:0,remainingMinutes:12,fixed:[pinned]}],[[0,2],[2,0]],0,5);
  expect(result.routes[0].visits.map(v=>v.id)).toEqual(['active','urgent']);expect(result.routes[0].minutes).toBe(11);
 });
});
import fixture from '../../data/scenarios/response-routing-demo.json';
import { FixtureTravelProvider } from '../../routing-worker/src/travel-provider';
it('compares the two-team fixture with nearest-next routing',async()=>{
 const points=[fixture.staging,...fixture.households.filter(h=>h.status!=='safe')],matrix=await new FixtureTravelProvider().matrix(points),visits=points.slice(1).map((_,i)=>({id:String(i+1),point:i+1,urgent:i<3,eligibleSince:0}));
 const result=solve(visits,[{id:'a',point:0,remainingMinutes:120},{id:'b',point:0,remainingMinutes:120}],matrix,0,5);
 const pending=[...visits],baseline=[{point:0,time:0,visits:[]as typeof visits},{point:0,time:0,visits:[]as typeof visits}];
 while(pending.length){const team=[...baseline].sort((a,b)=>a.time-b.time)[0];const next=[...pending].sort((a,b)=>matrix[team.point][a.point]-matrix[team.point][b.point])[0];team.time+=matrix[team.point][next.point]+5;team.point=next.point;team.visits.push(next);pending.splice(pending.indexOf(next),1);}
 const stats=(routes:{visits:typeof visits}[])=>{let urgentWait=0,travel=0;for(const r of routes){let time=0,point=0;for(const v of r.visits){const leg=matrix[point][v.point];travel+=leg;time+=leg;if(v.urgent)urgentWait+=time;time+=5;point=v.point;}travel+=matrix[point][0];}return {coverage:routes.reduce((n,r)=>n+r.visits.length,0),urgentWait,travel};};
 const optimized=stats(result.routes),nearest=stats(baseline);
 expect(optimized.coverage).toBe(17);expect(optimized.urgentWait).toBeLessThanOrEqual(nearest.urgentWait);expect(result.routes.every(r=>r.minutes<=120)).toBe(true);
 console.log('Offline fixture comparison',JSON.stringify({heuristic:optimized,nearestNext:nearest}));
});
it('reports the safe billing reason from matrix error arrays',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify([{error:{details:[{reason:'BILLING_DISABLED'}]}}]),{status:403})));
 await expect(new GoogleTravelProvider('test-key',0,'matrix').matrix([{latitude:32,longitude:-96}],new Date().toISOString())).rejects.toThrow('BILLING_DISABLED');
});
it('builds a directional matrix using only demo-supported Compute Routes legs',async()=>{
 const request=vi.fn(async(_url:string,options:{body:string})=>{
  const body=JSON.parse(options.body),chain=[body.origin,...body.intermediates,body.destination].map(p=>p.location.latLng);
  return new Response(JSON.stringify({routes:[{legs:chain.slice(1).map((p:{latitude:number},i:number)=>({duration:`${Math.abs(p.latitude-chain[i].latitude)*60+(p.latitude>chain[i].latitude?60:120)}s`}))}]}));
 });vi.stubGlobal('fetch',request);
 const matrix=await new GoogleTravelProvider('test-key',0).matrix([{latitude:0,longitude:0},{latitude:1,longitude:0},{latitude:0,longitude:0}],new Date().toISOString());
 expect(matrix).toEqual([[0,2,0],[3,0,3],[0,2,0]]);
 expect(request).toHaveBeenCalledTimes(1);expect(request.mock.calls[0][0]).toContain('directions/v2:computeRoutes');
});
it('strips household metadata and bigint IDs before Google requests',async()=>{
 const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({routes:[{legs:[{duration:'60s',polyline:{encodedPolyline:'_p~iF~ps|U_ulLnnqC'},distanceMeters:100}]}]})));vi.stubGlobal('fetch',request);
 const household={id:1n,displayName:'Fictional',latitude:32,longitude:-96};
 await new GoogleTravelProvider('test-key',0).directions(household,[],{latitude:32.1,longitude:-96});
 const body=JSON.parse(request.mock.calls[0][1].body);expect(body.origin.location.latLng).toEqual({latitude:32,longitude:-96});
});
