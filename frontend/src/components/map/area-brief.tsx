"use client";

import { useState } from "react";
import { hazards, displayTime, type MapData, type MapZone, type Phase } from "@/lib/map/types";
import { AiAreaReview } from "./ai-area-review";

export function AreaBrief({ data, zone, phase = "before" }: { data: MapData; zone: MapZone; phase?: Phase }) {
  const [evidence, setEvidence] = useState(false);
  const [index, setIndex] = useState(0);
  const households = data.households.filter(row => (row.hotspotId ?? row.zoneId) === zone.id && row.isCustomer);
  const exposed = data.households.filter(h=>h.riskByArea?.[zone.id] && h.riskByArea[zone.id] !== 'None');
  const layers = (data.impactLayers ?? []).filter(layer => layer.hotspotId === zone.id);
  const highest = [...layers].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];
  const currentIndex = Math.min(index, Math.max(0, layers.length - 1));
  const layer = layers[currentIndex];
  return <article className="area-brief compact-area-brief">
    <div className="panel-heading"><p className="eyebrow">{hazards[zone.hazard].label} · {zone.simulated ? "Simulation" : "Source data"}</p><span className={`severity ${zone.severity}`}>{zone.severity} severity</span></div>
    <h3>{zone.name}</h3>
    {zone.eventCenter && <p className="small">Event location: {zone.eventCenter.map(n=>n.toFixed(4)).join(', ')} · {zone.severity} severity</p>}
    {zone.radiiMeters && <dl className="brief-facts">{(['High','Medium','Low'] as const).map((band,i)=><div key={band}><dt>{band} risk · {(zone.radiiMeters![i]/1000).toFixed(1)} km</dt><dd>{exposed.filter(h=>h.riskByArea?.[zone.id]===band).length.toLocaleString()} households</dd></div>)}</dl>}
    {evidence && <section className="compact-evidence" aria-label="Area evidence">
      <h4>Evidence & source</h4><p>{zone.source}<br/>{displayTime(zone.updatedAt)}</p>
      {layer ? <><strong>{layer.label} · {layer.severity}</strong><p>{layer.severityBasis}</p><p>{layer.limitations}</p><small>{layer.source} · {displayTime(layer.updatedAt)}</small></> : <p>No explicit hazard footprints supplied. Context boundaries do not establish exposure.</p>}
      {layers.length > 1 && <div className="brief-page-controls"><button disabled={currentIndex === 0} onClick={() => setIndex(currentIndex - 1)}>Previous</button><span>Shape {currentIndex + 1} of {layers.length}</span><button disabled={currentIndex + 1 >= layers.length} onClick={() => setIndex(currentIndex + 1)}>Next</button></div>}
    </section>}
    {/* Kept mounted while viewing evidence so a generated AI review is not lost. */}
    <div className="brief-summary" hidden={evidence}>
      <p className="brief-lead">{highest ? `Highest supplied impact: ${highest.severity} · ${highest.label}.` : 'No explicit footprint supplied. Context boundaries do not establish exposure.'}</p>
      <AiAreaReview data={data} zone={zone} phase={phase}/>
      <dl className="brief-facts"><div><dt>Impact shapes</dt><dd>{layers.length} supplied</dd></div><div><dt>Outreach context</dt><dd>{households.length.toLocaleString()} customers</dd></div></dl>
      <p className="muted small">Risk counts use modeled distance bands. None means outside the outer circle. Outreach excludes confirmed-safe households.</p>
    </div>
    <button className="text-button brief-evidence-toggle" onClick={() => setEvidence(value => !value)}>{evidence ? "← Back to summary" : "Evidence & source →"}</button>
  </article>;
}
function severityRank(severity: string) { return severity === "critical" || severity === "extreme" ? 3 : severity === "high" ? 2 : 1; }
