"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DbConnection, tables } from "@/module_bindings";
import { hazards, type MapData, type MapZone, type Selection } from "@/lib/map/types";

const label = (s: string) => s.replaceAll("_", " ");
type Action = (work: () => Promise<unknown>, success: string) => Promise<void>;
type Detail = {
  runId: string; score: number; overlooked: boolean; contactExplanation: string;
  concerns: { code: string; explanation: string }[];
  reasons: { factor: string; points: number; explanation: string }[];
  exposureEvidence: { layerId: string; hazardType: string; component: string; severity: string; source: string }[];
  preparation: { suggestions: { recommendationId: string; title: string; description: string; guidanceUrl: string; guidanceCheckedOn: string; reasons: string[] }[]; suppressed: { recommendationId: string }[] };
  requests: { id: string; needType: string; people: number; urgency: number; status: string }[];
};
type TeamReport = { requestBlockReasons: { explanation: string }[]; eligibleTeamCount: number; excludedTeamCount: number;
  recommendations: { teamId: string; name: string; distanceKm: number; approximateEtaMinutes: number; reasons: string[] }[];
  exclusionCounts: Record<string, number> };

function useOperationalRows(conn: DbConnection) {
  const [revision, setRevision] = useState(0), [error, setError] = useState("");
  useEffect(() => {
    let queued = false, disposed = false;
    const changed = () => { if (queued || disposed) return; queued = true; queueMicrotask(() => { queued = false; if (!disposed) setRevision(v => v + 1); }); };
    const handles = [conn.db.decisions, conn.db.scenarioInfo, conn.db.dashboardState, conn.db.exercises, conn.db.exerciseReplies, conn.db.householdDecisions,
      conn.db.responseRuns, conn.db.welfareVisits, conn.db.responseTeamStates, conn.db.teamRecommendations, conn.db.tasks, conn.db.assignments, conn.db.activities, conn.db.households, conn.db.requests];
    for (const h of handles) { h.onInsert(changed); h.onDelete(changed); h.onUpdate(changed); }
    const subscription = conn.subscriptionBuilder().onApplied(changed).onError(ctx => setError(String(ctx.event)))
      .subscribe([tables.decisions, tables.scenarioInfo, tables.exercises, tables.activities]);
    return () => { disposed = true; subscription.unsubscribe(); for (const h of handles) { h.removeOnInsert(changed); h.removeOnDelete(changed); h.removeOnUpdate(changed); } };
  }, [conn]);
  return { revision, error };
}

