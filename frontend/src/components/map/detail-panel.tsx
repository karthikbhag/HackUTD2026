import { displayTime, hazards, type MapData, type Phase, type Selection } from "@/lib/map/types";

// Read-only details: operational updates are handled by Person 4's workflow controls.
export function DetailPanel({ data, selection, phase, onSelect }: { data: MapData; selection: Selection; phase: Phase; onSelect: (selection: Selection) => void }) {
  const household = selection?.kind === "household" ? data.households.find(item => item.id === selection.id) : undefined;
  const team = selection?.kind === "team" ? data.teams.find(item => item.id === selection.id) : undefined;
  // Keep zone context visible when a household or team within that zone is selected.
  const zoneId = selection?.kind === "zone" ? selection.id : household?.zoneId ?? team?.zoneId;
  const zone = data.zones.find(item => item.id === zoneId);
  // Also covers a selected record that disappears from a subscription update.
  if (!zone) return <aside className="detail-panel"><p className="eyebrow">Area intelligence</p><h2>Select a hotspot</h2><p className="muted">Choose a zone on the map or in the hotspot list to review exposure, households, and response teams.</p></aside>;
  // Exposure/grouping is supplied by the data adapter; this panel does no spatial analysis.
  const households = data.households.filter(item => item.zoneId === zone.id);
  const teams = data.teams.filter(item => item.zoneId === zone.id);
  return <aside className="detail-panel" aria-label="Selection details">
    <div className="panel-heading"><p className="eyebrow">Area intelligence</p><button className="text-button" onClick={() => onSelect(null)}>Close</button></div>
    <div className="tag-row"><span className={`severity ${zone.severity}`}>{zone.severity}</span><span className="tag">{zone.simulated ? "Simulation" : "Source data"}</span></div>
    <h2>{zone.name}</h2><p className="muted">{hazards[zone.hazard].label} · {phase === "before" ? "Preparedness" : "Response"}</p>
    <div className="guidance"><h3>{phase === "before" ? "Preparation focus" : "Response focus"}</h3>{(phase === "before" ? zone.preparation : zone.response).map(text => <p key={text}>{text}</p>)}<small>For employee review. No outreach or dispatch has been performed.</small></div>
    {household && <section className="selected-record"><h3>{household.name}</h3><span className="tag">{household.isCustomer ? "Customer" : "Community member"}</span><dl><dt>Check-in</dt><dd>{household.checkIn.replaceAll("_", " ")}</dd><dt>Last contact</dt><dd>{displayTime(household.lastContactAt)}</dd><dt>Assistance factors</dt><dd>{household.vulnerabilities.join(", ") || "None recorded"}</dd><dt>Reported needs</dt><dd>{household.needs.join(", ") || "None recorded"}</dd></dl></section>}
    {team && <section className="selected-record"><h3>{team.name}</h3><dl><dt>Status</dt><dd>{team.status}</dd><dt>Capacity</dt><dd>{team.capacity}</dd><dt>Capabilities</dt><dd>{team.capabilities.join(", ")}</dd></dl></section>}
    <section><h3>Households <span className="count">{households.length}</span></h3>{households.length ? households.map(item => <button className="record-row" aria-pressed={selection?.kind === "household" && selection.id === item.id} key={item.id} onClick={() => onSelect({ kind: "household", id: item.id })}><span><strong>{item.name}</strong><small>{item.isCustomer ? "Customer" : "Community member"}</small></span><span className="status-label">{item.checkIn.replaceAll("_", " ")}</span></button>) : <p className="muted">No households recorded in this zone.</p>}</section>
    <section><h3>Response teams <span className="count">{teams.length}</span></h3>{teams.length ? teams.map(item => <button className="record-row" aria-pressed={selection?.kind === "team" && selection.id === item.id} key={item.id} onClick={() => onSelect({ kind: "team", id: item.id })}><span><strong>{item.name}</strong><small>{item.status}</small></span><span aria-hidden="true">↗</span></button>) : <p className="muted">No teams recorded in this zone.</p>}</section>
    <footer className="source-note"><strong>{zone.source}</strong><br/>Updated {displayTime(zone.updatedAt)}<br/>Customer status provides context; urgency and need determine assistance priority.</footer>
  </aside>;
}
