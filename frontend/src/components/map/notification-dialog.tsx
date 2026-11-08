"use client";

import { supportsRiskNotices } from "@/lib/map/backend-capabilities";
import { encodeRiskMessages, parseRiskMessages, type RiskMessages } from "../../../../backend/src/risk-messages";
import { useEffect, useRef, useState, type Dispatch } from "react";
import { areaPhase, areaIdFor, confirmedSafe, dashboardHouseholdStatus, matchingTeam, needsAttention, responseApprovalEligible, type DashboardAction, type DashboardScenario } from "@/lib/map/dashboard-scenario";
import { hazards, type MapData, type MapZone, type Phase } from "@/lib/map/types";

export function NotificationDialog({ data, zone, phase, state, dispatch, onClose, shared = false, busy = false, error, assignmentStatuses }: {
  data: MapData; zone: MapZone; phase: Phase; state: DashboardScenario;
  dispatch: Dispatch<DashboardAction>; onClose: () => void; shared?: boolean; busy?: boolean; error?: string; assignmentStatuses?: Record<string, string>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const after = phase === "after";
  const historical = phase !== areaPhase(state, zone.id);
  const round = state.areas[zone.id]?.[phase];
  const tiered = (!shared || supportsRiskNotices) && (!round || !!parseRiskMessages(round.message));
  const households = data.households.filter(row => round?.recipients.includes(row.id) || ( row.riskByArea ? !!row.riskByArea[zone.id] && row.riskByArea[zone.id] !== "None" : areaIdFor(row) === zone.id));
  const recipients = (tiered ? households : data.households.filter(row => areaIdFor(row) === zone.id)).filter(row => (!tiered || row.riskLevel !== "None") && row.isCustomer && !state.completedRescues?.[row.id] && !confirmedSafe(state, row, phase, zone.id));
  const rows = households.filter(row => needsAttention(state, row, phase, zone.id));
  const [message, setMessage] = useState(`State Farm · ${zone.name}. ${after ? "We are following up after the simulated disaster because we have not received your safety confirmation. Please reply SAFE or NEED HELP." : `${hazards[zone.hazard].label} scenario · ${zone.severity} severity. ${zone.preparation.join(" ")} Please confirm you are safe.`}`);
  const [riskMessages, setRiskMessages] = useState<RiskMessages>({
    High: `High risk. ${message} Prioritize reviewing protective guidance and local authority updates now.`,
    Medium: `Medium risk. ${message} Prepare for changing conditions and monitor local authority updates.`,
    Low: `Low risk. ${message} Stay informed and review your household preparedness plan.`,
  });
  const [reviewedVersion,setReviewedVersion] = useState(zone.eventVersion);
  const riskChanged = tiered && !round && reviewedVersion !== zone.eventVersion;
  const approvedMessages = round ? parseRiskMessages(round.message) : undefined;
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
        {error && <p className="error-banner" role="alert">{error}</p>}
        {riskChanged && <div className="error-banner" role="alert">Weather risk changed while this review was open. Review the latest location, counts and messages before approval. <button onClick={()=>{setReviewedVersion(zone.eventVersion);setRiskMessages({High:`High risk. State Farm · ${zone.name}. ${hazards[zone.hazard].label} simulation · ${zone.severity} severity. Review protective guidance now. ${after ? 'Reply SAFE or NEED HELP.' : 'Please confirm you are safe.'}`,Medium:`Medium risk. State Farm · ${zone.name}. Prepare for changing conditions and monitor updates. ${after ? 'Reply SAFE or NEED HELP.' : 'Please confirm you are safe.'}`,Low:`Low risk. State Farm · ${zone.name}. Stay informed and review your preparedness plan. ${after ? 'Reply SAFE or NEED HELP.' : 'Please confirm you are safe.'}`});}}>Review latest risk</button></div>}
        <div className="notification-summary"><span className="notification-step">{after ? "02" : "01"}</span><div><strong>{after ? "Second safety notification" : "Initial preparation notification"}</strong><p>{after ? "Only households without a safety confirmation receive this follow-up." : "Send preparation guidance, then record simulated safety confirmations."}</p></div><span className="simulation-badge">{shared ? "Shared simulation" : "Demo only"}</span></div>
        {tiered ? (["High", "Medium", "Low"] as const).map(band => <div key={band}>
          <label className="message-label" htmlFor={`notification-${band}`}>{band} risk · {round ? Object.values(round.recipientRisk ?? {}).filter(r => r === band).length : recipients.filter(r => (r.riskByArea?.[zone.id] ?? r.riskLevel) === band).length} households</label>
          <textarea id={`notification-${band}`} value={approvedMessages?.[band] ?? (round ? round.message : riskMessages[band])} maxLength={4000} readOnly={busy || !!round || historical} onChange={event => setRiskMessages(previous => ({...previous, [band]: event.target.value}))} rows={3}/>
        </div>) : <div>
          <label className="message-label" htmlFor="dashboard-notification">{round ? "Approved message" : "Review and edit your message"}</label>
          <textarea id="dashboard-notification" value={round?.message ?? message} maxLength={4000} readOnly={busy || !!round || historical} onChange={event => setMessage(event.target.value)} rows={4}/>
        </div>}
        <div className="notification-send"><span>{round ? `Sent to ${round.recipients.length} households · Simulated` : `${recipients.length} households will receive ${tiered ? "their respective risk message" : "this message"}`}</span><button className="primary-button" disabled={busy || riskChanged || !!round || historical || !recipients.length || (tiered ? Object.values(riskMessages).some(m => !m.trim()) : !message.trim())} onClick={() => dispatch({ type: "send", areaId: zone.id, message: tiered ? encodeRiskMessages(riskMessages, reviewedVersion) : message })}>{round ? "Notification sent ✓" : `Approve & send${after ? " follow-up" : " notifications"}`}</button></div>
        <div className="attention-heading"><div><h3>Still needs attention <span className="count">{rows.length}</span></h3><p className="muted small">{historical ? "Preparation history. Return to After to continue." : "Simulate replies below. Close this popup to advance time on the dashboard."}</p></div></div>
        {after && <p className="muted small">Need help replies automatically assign an available matching unit. Approve response units for households that remain unanswered after 30 minutes.</p>}
        {!rows.length && <p className="empty-state">No households need follow-up. Confirmed-safe households are excluded from response-unit review.</p>}
        {rows.slice(currentPage * 5, currentPage * 5 + 5).map(row => {
          const assigned = state.assignments[row.id];
          const team = matchingTeam(state, row, data.teams);
          const canRespond = after && responseApprovalEligible(state, row, zone.id);
          const awaitingUnit = after && round?.replies[row.id] === "needs_help" && !assigned;
          const canReply = row.isCustomer && !!round?.recipients.includes(row.id) && !historical && !assigned;
          return <article className="customer-checkin" key={row.id}>
            <div className="panel-heading"><strong>{row.name}</strong><span className={`check-in ${assigned ? "safe" : round?.replies[row.id] === "needs_help" ? "needs_help" : "unknown"}`}>{assignmentStatuses?.[row.id] === "completed" ? "Assistance completed" : dashboardHouseholdStatus(state, row, phase, zone.id)}</span></div>
            <small className="muted">{row.isCustomer ? "Customer" : "Community member"} · Risk: {round?.recipientRisk?.[row.id] ?? row.riskByArea?.[zone.id] ?? row.riskLevel ?? "None"}{row.needs.length ? ` · Recorded need: ${row.needs.join(", ")}` : " · Safety confirmation requested"}</small>
            {round?.recipientMessages?.[row.id] && <details><summary>Approved notification</summary><p>{round.recipientMessages[row.id]}</p></details>}
            {canReply && <div className="reply-actions"><button disabled={busy} onClick={() => dispatch({ type: "reply", areaId: zone.id, id: row.id, reply: "safe" })}>Simulate: safe</button>{after && <button disabled={busy} onClick={() => dispatch({ type: "reply", areaId: zone.id, id: row.id, reply: "needs_help" })}>Simulate: need help</button>}</div>}
            {assigned && <p className="assignment-confirmation">✓ {data.teams.find(team => team.id === assigned)?.name} {assignmentStatuses?.[row.id] === "completed" ? "completed assistance" : round?.replies[row.id] === "needs_help" ? "automatically assigned" : "assigned"} · Simulated</p>}
            {awaitingUnit && <p className="dispatch-preview" role="status">Help requested · No matching available unit. This household remains in the help queue.</p>}
            {canRespond && <div className="dispatch-preview"><p><strong>{team ? `${team.name} · Available` : "No matching available unit"}</strong><br/>{team ? `${team.capabilities.join(" · ")} · Local area · Capacity ${team.capacity}` : "This case remains in the queue until a suitable unit is available."}</p><button className="outline-button" disabled={busy || !team} onClick={() => team && dispatch({ type: "assign", areaId: zone.id, id: row.id, teamId: team.id })}>Approve response unit</button></div>}
          </article>;
        })}
        {rows.length > 5 && <div className="list-pagination"><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {Math.ceil(rows.length / 5)}</span><button disabled={(currentPage + 1) * 5 >= rows.length} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
        <p className="simulation-notice" role="status">{historical ? "Before is now a history view. " : ""}{shared ? "Approvals, simulated replies and assignments are saved in the shared database. No messages or real units are sent." : "All messages, replies, and assignments are simulated in this browser. Nothing is delivered or dispatched."}</p>
      </div>
      <footer className="dialog-actions"><button className="outline-button" onClick={onClose}>Back to dashboard</button></footer>
    </div>
  </dialog>;
}