export function ConnectedWorkspace({ conn, data, zone, selection, onSelect }: { conn: DbConnection; data: MapData; zone: MapZone;
  selection: Selection; onSelect: (selection: Selection) => void }) {
  const router = useRouter();
  const { revision, error } = useOperationalRows(conn);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [page, setPage] = useState(0), [onlyOverlooked, setOnlyOverlooked] = useState(false), [search, setSearch] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState(`Simulated ${hazards[zone.hazard].label.toLowerCase()} preparation check-in for ${zone.name}. Review official guidance and recorded support needs. Please report whether you are safe or need assistance.`);
  const sourceZone = [...conn.db.zones.iter()].find(z => String(z.id) === zone.id);
  const disasterId = sourceZone?.disasterId;
  useEffect(() => {
    if (disasterId === undefined) return;
    const sub = conn.subscriptionBuilder().onError(ctx => setMessage(String(ctx.event))).subscribe(`SELECT * FROM exercise_replies(${disasterId})`);
    return () => sub.unsubscribe();
  }, [conn, disasterId]);
  const snapshot = useMemo(() => {
    void revision;
    const info = [...conn.db.scenarioInfo.iter()][0];
    const canReset = [...conn.db.dashboardState.iter()][0]?.canReset ?? false;
    const exercise = [...conn.db.exercises.iter()].find(e => e.disasterId === disasterId && e.runId === info?.runId);
    const homes = new Map(data.households.filter(h => (h.hotspotId ?? h.zoneId) === zone.id).map(h => [h.id, h]));
    const rows = [...conn.db.decisions.iter()].filter(r => homes.has(String(r.householdId))).sort((a, b) =>
      b.score - a.score || b.highestUrgency - a.highestUrgency ||
      (a.lastContactMicros === undefined ? b.lastContactMicros === undefined ? 0 : -1 : b.lastContactMicros === undefined ? 1 : a.lastContactMicros < b.lastContactMicros ? -1 : a.lastContactMicros > b.lastContactMicros ? 1 : 0) ||
      (a.householdId < b.householdId ? -1 : a.householdId > b.householdId ? 1 : 0));
    const replies = [...conn.db.exerciseReplies.iter()].filter(r => r.disasterId === disasterId && r.runId === info?.runId);
    const disaster = [...conn.db.disasters.iter()].find(d => d.id === disasterId);
    const activities = [...conn.db.activities.iter()].sort((a, b) => a.id > b.id ? -1 : a.id < b.id ? 1 : 0).slice(0, 15);
    return { info, canReset, exercise, homes, rows, replies, disaster, activities };
  }, [conn, data.households, zone.id, disasterId, revision]);
  const minute = snapshot.exercise?.minute ?? (snapshot.disaster?.phase === "response" ? 0 : -120);
  const after = minute >= 0, sent = after ? snapshot.exercise?.postSent : snapshot.exercise?.preSent;
  const current = snapshot.replies.filter(r => r.phase === (after ? "after" : "before"));
  const safe = current.filter(r => r.status === "safe").length, help = current.filter(r => r.status === "needs_help").length;
  const args = snapshot.info && disasterId !== undefined ? { disasterId, expectedRunId: snapshot.info.runId, expectedMinute: minute } : undefined;
  const rows = snapshot.rows.filter(r => (!onlyOverlooked || r.overlooked) && snapshot.homes.get(String(r.householdId))!.name.toLowerCase().includes(search.toLowerCase()));
  const actualPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 25) - 1));
  const selectedId = selection?.kind === "household" && snapshot.homes.has(selection.id) ? selection.id : rows[0]?.householdId.toString();
  const perform: Action = async (work, success) => {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await work(); setMessage(success); } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const routingRun = [...conn.db.responseRuns.iter()].find(r => String(r.zoneId) === zone.id && r.scenarioRunId === snapshot.info?.runId && r.status !== "reset");
  const welfare = [...conn.db.welfareVisits.iter()].filter(v => v.runId === routingRun?.id);
  const candidates = [...conn.db.teams.iter()].filter(t => t.status === "available" && t.capabilities.includes("welfare_check") && ![...conn.db.responseTeamStates.iter()].some(s => s.teamId === t.id) && ![...conn.db.assignments.iter()].some(a => a.teamId === t.id && ["assigned", "in_progress"].includes(a.status)));
  const [chosen, setChosen] = useState<string[]>([]), [routingApproved, setRoutingApproved] = useState(false);
  const [latitude, setLatitude] = useState(""), [longitude, setLongitude] = useState("");
  useEffect(() => {
    if (routingApproved && routingRun) router.push(`/response?run=${routingRun.id}&team=${[...conn.db.responseTeamStates.iter()].find(t => t.runId === routingRun.id)?.teamId ?? ""}`);
  }, [routingApproved, routingRun, conn, router]);
  const blocked = !snapshot.exercise?.postSent ? "Approve a fresh post-impact notice first." : sourceZone?.level !== "neighborhood" || snapshot.homes.size > 20 ? "Routing supports compact neighborhoods with at most 20 households." : candidates.length < 2 ? "Two available, unreserved welfare-capable teams are required." : "";
  return <section className="scenario-desk connected-desk" aria-label="Shared scenario desk">
    <div className="desk-heading"><div><p className="eyebrow">Shared household decisions</p><h2>{zone.name}</h2>
      <p className="muted small">{hazards[zone.hazard].label} · {snapshot.homes.size.toLocaleString()} households, including community assistance cases. Geographic membership is distinct from exposure.</p></div>
      <span className="simulation-badge">Connected · Synthetic run {snapshot.info?.runId.toString() ?? "loading"}</span></div>
    {(message || error) && <p className="scenario-status" role="status">{message || error}</p>}
    <div className="desk-grid"><article className="area-brief">
      <p className="eyebrow">Shared exercise clock</p><h3>{after ? `T + ${minute} minutes` : "T − 2 hours"}</h3>
      <p>Impact at T+0. Fresh post-impact replies are due at T+30. Switching areas or reloading preserves this shared exercise.</p>
      <label className="message-label" htmlFor="shared-notice">Review the simulated notice</label>
      <textarea id="shared-notice" rows={4} maxLength={2000} value={notice} onChange={e => setNotice(e.target.value)} disabled={busy || !!sent} />
      {after && !sent && <button className="text-button" onClick={() => setNotice(`Fresh post-impact simulated safety check-in for ${zone.name}. Earlier replies do not confirm current safety. Please report whether you are safe or need assistance.`)}>Use post-impact check-in wording</button>}
      <div className="scenario-buttons"><button className="primary-button" disabled={busy || !args || !!sent || !notice.trim()} onClick={() => args && perform(() => conn.reducers.approveExerciseNotice({ ...args, message: notice }), "Approved simulated notice recorded. No messages were delivered.")}>{sent ? "Notice approved · Simulated" : after ? "Approve fresh safety check-in" : "Approve preparation notice"}</button>
        <button className="outline-button" disabled={busy || !args || !sent || minute >= 30} onClick={() => args && perform(() => conn.reducers.advanceExerciseClock(args), after ? "Shared deadline reached; unanswered cases have welfare-review requests." : "Shared clock advanced to impact. Send a fresh safety check-in.")}>{after ? "Skip 30 min → Follow-up" : "Skip 2 hours → After impact"}</button></div>
      <p className="simulation-notice">Employee-controlled exercise. No notification delivery, AI generation, evacuation order, or automatic dispatch. Individual replies below are explicitly recorded as simulated.</p>
      {sent && <details><summary>Approved notice text</summary><p>{after ? snapshot.exercise?.postMessage : snapshot.exercise?.preMessage}</p></details>}
      <div className="response-totals"><div><strong>{safe}</strong><span>Safe this round</span></div><div><strong>{help}</strong><span>Need help</span></div><div><strong>{current.length - safe - help}</strong><span>{minute >= 30 ? "Reply overdue" : "Awaiting reply"}</span></div></div>
      <section aria-label="Area welfare routing"><h3>Welfare routing</h3><p>{help} help replies · {welfare.filter(v => v.priority === "unknown" && !["completed", "cancelled"].includes(v.state)).length} overdue checks · {welfare.filter(v => v.state === "completed").length} completed visits</p>
      {routingRun ? <a href={`/response?run=${routingRun.id}`}>Open area response</a> : <details><summary>Set up welfare routing</summary><p>Review {zone.name}: exactly two teams, at most 20 households. Approval reserves teams and starts paused. Eligible checks can subsequently enter the queue; an empty queue monitors new replies. Welfare outcomes do not resolve assistance requests.</p>{blocked && <p role="status">{blocked}</p>}
      <form onSubmit={e => { e.preventDefault(); setRoutingApproved(true); void perform(async () => { try { await conn.reducers.startResponseDemo({zoneId: BigInt(zone.id), teamIds: chosen.map(BigInt), stagingLatitude: Number(latitude), stagingLongitude: Number(longitude)}); } catch (error) { if (![...conn.db.responseRuns.iter()].some(r => String(r.zoneId) === zone.id && r.scenarioRunId === snapshot.info?.runId && r.status !== "reset")) { setRoutingApproved(false); throw error; } } }, "Waiting for subscribed area run…"); }}>
      {candidates.map(t => <label key={String(t.id)}><input type="checkbox" checked={chosen.includes(String(t.id))} onChange={e => setChosen(v => e.target.checked ? [...v, String(t.id)] : v.filter(id => id !== String(t.id)))} />{t.name}</label>)}
      <label>Staging latitude<input required type="number" step="any" min={-90} max={90} value={latitude} onChange={e => setLatitude(e.target.value)} /></label><label>Staging longitude<input required type="number" step="any" min={-180} max={180} value={longitude} onChange={e => setLongitude(e.target.value)} /></label>
      <button disabled={busy || !!blocked || chosen.length !== 2}>Approve paused welfare exercise</button></form></details>}
      {welfare.map(v => <p key={String(v.id)}>{snapshot.homes.get(String(v.householdId))?.name}: {label(v.state)}{v.outcome && ` · ${v.outcome}`}{v.notice && ` · ${v.notice}`}</p>)}</section>
      <details><summary>Recent shared activity</summary><ol>{snapshot.activities.map(a => <li key={String(a.id)}>{a.timestamp.toDate().toLocaleString()} · {a.summary}</li>)}</ol></details>
      {snapshot.canReset && <details><summary>Reset entire synthetic dataset</summary><p>Replaces all operational records for everyone and starts a new run. Enrolled employees can reset the demo. Access and activity history are preserved.</p>
        <label>Type RESET SYNTHETIC DEMO<input value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
        <button className="outline-button" disabled={busy || confirmation !== "RESET SYNTHETIC DEMO"} onClick={() => perform(async () => { await conn.reducers.resetDemo({ confirmation }); setConfirmation(""); }, "Dataset reset in a new run.")}>Reset synthetic dataset</button></details>}
    </article><article className="checkin-workspace">
      <div className="panel-heading"><h3>Priority and follow-through</h3><button className="text-button" disabled={busy} onClick={() => perform(() => conn.reducers.refreshDecisionSnapshot({}), "Authoritative decisions refreshed.")}>Refresh</button></div>
      <label>Find household<input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Household name" /></label>
      <label className="overlooked-filter"><input type="checkbox" checked={onlyOverlooked} onChange={e => { setOnlyOverlooked(e.target.checked); setPage(0); }} /> Overlooked only</label>
      <p className="small muted">{rows.length.toLocaleString()} matching / {snapshot.rows.length.toLocaleString()} evaluated in this area. Demo scores support employee review.</p>
      <div className="priority-list">{rows.slice(actualPage * 25, actualPage * 25 + 25).map(r => <button key={String(r.householdId)} className="review-row" aria-pressed={selectedId === String(r.householdId)} onClick={() => onSelect({ kind: "household", id: String(r.householdId) })}>
        <span className="review-row-copy"><strong>{snapshot.homes.get(String(r.householdId))!.name}</strong><small>{r.highestSeverity} exposure{r.overlooked ? " · Overlooked" : ""}</small></span><strong>Score {r.score}</strong></button>)}</div>
      {!rows.length && <p>No households match this filter.</p>}
      <div className="list-pagination"><button disabled={!actualPage} onClick={() => setPage(actualPage - 1)}>Previous</button><span>Page {actualPage + 1} of {Math.max(1, Math.ceil(rows.length / 25))}</span><button disabled={(actualPage + 1) * 25 >= rows.length} onClick={() => setPage(actualPage + 1)}>Next</button></div>
      {selectedId && <CaseActions key={`${selectedId}:${snapshot.info?.runId}`} conn={conn} householdId={BigInt(selectedId)} name={snapshot.homes.get(selectedId)!.name}
        revision={revision} exerciseArgs={args} roundSent={!!sent} replies={snapshot.replies.filter(r => String(r.householdId) === selectedId).map(r => `${r.phase === "before" ? "Before" : "After"} impact: ${label(r.status)}`)} busy={busy} perform={perform} />}
    </article></div>
  </section>;
}

