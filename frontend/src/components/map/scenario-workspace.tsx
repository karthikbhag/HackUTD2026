"use client";

import { useReducer, useState } from "react";
import { hazards, type MapData, type MapZone } from "@/lib/map/types";
import { initialScenarioDemo, scenarioDemoReducer } from "@/lib/map/scenario-demo";

export function ScenarioWorkspace({ data, zone, demo }: { data: MapData; zone: MapZone; demo: boolean }) {
  const [state, dispatch] = useReducer(scenarioDemoReducer, initialScenarioDemo);
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(true);
  const after = state.minute >= 0;
  const round = after ? state.after : state.before;
  const overdue = !!state.after && state.minute >= state.after.sentAt + 30;
  const households = data.households.filter(row => (row.hotspotId ?? row.zoneId) === zone.id && row.isCustomer);
  const replies = round?.replies ?? {};
  const safe = households.filter(row => replies[row.id] === "safe").length;
  const help = households.filter(row => replies[row.id] === "needs_help").length;
  const awaiting = round ? households.length - safe - help : 0;
  const attention = households.filter(row => replies[row.id] !== "safe" || (after && row.needs.length > 0));
  const reviewOrder = (id: string) => replies[id] === "needs_help" ? 0 : replies[id] === "safe" ? 2 : 1;
  const displayed = [...(attentionOnly ? attention : households)].sort((a, b) => reviewOrder(a.id) - reviewOrder(b.id));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(displayed.length / 5) - 1));
  const notification = `State Farm scenario check-in · ${zone.name}. ${after ? 'The simulated disaster has passed. Please tell us whether you are safe or need help.' : `${hazards[zone.hazard].label} scenario: ${zone.severity} severity. ${zone.preparation.join(' ')} Please confirm that you are safe.`}`;
  return <section className="scenario-desk" aria-label="Area review and scenario rehearsal">
    <div className="desk-heading"><div><p className="eyebrow">From awareness to assistance</p><h2>{after ? "Safety check-ins & response" : "Preparation outreach"}</h2><p className="muted small">{zone.name} · Review your message, then follow up with households below.</p></div><span className="simulation-badge">{demo ? "Interactive simulation" : "Area review · Read-only"}</span></div>
    <div className="scenario-steps" aria-label="Scenario progress">{["Review the area", "Prepare & notify", "Check after impact", "Follow up & respond"].map((step, i) => <div key={step} className={(i === 0 || (i === 1 && state.before) || (i === 2 && after) || (i === 3 && overdue)) ? "reached" : ""}><span>{String(i + 1).padStart(2, "0")}</span>{step}</div>)}</div>
    <div className="outreach-controls">
      {!demo ? <article className="checkin-workspace"><p className="eyebrow">Connected records</p><h3>Review now. Coordinate through your shared workflow.</h3><p className="muted">Area evidence and household details are available above. Notifications, scenario time skips, replies, and team assignments in this desk are available in fixture demo mode only.</p><p className="simulation-notice">No notification or dispatch has been performed. Use the shared operational controls when integrated.</p></article> : <article className="checkin-workspace">
        <div className="panel-heading"><p className="eyebrow">{after ? "Post-disaster check-in" : "Preparation outreach"}</p><span className="scenario-clock">{state.minute < 0 ? "T − 2 hours" : `T + ${state.minute} min`}</span></div>
        <h3>{after ? "Check on every household. Again." : "Reach people before impact."}</h3>
        <p className="muted small">Fictional clock · Impact at T+0 · Post-disaster replies due in 30 minutes.</p>
        <label className="message-label" htmlFor="notification-preview">Suggested notification · Employee review</label><textarea id="notification-preview" value={notification} readOnly rows={4} />
        <p className="muted small">Evacuation instructions require a supplied emergency advisory. No evacuation order is inferred from severity.</p>
        <div className="scenario-buttons"><button className="primary-button" disabled={!demo || !!round || !households.length} onClick={() => { dispatch({ type: "send" }); setNotice("Simulated notification approved. No messages were delivered."); }}> {round ? "Check-in sent · Simulated" : `Approve ${after ? 'safety check-in' : 'preparation notice'} · Simulate`}</button><button className="outline-button" disabled={!demo || (!after && !state.before) || (after && (!state.after || overdue))} onClick={() => { dispatch({ type: after ? "deadline" : "impact" }); setNotice(after ? "30-minute reply deadline reached. Unanswered check-ins now need follow-up." : "Time skipped to impact. Send a fresh safety check-in; earlier replies remain in history."); }}>{after ? "Skip 30 min → Follow-up" : "Skip 2 hours → After impact"}</button></div>
        <div className={`response-totals ${after ? "" : "before-impact"}`}><div><strong>{safe}</strong><span>Confirmed safe</span></div>{after && <div><strong>{help}</strong><span>Need help</span></div>}<div><strong>{awaiting}</strong><span>{after ? overdue ? "No response" : "Awaiting reply" : "No reply"}</span></div></div>
        <div className="attention-heading"><div><h4>Households needing attention <span className="count">{attention.length}</span></h4><p className="small muted">{round ? after ? 'Simulate a reply below. Safe replies stay visible if an existing need remains.' : 'Confirm safety below. Customers who do not respond remain marked No reply.' : 'Approve a notice to begin a fresh check-in.'}</p></div><label><input type="checkbox" checked={attentionOnly} onChange={event => { setAttentionOnly(event.target.checked); setPage(0); }}/> Needs attention only</label></div>
        {!households.length && <p className="empty-state">No customers in this area. Choose another hotspot.</p>}
        {!!households.length && !displayed.length && <p className="empty-state">{after ? "All customers have confirmed safety with no recorded assistance needs." : "All customers have confirmed safety."} Uncheck the filter to review their replies.</p>}
        {displayed.slice(currentPage * 5, currentPage * 5 + 5).map(row => {
          const reply = replies[row.id];
          const assigned = state.assignments[row.id];
          const needsResponse = after && round && (reply === 'needs_help' || (overdue && !reply));
          // This rehearsal supports welfare checks; the backend recommender handles full request matching.
          const team = data.teams.find(team => team.status === 'available' && team.capacity >= 1 && team.capabilities.some(capability => capability.toLowerCase().replaceAll('_', ' ') === 'welfare check') && !Object.values(state.assignments).includes(team.id) && (team.hotspotId ?? team.zoneId) === zone.id);
          return <div className="customer-checkin" key={row.id}>
            <div className="panel-heading"><strong>{row.name}</strong><span className={`check-in ${reply ?? 'unknown'}`}>{reply === 'safe' ? 'Safe' : reply === 'needs_help' ? 'Needs help' : round ? after ? overdue ? 'No response' : 'Awaiting reply' : 'No reply' : 'Not contacted'}</span></div>
            <small className="muted">{row.vulnerabilities.join(' · ') || 'No assistance factors recorded'}{after && state.before?.replies[row.id] ? ` · Before impact: ${state.before.replies[row.id] === 'safe' ? 'safe' : 'needs help'}` : ''}</small>
            {!!row.needs.length && <small className="muted">Recorded needs: {row.needs.join(" · ")}</small>}
            <div className="reply-actions"><button disabled={!demo || !round || !!assigned} aria-pressed={reply === 'safe'} onClick={() => dispatch({ type: 'reply', id: row.id, reply: 'safe' })}>Simulate: safe</button>{after && <button disabled={!demo || !round || !!assigned} aria-pressed={reply === 'needs_help'} onClick={() => dispatch({ type: 'reply', id: row.id, reply: 'needs_help' })}>Simulate: need help</button>}</div>
            {needsResponse && <div className="dispatch-preview"><p><strong>{assigned ? 'Unit assigned · Simulated' : reply === 'needs_help' ? 'Help requested · Review now' : 'Welfare check · Reply overdue'}</strong><br/>{assigned ? data.teams.find(team => team.id === assigned)?.name : team ? `${team.name} · Welfare check · Capacity ${team.capacity}` : 'No matching available welfare-check unit in this area.'}</p>{!assigned && <button className="outline-button" disabled={!demo || !team} onClick={() => { if (team) dispatch({ type: 'assign', id: row.id, teamId: team.id }); }}>Approve welfare-check unit · Simulate</button>}<small>Local capability match. Other assistance needs require separate review.</small></div>}
          </div>;
        })}
        {displayed.length > 5 && <div className="list-pagination"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {Math.ceil(displayed.length / 5)}</span><button disabled={(currentPage + 1) * 5 >= displayed.length} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
        <p className="scenario-status" role="status">{notice || "Demo actions stay in this browser and reset when you switch areas or reload."}</p>
        <details className="brief-source"><summary>Rehearsal history ({state.events.length})</summary>{state.events.length ? <ol>{state.events.map((event, i) => <li key={i}>{event}</li>)}</ol> : <p>No actions yet.</p>}</details>
        <button className="text-button" disabled={!demo} onClick={() => { dispatch({ type: 'reset' }); setNotice('Area rehearsal reset.'); }}>Reset area rehearsal</button>
      </article>}
    </div>
  </section>;
}
