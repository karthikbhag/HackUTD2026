import type { ResponseRun } from "@/module_bindings/types";
export function SimulationControls({run,onPause,onResume,onReset,busy}:{run:ResponseRun;onPause:()=>void;onResume:()=>void;onReset:()=>void;busy:boolean}){
 return <div className="response-simulation"><button disabled={busy||run.status!=='paused'} onClick={onResume}>Resume simulation</button><button disabled={busy||run.status!=='running'} onClick={onPause}>Pause</button><button disabled={busy} onClick={onReset}>Reset isolated run</button><span>Simulation: {run.status} · plan {String(run.planVersion)} · config {run.configVersion}</span></div>;
}
