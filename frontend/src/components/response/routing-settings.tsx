"use client";
import { useState } from "react";
import type { ResponseRoutingConfig } from "../../../../shared/response-routing-config";
export function RoutingSettings({config,onSave}:{config:ResponseRoutingConfig;onSave:(value:ResponseRoutingConfig)=>void}){
 const [draft,setDraft]=useState(config);
 return <form onSubmit={e=>{e.preventDefault();onSave(draft);}}><h2>Demo rules</h2>{([['visitMinutes','Visit duration (minutes)'],['shiftMinutes','Shift length (minutes)'],['simulationSpeed','Playback multiplier'],['urgentTargetMinutes','Urgent arrival target (minutes)'],['ordinaryReplanDebounceMs','Ordinary replan delay (milliseconds)']]as const).map(([key,label])=><label key={key} className="workflow-field">{label} <input type="number" min="1" required value={draft[key]} onChange={e=>setDraft({...draft,[key]:Number(e.target.value)})}/></label>)}<button type="submit">Save rules (administrator)</button><p>Saving invalidates routes. Active checks retain their original dwell duration.</p></form>;
}
