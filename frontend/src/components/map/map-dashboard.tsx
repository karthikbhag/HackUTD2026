"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { DetailPanel } from "./detail-panel";
import { hazards, type DataStatus, type Hazard, type MapData, type Phase, type Selection } from "@/lib/map/types";

// Leaflet accesses browser APIs, so load the renderer only on the client.
const DisasterMap = dynamic(() => import("./disaster-map"), { ssr: false, loading: () => <div className="map-loading" role="status">Loading interactive map…</div> });
const hazardTypes = Object.keys(hazards) as Hazard[];
/** Person 4 supplies subscription data and mounts operational controls in workflowPanel. */
export function MapDashboard({ data, status = "demo", errorMessage, workflowPanel }: { data: MapData; status?: DataStatus; errorMessage?: string; workflowPanel?: ReactNode }) {
  // These are local presentation choices; operational records arrive through data props.
  const [enabled, setEnabled] = useState<Hazard[]>(hazardTypes);
  // Phase changes guidance only. Scenario escalation remains a separate backend action.
  const [phase, setPhase] = useState<Phase>("before");
  const [selection, setSelection] = useState<Selection>(null);
  const [overviewVersion, setOverviewVersion] = useState(0);
  // Filter related markers with their zones so hidden hazards leave no orphan markers.
  const visible = useMemo(() => {
    const zones = data.zones.filter(zone => enabled.includes(zone.hazard));
    const ids = new Set(zones.map(zone => zone.id));
    return { zones, households: data.households.filter(item => ids.has(item.zoneId)), teams: data.teams.filter(item => ids.has(item.zoneId)) };
  }, [data, enabled]);
  // Hide details for filtered/deleted records without mutating selection during rendering.
  // Re-enabling a layer restores the previous selection if its record still exists.
  const effectiveSelection = selection && (selection.kind === "zone" ? visible.zones : selection.kind === "household" ? visible.households : visible.teams).some(item => item.id === selection.id) ? selection : null;
  return <main className="dashboard">
    <header className="app-header"><Link className="brand" href="/" aria-label="RiskReach home"><span className="brand-symbol" aria-hidden="true">R</span>RiskReach<span className="brand-subtitle">Catastrophe coordination</span></Link><span className={`connection ${status === "connected" ? "live" : ""}`}><span aria-hidden="true" />{status === "demo" ? "Demo data · backend pending" : status === "connected" ? "Connected" : status === "loading" ? "Connecting…" : "Connection interrupted"}</span></header>
    <div className="workspace-heading"><div><p className="eyebrow">National operations / United States</p><h1>Every household. In view.</h1><p className="muted">Explore exposure, prepare outreach, and coordinate the next response.</p></div><div className="phase-toggle" aria-label="Disaster phase"><button aria-pressed={phase === "before"} onClick={() => setPhase("before")}>Before · Prepare</button><button aria-pressed={phase === "after"} onClick={() => setPhase("after")}>After · Respond</button></div></div>
    {status === "demo" && <div className="demo-banner"><strong>Simulation workspace</strong><span>Fictional UI fixtures. No live hazard feed, customer records, or operational updates.</span></div>}
    {status === "error" && <div className="error-banner" role="alert">{errorMessage || "Unable to connect to operational data. Check the shared connection."}</div>}
    {status === "loading" && <div className="demo-banner" role="status">Loading operational data…</div>}
    <div className="workspace-grid"><aside className="layers-panel"><p className="eyebrow">Map layers</p><h2>Hazard outlook</h2><p className="muted small">Choose the hazards to display.</p><div className="hazard-filters">{hazardTypes.map(type => <label key={type}><input type="checkbox" checked={enabled.includes(type)} onChange={() => setEnabled(current => current.includes(type) ? current.filter(item => item !== type) : [...current, type])}/><span className="hazard-dot" style={{ background: hazards[type].color }}/><span>{hazards[type].label}</span><small>{data.zones.filter(zone => zone.hazard === type).length}</small></label>)}</div><div className="section-title"><h3>Visible hotspots</h3><span className="count">{visible.zones.length}</span></div><div className="hotspot-list">{visible.zones.map(zone => <button key={zone.id} aria-pressed={effectiveSelection?.kind === "zone" && effectiveSelection.id === zone.id} onClick={() => setSelection({ kind: "zone", id: zone.id })}><span className="hotspot-type" style={{ color: hazards[zone.hazard].color }}>{hazards[zone.hazard].label}</span><strong>{zone.name}</strong><span className={`severity ${zone.severity}`}>{zone.severity}</span></button>)}{!visible.zones.length && <p className="muted small">No visible hotspots. Enable another hazard layer or wait for scenario data.</p>}</div></aside>
    <section className="map-panel" aria-label="National disaster overview"><div className="map-toolbar"><div><strong>National overview</strong><span>{visible.zones.length} zones · {visible.households.length} households · {visible.teams.length} teams</span></div><button onClick={() => { setSelection(null); setOverviewVersion(value => value + 1); }}>Reset view ↗</button></div><DisasterMap data={visible} selection={effectiveSelection} onSelect={setSelection} overviewVersion={overviewVersion}/><div className="map-legend"><span><i className="household-key"/> Household</span><span><i className="team-key">+</i> Response team</span><span>Severity: dashed = moderate · thin solid = high · thick solid = critical</span></div><p className="map-hint">Select a hotspot to zoom in. Use the list to inspect overlapping zones independently.</p></section>
    <DetailPanel data={visible} selection={effectiveSelection} phase={phase} onSelect={setSelection}/></div>
    {/* Person 4 mounts queue/action controls here using the shared client connection. */}
    {workflowPanel && <section className="workflow-panel" aria-label="Operational workflow">{workflowPanel}</section>}
    <footer className="app-footer"><span>RiskReach / Employee preparedness & response</span><span>{status === "demo" ? "Synthetic scenarios · All six hazard types" : "Operational data supplied by shared integration"}</span></footer>
  </main>;
}
