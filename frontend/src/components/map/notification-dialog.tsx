"use client";

import { useEffect, useRef, useState, type Dispatch } from "react";
import { areaIdFor, confirmedSafe, dashboardHouseholdStatus, matchingTeam, needsAttention, responseEligible, type DashboardAction, type DashboardScenario } from "@/lib/map/dashboard-scenario";
import { hazards, type MapData, type MapZone, type Phase } from "@/lib/map/types";

export function NotificationDialog({ data, zone, phase, state, dispatch, onClose }: {
  data: MapData; zone: MapZone; phase: Phase; state: DashboardScenario;
  dispatch: Dispatch<DashboardAction>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const after = phase === "after";
  const historical = !after && state.minute >= 0;
  const round = state.areas[zone.id]?.[phase];
  const households = data.households.filter(row => areaIdFor(row) === zone.id);
  const recipients = households.filter(row => row.isCustomer && !confirmedSafe(state, row, phase));
  const rows = households.filter(row => needsAttention(state, row, phase));
  const [message, setMessage] = useState(`State Farm · ${zone.name}. ${after ? "We are following up after the simulated disaster because we have not received your safety confirmation. Please reply SAFE or NEED HELP." : `${hazards[zone.hazard].label} scenario · ${zone.severity} severity. ${zone.preparation.join(" ")} Please confirm you are safe.`}`);
  const [page, setPage] = useState(0);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 5) - 1));
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className="area-review-dialog notification-dialog" aria-labelledby="notification-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="area-review-content">
      <header className="dialog-heading"><div><p className="eyebrow">{zone.name} · {after ? "After impact" : "Before impact"}</p><h2 id="notification-title">{after ? "Follow up. Make contact. Send help." : "A first message. A safer start."}</h2></div><button className="dialog-close" aria-label="Close notification" onClick={onClose} autoFocus>×</button></header>
      <div className="notification-body">
        <div className="notification-summary"><span className="notification-step">{after ? "02" : "01"}</span><div><strong>{after ? "Second safety notification" : "Initial preparation notification"}</strong><p>{after ? "Only households without a safety confirmation receive this follow-up." : "Send preparation guidance, then record simulated safety confirmations."}</p></div><span className="simulation-badge">Demo only</span></div>
        <label className="message-label" htmlFor="dashboard-notification">{round ? "Approved message" : "Review and edit your message"}</label>
        <textarea id="dashboard-notification" value={round?.message ?? message} readOnly={!!round || historical} onChange={event => setMessage(event.target.value)} rows={4}/>
        <div className="notification-send"><span>{round ? `Sent to ${round.recipients.length} households · Simulated` : `${recipients.length} households will receive this message`}</span><button className="primary-button" disabled={!!round || historical || !recipients.length || !message.trim()} onClick={() => dispatch({ type: "send", areaId: zone.id, message })}>{round ? "Notification sent ✓" : `Approve & send${after ? " follow-up" : " notification"}`}</button></div>
        <div className="attention-heading"><div><h3>Still needs attention <span className="count">{rows.length}</span></h3><p className="muted small">{historical ? "Preparation history. Return to After to continue." : "Simulate replies below. Close this popup to advance time on the dashboard."}</p></div></div>
        {!rows.length && <p className="empty-state">No households need follow-up. Confirmed-safe households are excluded from response-unit review.</p>}
        {rows.slice(currentPage * 5, currentPage * 5 + 5).map(row => {
          const assigned = state.assignments[row.id];
          const team = matchingTeam(state, row, data.teams);
          const canRespond = after && responseEligible(state, row);
          const canReply = row.isCustomer && !!round?.recipients.includes(row.id) && !historical && !assigned;
          return <article className="customer-checkin" key={row.id}>
            <div className="panel-heading"><strong>{row.name}</strong><span className={`check-in ${assigned ? "safe" : round?.replies[row.id] === "needs_help" ? "needs_help" : "unknown"}`}>{dashboardHouseholdStatus(state, row, phase)}</span></div>
            <small className="muted">{row.isCustomer ? "Customer" : "Community member"}{row.needs.length ? ` · Recorded need: ${row.needs.join(", ")}` : " · Safety confirmation requested"}</small>
            {canReply && <div className="reply-actions"><button onClick={() => dispatch({ type: "reply", id: row.id, reply: "safe" })}>Simulate: safe</button>{after && <button onClick={() => dispatch({ type: "reply", id: row.id, reply: "needs_help" })}>Simulate: need help</button>}</div>}
            {assigned && <p className="assignment-confirmation">✓ {data.teams.find(team => team.id === assigned)?.name} assigned · Simulated</p>}
            {canRespond && <div className="dispatch-preview"><p><strong>{team ? `${team.name} · Available` : "No matching available unit"}</strong><br/>{team ? `${team.capabilities.join(" · ")} · Local area · Capacity ${team.capacity}` : "This case remains in the queue until a suitable unit is available."}</p><button className="outline-button" disabled={!team} onClick={() => team && dispatch({ type: "assign", id: row.id, teamId: team.id })}>Approve response unit</button></div>}
          </article>;
        })}
        {rows.length > 5 && <div className="list-pagination"><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {Math.ceil(rows.length / 5)}</span><button disabled={(currentPage + 1) * 5 >= rows.length} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
        <p className="simulation-notice" role="status">{historical ? "Before is now a history view. " : ""}All messages, replies, and assignments are simulated in this browser. Nothing is delivered or dispatched.</p>
      </div>
      <footer className="dialog-actions"><button className="outline-button" onClick={onClose}>Back to dashboard</button></footer>
    </div>
  </dialog>;
}
