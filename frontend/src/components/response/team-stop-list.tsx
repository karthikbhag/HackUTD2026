import type { WelfareVisit, Household } from "@/module_bindings/types";
export function TeamStopList({visits,households}:{visits:WelfareVisit[];households:Household[]}){
  return <ol className="response-stop-list">{visits.map(v=><li key={String(v.id)}><strong>{households.find(h=>h.id===v.householdId)?.displayName??`Household ${v.householdId}`}</strong> — {v.priority} · {v.state.replaceAll('_',' ')}<br/><small>Estimated arrival: run +{v.arrivalMinute.toFixed(1)} min · service {v.serviceMinutes} min</small>{v.notice&&<p role="status">{v.notice}</p>}{v.outcome&&<p>{v.outcome}</p>}</li>)}</ol>;
}
