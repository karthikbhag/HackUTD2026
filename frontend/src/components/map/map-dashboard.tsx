"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { filterHazards, householdCounts, PAGE_SIZE } from "@/lib/map/presentation";
import { DetailPanel } from "./detail-panel";
import { DashboardIcon } from "./dashboard-icon";
import { ScenarioWorkspace } from "./scenario-workspace";
import { hazards, type DataStatus, type Hazard, type MapData, type MapZone, type Phase, type Selection } from "@/lib/map/types";

// Leaflet accesses browser APIs, so load the renderer only on the client.
const DisasterMap = dynamic(() => import("./disaster-map"), { ssr: false, loading: () => <div className="map-loading" role="status">Loading interactive map…</div> });
type View = "overview" | "households" | "teams" | "preparation";
const hazardTypes = Object.keys(hazards) as Hazard[];
/** Person 4 supplies subscription data and mounts operational controls in workflowPanel. */
export function MapDashboard({ data, status = "demo", errorMessage, workflowPanel, renderWorkspace }: { data: MapData; status?: DataStatus; errorMessage?: string; workflowPanel?: ReactNode;
  renderWorkspace?: (data: MapData, zone: MapZone, selection: Selection, onSelect: (selection: Selection) => void) => ReactNode }) {
  // These are local presentation choices; operational records arrive through data props.
  const [browsePage, setBrowsePage] = useState(0);
  const [view, setView] = useState<View>("overview");
  const [enabled, setEnabled] = useState<Hazard[]>(hazardTypes);
  // Phase changes guidance only. Scenario escalation remains a separate backend action.
  const [phase, setPhase] = useState<Phase>("before");
  const [selection, setSelection] = useState<Selection>(null);
  const [overviewVersion, setOverviewVersion] = useState(0);
  // Filter related markers with their zones so hidden hazards leave no orphan markers.
  const visible = useMemo(() => filterHazards(data, enabled), [data, enabled]);
  const counts = useMemo(() => householdCounts(data.households), [data.households]);
  const hotspotCounts = useMemo(() => {
    const result = new Map<string, number>();
    for (const row of visible.households) { const id = row.hotspotId ?? row.zoneId; result.set(id, (result.get(id) ?? 0) + 1); }
    return result;
  }, [visible.households]);
  // Hide details for filtered/deleted records without mutating selection during rendering.
  // Re-enabling a layer restores the previous selection if its record still exists.
  const effectiveSelection = selection && (selection.kind === "zone" ? visible.zones : selection.kind === "household" ? visible.households : visible.teams).some(item => item.id === selection.id) ? selection : null;
  const selectedHotspot = effectiveSelection?.kind === "zone" ? effectiveSelection.id
    : effectiveSelection?.kind === "household" ? visible.households.find(row => row.id === effectiveSelection.id)
    : effectiveSelection?.kind === "team" ? visible.teams.find(row => row.id === effectiveSelection.id) : undefined;
  const detailKey = typeof selectedHotspot === "string" ? selectedHotspot : selectedHotspot?.hotspotId ?? selectedHotspot?.zoneId ?? "none";
  const reviewZone = visible.zones.find(zone => zone.id === detailKey) ?? [...visible.zones].sort((a, b) => ({ critical: 3, high: 2, moderate: 1 }[b.severity] - { critical: 3, high: 2, moderate: 1 }[a.severity]))[0];
  const followUps = useMemo(() => visible.households.filter(item => item.checkIn !== "safe" || item.needs.length > 0), [visible.households]);
  const availableTeams = visible.teams.filter(item => item.status === "available");
  // This is a status-based review list, not the pending backend priority score.
  const reviewHouseholds = useMemo(() => {
    const reviewOrder = { urgent: 0, needs_help: 1, unknown: 2, safe: 3 };
    return [...followUps].sort((a, b) => reviewOrder[a.checkIn] - reviewOrder[b.checkIn]).slice(0, 3);
  }, [followUps]);
  const browseCount = view === "teams" ? visible.teams.length : visible.households.length;
  const currentPage = Math.min(browsePage, Math.max(0, Math.ceil(browseCount / PAGE_SIZE) - 1));
  const pageStart = currentPage * PAGE_SIZE;
  function openView(next: View) {
    setView(next);
    setBrowsePage(0);
    setSelection(null);
    document.getElementById("review-panel")?.focus({ preventScroll: true });
    document.getElementById("review-panel")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest" });
  }
  const tabs: { view: View; label: string }[] = [
    { view: "overview", label: "Overview" }, { view: "households", label: "Households" },
    { view: "teams", label: "Teams" }, { view: "preparation", label: "Preparedness" },
  ];
  return <main className="dashboard">
    <div className="utility-bar"><span>HackUTD prototype · <Link href={status === "demo" ? "/" : "/demo"}>{status === "demo" ? "Main dashboard" : "Try scenario demo"}</Link></span><span className={`connection ${status === "connected" ? "live" : ""}`} role="status"><span aria-hidden="true" />{status === "demo" ? "Simulation data" : status === "connected" ? "Connected" : status === "loading" ? "Connecting…" : "Connection interrupted"}</span></div>
    <header className="app-header">
      <Link className="brand" href="/" aria-label="RiskReach home"><span className="statefarm-wordmark">State Farm<span className="wordmark-dot">®</span></span><span className="product-name">RiskReach</span></Link>
      <nav className="main-nav" aria-label="Workspace">{tabs.map(tab => <button key={tab.view} aria-current={view === tab.view ? "page" : undefined} onClick={() => openView(tab.view)}>{tab.label}</button>)}</nav>
      <span className="employee-label"><DashboardIcon kind="teams" />Employee workspace</span>
    </header>
    <div className="workspace-heading"><p className="eyebrow">State Farm · Preparedness & response</p><h1>Help starts before the storm.</h1><p className="muted">Understand the impact. Check on your people. Coordinate the next step.</p><div className="phase-toggle" aria-label="Guidance view"><button aria-pressed={phase === "before"} onClick={() => setPhase("before")}>Before · Prepare</button><button aria-pressed={phase === "after"} onClick={() => setPhase("after")}>After · Respond</button></div></div>
    {status === "error" && <div className="error-banner" role="alert">{errorMessage || "Unable to connect to operational data. Check the shared connection."}</div>}
    {status === "loading" && <div className="demo-banner" role="status">Loading operational data…</div>}
    <div className="scenario-intro"><span><strong>One area. Every step.</strong> Review a hazard, rehearse outreach, then skip ahead to check-ins and response.</span><a href="#scenario-desk">Open scenario desk <span aria-hidden="true">↓</span></a></div>
    <section className="summary-metrics" aria-label="Visible scenario summary">
      <div className="metric"><DashboardIcon kind="home" /><strong>{visible.households.length.toLocaleString()}</strong><div><span>Households in visible hotspots</span><button onClick={() => openView("households")}>View households <span aria-hidden="true">→</span></button></div></div>
      <div className="metric"><DashboardIcon kind="phone" /><strong>{followUps.length.toLocaleString()}</strong><div><span>Households to review</span><button onClick={() => openView("overview")}>See follow-ups <span aria-hidden="true">→</span></button></div></div>
      <div className="metric"><DashboardIcon kind="teams" /><strong>{availableTeams.length.toLocaleString()}</strong><div><span>Teams available</span><button onClick={() => openView("teams")}>View teams <span aria-hidden="true">→</span></button></div></div>
    </section>
    <div className="workspace-grid">
      <section className="map-panel" aria-label="National disaster overview">
        <div className="outlook-heading"><h2>Your national outlook</h2><span className="scenario-label">{status === "demo" ? "Simulation · Fictional multi-hazard scenarios" : "Source and timing available in area details"}</span></div>
        <div className="hazard-filters" role="group" aria-label="Hazard layers">{hazardTypes.map(type => <label key={type}><input type="checkbox" checked={enabled.includes(type)} onChange={() => setEnabled(current => current.includes(type) ? current.filter(item => item !== type) : [...current, type])}/><span className="hazard-dot" style={{ background: hazards[type].color }}/><span>{hazards[type].label}</span></label>)}</div>
        <div className="map-toolbar"><span>{counts.total.toLocaleString()} dataset households ({counts.neighborhood.toLocaleString()} neighborhood / {counts.regional.toLocaleString()} regional)<br/>{visible.zones.length} filtered hotspots · {visible.households.length.toLocaleString()} matching households · {visible.teams.length.toLocaleString()} teams</span><button onClick={() => { setSelection(null); setOverviewVersion(value => value + 1); }}>Reset view <span aria-hidden="true">↗</span></button></div>
        <DisasterMap data={visible} selection={effectiveSelection} onSelect={setSelection} overviewVersion={overviewVersion}/>
        <div className="map-legend"><span><i className="household-key"/> Household</span><span><i className="team-key">+</i> Response team</span><span>Dashed = geographic context · Filled = hazard footprints</span><span><i className="area-info-key">i</i> Area review</span><span>Heavier outlines = higher severity</span></div>
        <p className="map-hint">Numbered circles count household locations. Click a cluster to expand it, or select a hotspot to inspect neighborhood and regional records. Counts represent geographic membership, not hazard exposure.</p>
        <details className="hotspot-picker"><summary>Explore visible hotspots <span className="count">{visible.zones.length}</span></summary><div className="hotspot-list">{[...visible.zones].sort((a, b) => ({ critical: 3, high: 2, moderate: 1 }[b.severity] - { critical: 3, high: 2, moderate: 1 }[a.severity])).map(zone => <button key={zone.id} aria-pressed={effectiveSelection?.kind === "zone" && effectiveSelection.id === zone.id} onClick={() => setSelection({ kind: "zone", id: zone.id })}><span className="hotspot-type" style={{ color: hazards[zone.hazard].color }}>{hazards[zone.hazard].label}</span><strong>{zone.name}</strong><span className={`severity ${zone.severity}`}>{zone.severity} severity</span><span className="hotspot-membership">{(hotspotCounts.get(zone.id) ?? 0).toLocaleString()} households · geographic context</span></button>)}{!visible.zones.length && <p className="muted small">No visible hotspots. Enable a hazard layer or wait for scenario data.</p>}</div></details>
      </section>
      <div id="review-panel" className="review-panel" tabIndex={-1}>
        {effectiveSelection ? <DetailPanel key={detailKey} data={visible} selection={effectiveSelection} phase={phase} onSelect={setSelection}/> : <aside className="review-content" aria-label="Household and team review">
          <p className="eyebrow">{view === "teams" ? "Response resources" : view === "preparation" ? "Area guidance" : "Household outreach"}</p>
          <h2>{view === "overview" ? "Who needs you next?" : view === "households" ? "Every household counts." : view === "teams" ? "Ready to lend a hand." : phase === "before" ? "A little preparation. A big difference." : "Coordinate the next response."}</h2>
          <p className="muted panel-subtitle">{view === "overview" ? "Review by check-in status · Visible hotspots" : view === "households" ? "All households in your visible hotspots" : view === "teams" ? "Availability and capabilities at a glance" : "Select a hotspot to review its guidance."}</p>
          {(view === "overview" || view === "households") && <>
            <div className="review-list">{(view === "overview" ? reviewHouseholds : visible.households.slice(pageStart, pageStart + PAGE_SIZE)).map(item => <button className="review-row" key={item.id} onClick={() => setSelection({ kind: "household", id: item.id })}><DashboardIcon kind="home" /><span className="review-row-copy"><strong>{item.name}</strong><small>{item.needs.join(" · ") || (item.lastContactAt ? "View contact and household details" : "No contact recorded")}</small></span><span className={`check-in ${item.checkIn}`}>{item.checkIn.replaceAll("_", " ")}</span></button>)}{!(view === "overview" ? reviewHouseholds : visible.households).length && <p className="empty-state">{visible.households.length ? "No households currently need review." : "No households in the visible zones."}</p>}</div>
            {view === "overview" && <><button className="primary-button" onClick={() => openView("households")}>Review all households</button><button className="secondary-link" onClick={() => openView("preparation")}>{phase === "before" ? "View preparedness guidance" : "View response guidance"} <span aria-hidden="true">→</span></button></>}
          </>}
          {view === "teams" && <div className="review-list">{visible.teams.slice(pageStart, pageStart + PAGE_SIZE).map(team => <button className="review-row" key={team.id} onClick={() => setSelection({ kind: "team", id: team.id })}><DashboardIcon kind="teams" /><span className="review-row-copy"><strong>{team.name}</strong><small>{team.capabilities.join(" · ")}</small></span><span className={`check-in ${team.status}`}>{team.status}</span></button>)}{!visible.teams.length && <p className="empty-state">No teams recorded in the visible zones.</p>}</div>}
          {(view === "households" || view === "teams") && <div className="list-pagination"><button disabled={currentPage === 0} onClick={() => setBrowsePage(currentPage - 1)}>Previous</button><span>{browseCount ? pageStart + 1 : 0}–{Math.min(pageStart + PAGE_SIZE, browseCount)} of {browseCount.toLocaleString()}</span><button disabled={pageStart + PAGE_SIZE >= browseCount} onClick={() => setBrowsePage(currentPage + 1)}>Next</button></div>}
          {view === "preparation" && <div className="review-list">{visible.zones.map(zone => <button className="review-row" key={zone.id} onClick={() => setSelection({ kind: "zone", id: zone.id })}><DashboardIcon kind="tasks" /><span className="review-row-copy"><strong>{zone.name}</strong><small>{hazards[zone.hazard].label} · {phase === "before" ? "Preparedness" : "Response"}</small></span><span aria-hidden="true">→</span></button>)}{!visible.zones.length && <p className="empty-state">Enable a hazard to explore area guidance.</p>}</div>}
          <div className="review-note"><DashboardIcon kind="phone" /><div><h3>Keep the connection going.</h3><p>Review household needs and contact history before planning your next step.</p><small>{status === "connected" ? "Open the shared scenario desk below for priority explanations, outreach and employee-reviewed dispatch." : "Use the local scenario desk below to rehearse outreach and employee-reviewed assistance."}</small></div></div>
        </aside>}
      </div>
    </div>
    <div id="scenario-desk" tabIndex={-1}>{reviewZone ? renderWorkspace ? renderWorkspace(visible, reviewZone, effectiveSelection, setSelection) : <ScenarioWorkspace key={`${status}-${reviewZone.id}`} data={visible} zone={reviewZone} demo={status === "demo"}/> : <section className="scenario-desk"><h2>No visible area</h2><p>Enable a hazard layer to open an area review and scenario rehearsal.</p></section>}</div>
    <nav className="quick-actions" aria-label="Quick actions"><button onClick={() => openView("overview")}><DashboardIcon kind="phone" />Review follow-ups <span aria-hidden="true">→</span></button><button onClick={() => openView("teams")}><DashboardIcon kind="teams" />View teams <span aria-hidden="true">→</span></button><button onClick={() => openView("preparation")}><DashboardIcon kind="tasks" />{phase === "before" ? "Preparedness guidance" : "Response guidance"} <span aria-hidden="true">→</span></button><button onClick={() => { setSelection(null); setOverviewVersion(value => value + 1); }}><DashboardIcon kind="map" />National overview <span aria-hidden="true">→</span></button></nav>
    {workflowPanel && <section className="workflow-panel" aria-label="Operational workflow">{workflowPanel}</section>}
    <footer className="app-footer"><span>RiskReach · HackUTD prototype</span><span>{status === "demo" ? "Fictional scenario data · No live hazard feed or customer records" : "Operational data supplied by shared integration"} · Employee review required</span></footer>
  </main>;
}