function CaseActions({ conn, householdId, name, revision, exerciseArgs, roundSent, replies, busy, perform }: {
  conn: DbConnection; householdId: bigint; name: string; revision: number;
  exerciseArgs?: { disasterId: bigint; expectedRunId: bigint; expectedMinute: number }; roundSent: boolean; replies: string[]; busy: boolean; perform: Action;
}) {
  const [error, setError] = useState(""), [requestId, setRequestId] = useState("");
  const [need, setNeed] = useState("welfare_check"), [people, setPeople] = useState(1), [urgency, setUrgency] = useState(3);
  useEffect(() => {
    const sub = conn.subscriptionBuilder().onError(ctx => setError(String(ctx.event))).subscribe(`SELECT * FROM household_decisions(${householdId})`);
    return () => sub.unsubscribe();
  }, [conn, householdId]);
  const detail = useMemo(() => { void revision; const row = [...conn.db.householdDecisions.iter()].find(r => r.householdId === householdId); return row ? JSON.parse(row.payload) as Detail : undefined; }, [conn, householdId, revision]);
  if (error) return <p role="alert">{error}</p>;
  if (!detail) return <p role="status">Loading selected household decisions…</p>;
  const tasks = [...conn.db.tasks.iter()].filter(t => t.householdId === householdId);
  const assignments = [...conn.db.assignments.iter()];
  return <div className="connected-case"><h3>{name} · Score {detail.score}</h3><p>{detail.contactExplanation}</p>
    <ul>{detail.concerns.map(c => <li key={c.code}>{c.explanation}</li>)}</ul>
    <details><summary>Why this score and exposure?</summary><ul>{detail.reasons.map(r => <li key={r.factor}>+{r.points}: {r.explanation}</li>)}</ul>
      <ul>{detail.exposureEvidence.map(e => <li key={e.layerId}>{label(e.hazardType)} · {label(e.component)} · {e.severity} · {e.source}</li>)}</ul></details>
    <p className="small muted">{replies.join(" · ") || "No exercise replies recorded."}</p>
    <div className="reply-actions">{["safe", "needs_help"].map(status => <button key={status} disabled={busy || !roundSent || !exerciseArgs} onClick={() => exerciseArgs && perform(() => conn.reducers.recordExerciseReply({ ...exerciseArgs, householdId, status }), "Simulated reply recorded; assistance remains separate.")}>Simulate reply: {label(status)}</button>)}
      <button disabled={busy} onClick={() => perform(() => conn.reducers.recordOutreach({ householdId }), "Simulated contact recorded.")}>Record contact</button></div>
    <h4>Preparedness · Employee review</h4>
    {detail.preparation.suggestions.map(s => <article className="suggestion" key={s.recommendationId}><strong>{s.title}</strong><p>{s.description}</p><ul>{s.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
      <a href={s.guidanceUrl} target="_blank" rel="noreferrer">Public guidance</a> <small>Catalog review: {s.guidanceCheckedOn}</small>
      <button className="outline-button" disabled={busy} onClick={() => perform(() => conn.reducers.approvePreparedness({ householdId, recommendationId: s.recommendationId, expectedRunId: BigInt(detail.runId) }), "Preparedness task approved.")}>Approve task</button></article>)}
    {!detail.preparation.suggestions.length && <p>No new suggestions for this exposure, phase, and task history.</p>}
    {!!detail.preparation.suppressed.length && <p>{detail.preparation.suppressed.length} recommendation(s) already have tasks this run.</p>}
    {tasks.map(t => <div className="case-action" key={String(t.id)}><span>{label(t.recommendationId || t.actionType)} · {label(t.status)}</span>{t.status !== "completed" && <button disabled={busy} onClick={() => perform(() => conn.reducers.updateTask({ taskId: t.id, status: "completed" }), "Task completed.")}>Complete task</button>}</div>)}
    <h4>Assistance requests</h4>{detail.requests.map(r => {
      const a = assignments.find(a => String(a.requestId) === r.id && ["assigned", "in_progress"].includes(a.status));
      return <article className="suggestion" key={r.id}><strong>{label(r.needType)}</strong> · {r.people} people · urgency {r.urgency}/5 · {label(r.status)}
        {r.status === "open" && <div className="reply-actions"><button onClick={() => setRequestId(r.id)}>Recommend teams</button><button disabled={busy} onClick={() => perform(() => conn.reducers.resolveRequest({ requestId: BigInt(r.id) }), "Unassigned request resolved.")}>Resolve request</button></div>}
        {a && <div className="reply-actions">{a.status === "assigned" && <button disabled={busy} onClick={() => perform(() => conn.reducers.updateAssignment({ assignmentId: a.id, status: "in_progress" }), "Assistance started.")}>Start</button>}
          <button disabled={busy} onClick={() => perform(() => conn.reducers.updateAssignment({ assignmentId: a.id, status: "completed" }), "Assistance completed; team released.")}>Complete assistance</button>
          <button disabled={busy} onClick={() => perform(() => conn.reducers.updateAssignment({ assignmentId: a.id, status: "cancelled" }), "Assignment cancelled; team released.")}>Cancel</button></div>}</article>;
    })}
    {requestId && detail.requests.some(r => r.id === requestId) && <RequestTeams key={requestId} conn={conn} requestId={BigInt(requestId)} revision={revision} busy={busy} perform={perform} />}
    <form className="request-form" onSubmit={e => { e.preventDefault(); void perform(() => conn.reducers.createRequest({ householdId, needType: need, urgency, people }), "Assistance request recorded."); }}>
      <h4>Record a help request</h4><label>Need<select value={need} onChange={e => setNeed(e.target.value)}>{["food", "water", "shelter", "welfare_check", "evacuation", "claims_support", "fire_smoke_support", "winter_weather_support"].map(n => <option key={n} value={n}>{label(n)}</option>)}</select></label>
      <label>People<input type="number" min={1} required value={people} onChange={e => setPeople(Number(e.target.value))} /></label><label>Urgency (1–5)<input type="number" min={1} max={5} required value={urgency} onChange={e => setUrgency(Number(e.target.value))} /></label>
      <button className="outline-button" disabled={busy}>Create request</button></form>
  </div>;
}

function RequestTeams({ conn, requestId, revision, busy, perform }: { conn: DbConnection; requestId: bigint; revision: number; busy: boolean; perform: Action }) {
  const [error, setError] = useState("");
  useEffect(() => { const sub = conn.subscriptionBuilder().onError(ctx => setError(String(ctx.event))).subscribe(`SELECT * FROM team_recommendations(${requestId})`); return () => sub.unsubscribe(); }, [conn, requestId]);
  const report = useMemo(() => { void revision; const row = [...conn.db.teamRecommendations.iter()].find(r => r.requestId === requestId); return row ? JSON.parse(row.payload) as TeamReport : undefined; }, [conn, requestId, revision]);
  if (error) return <p role="alert">{error}</p>;
  if (!report) return <p>Loading recommendations…</p>;
  return <section className="team-recommendations"><h4>Review suitable teams</h4><p>Straight-line distance; approximate ETA assumes 30 km/h. Routes are not verified.</p>
    {report.requestBlockReasons.map(r => <p key={r.explanation}>{r.explanation}</p>)}<p>{report.eligibleTeamCount} eligible / {report.excludedTeamCount} excluded.</p>
    {report.recommendations.map(t => <article className="suggestion" key={t.teamId}><strong>{t.name}</strong><p>{t.distanceKm.toFixed(1)} km · approximately {Math.ceil(t.approximateEtaMinutes)} minutes</p>
      <ul>{t.reasons.map(r => <li key={r}>{r}</li>)}</ul><button className="outline-button" disabled={busy} onClick={() => perform(() => conn.reducers.assignTeam({ requestId, teamId: BigInt(t.teamId) }), "Employee-selected team assigned; current capacity revalidated.")}>Approve assignment</button></article>)}
    <details><summary>Exclusion reasons</summary><p>{Object.entries(report.exclusionCounts).map(([code, n]) => `${label(code)}: ${n}`).join(" · ")}. Reasons can overlap.</p></details>
  </section>;
}
