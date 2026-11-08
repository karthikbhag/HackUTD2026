"use client";

import { useState } from "react";
import { PAGE_SIZE } from "@/lib/map/presentation";
import { displayTime, hazards, type MapData, type Phase, type Selection } from "@/lib/map/types";

// Read-only details: operational updates are handled by Person 4's workflow controls.
export function DetailPanel({ data, selection, phase, onSelect }: { data: MapData; selection: Selection; phase: Phase; onSelect: (selection: Selection) => void }) {
  const [scope, setScope] = useState("all");
  const [page, setPage] = useState(0);
  const household = selection?.kind === "household" ? data.households.find(item => item.id === selection.id) : undefined;
  const team = selection?.kind === "team" ? data.teams.find(item => item.id === selection.id) : undefined;
  // Keep zone context visible when a household or team within that zone is selected.
  const zoneId = selection?.kind === "zone" ? selection.id : household?.hotspotId ?? household?.zoneId ?? team?.hotspotId ?? team?.zoneId;
  const zone = data.zones.find(item => item.id === zoneId);
  // Also covers a selected record that disappears from a subscription update.
  if (!zone) return <aside className="detail-panel"><p className="eyebrow">Area intelligence</p><h2>Select a hotspot</h2><p className="muted">Choose a zone on the map or in the hotspot list to inspect geographic context, households, and response teams.</p></aside>;
  // Exposure/grouping is supplied by the data adapter; this panel does no spatial analysis.
  const households = data.households.filter(item => (item.hotspotId ?? item.zoneId) === zone.id && (scope === "all" || (item.membership ?? "neighborhood") === scope));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(households.length / PAGE_SIZE) - 1));
  const pageRows = households.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const teams = data.teams.filter(item => (item.hotspotId ?? item.zoneId) === zone.id);
  return <aside className="detail-panel" aria-label="Selection details">
    <div className="panel-heading"><p className="eyebrow">Area intelligence</p><button className="text-button" onClick={() => onSelect(null)}>Close</button></div>
    <div className="tag-row"><span className={`severity ${zone.severity}`}>{zone.severity} severity</span><span className="tag">Geographic context</span><span className="tag">{zone.simulated ? "Simulation" : "Source data"}</span></div>
    <h2>{zone.name}</h2><p className="muted">{hazards[zone.hazard].label} · {phase === "before" ? "Preparedness" : "Response"}</p>
    <div className="guidance"><h3>{phase === "before" ? "Preparation focus" : "Response focus"}</h3>{(phase === "before" ? zone.preparation : zone.response).map(text => <p key={text}>{text}</p>)}<small>For employee review. No outreach or dispatch has been performed.</small></div>
    {household && <section className="selected-record"><h3>{household.name}</h3><span className="tag">{household.isCustomer ? "Customer" : "Community member"}</span><dl><dt>Geographic membership</dt><dd>{household.membership ?? "neighborhood"}</dd><dt>Check-in</dt><dd>{household.checkIn.replaceAll("_", " ")}</dd><dt>Last contact</dt><dd>{displayTime(household.lastContactAt)}</dd><dt>Assistance factors</dt><dd>{household.vulnerabilities.join(", ") || "None recorded"}</dd><dt>Reported needs</dt><dd>{household.needs.join(", ") || "None recorded"}</dd></dl></section>}
    {team && <section className="selected-record"><h3>{team.name}</h3><dl><dt>Status</dt><dd>{team.status}</dd><dt>Capacity</dt><dd>{team.capacity}</dd><dt>Capabilities</dt><dd>{team.capabilities.join(", ")}</dd></dl></section>}
    <section><h3>Households <span className="count">{households.length}</span></h3><label>Membership <select value={scope} onChange={event => { setScope(event.target.value); setPage(0); }}><option value="all">All households</option><option value="neighborhood">Neighborhood</option><option value="regional">Regional</option></select></label><p className="muted small">Geographic membership does not establish hazard exposure.</p>{households.length ? pageRows.map(item => <button className="record-row" aria-pressed={selection?.kind === "household" && selection.id === item.id} key={item.id} onClick={() => onSelect({ kind: "household", id: item.id })}><span><strong>{item.name}</strong><small>{item.isCustomer ? "Customer" : "Community member"}</small></span><span className="status-label">{item.checkIn.replaceAll("_", " ")}</span></button>) : <p className="muted">No households match this membership.</p>}<div className="list-pagination"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{households.length ? currentPage * PAGE_SIZE + 1 : 0}–{Math.min((currentPage + 1) * PAGE_SIZE, households.length)} of {households.length}</span><button disabled={(currentPage + 1) * PAGE_SIZE >= households.length} onClick={() => setPage(currentPage + 1)}>Next</button></div></section>
    <section><h3>Response teams <span className="count">{teams.length}</span></h3>{teams.length ? teams.map(item => <button className="record-row" aria-pressed={selection?.kind === "team" && selection.id === item.id} key={item.id} onClick={() => onSelect({ kind: "team", id: item.id })}><span><strong>{item.name}</strong><small>{item.status}</small></span><span aria-hidden="true">↗</span></button>) : <p className="muted">No teams recorded in this zone.</p>}</section>
    <section><h3>Synthetic hazard footprints</h3>{data.impactLayers?.filter(layer => layer.hotspotId === zone.id).map(layer => <div className="guidance" key={layer.id}><strong>{layer.component.replaceAll("_", " ")}</strong><p>{layer.severity} · {layer.severityBasis}</p><small>{layer.source} · {displayTime(layer.updatedAt)}<br/>{layer.limitations}</small></div>)}{!data.impactLayers?.some(layer => layer.hotspotId === zone.id) && <p className="muted small">No explicit footprints supplied by this fixture. Context outlines are not impact areas.</p>}</section>
    <footer className="source-note"><strong>{zone.source}</strong><br/>Updated {displayTime(zone.updatedAt)}<br/>Customer status provides context; urgency and need determine assistance priority.</footer>
  </aside>;
}
