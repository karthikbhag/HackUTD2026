import type { WelfareVisit, Household } from "@/module_bindings/types";
export function TeamStopList({visits,households}:{visits:WelfareVisit[];households:Household[]}){
  return <ol>{visits.map(v=><li key={String(v.id)} style={{padding:'12px 0',borderBottom:'1px solid #e2e8f0'}}><strong>{households.find(h=>h.id===v.householdId)?.displayName??`Household ${v.householdId}`}</strong> — {v.priority} · {v.state.replaceAll('_',' ')}<br/><small>Estimated arrival: run +{v.arrivalMinute.toFixed(1)} min · service {v.serviceMinutes} min</small>{v.notice&&<p role="status">{v.notice}</p>}{v.outcome&&<p>{v.outcome}</p>}</li>)}</ol>;
}
