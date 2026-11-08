"use client";

import { useEffect, useMemo, useState } from "react";
import { DbConnection, tables } from "@/module_bindings";

type Detail = {
  householdId: string; runId: string; score: number; overlooked: boolean; needsFollowUp: boolean;
  computedAt: string; contactExplanation: string;
  reasons: { factor: string; points: number; explanation: string }[];
  concerns: { code: string; explanation: string }[];
  exposureEvidence: { layerId: string; hazardType: string; component: string; severity: string; source: string }[];
  preparation: { suggestions: { recommendationId: string; title: string; description: string; guidanceUrl: string; reasons: string[] }[]; suppressed: { recommendationId: string; reason: string }[] };
  requests: { id: string; needType: string; people: number; urgency: number; status: string }[];
};
type Recommendations = { requestBlockReasons: { explanation: string }[]; eligibleTeamCount: number; excludedTeamCount: number;
  recommendations: { teamId: string; name: string; distanceKm: number; approximateEtaMinutes: number; reasons: string[] }[];
  exclusionCounts: Record<string, number>; excludedTeams: { teamId: string; name: string; reasons: { explanation: string }[] }[];
};
const needs = ["food", "water", "shelter", "welfare_check", "evacuation", "claims_support", "fire_smoke_support", "winter_weather_support"];
const label = (value: string) => value.replaceAll("_", " ");

function useRevision(conn: DbConnection) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let queued = false, disposed = false;
    const changed = () => { if (queued || disposed) return; queued = true; queueMicrotask(() => { queued = false; if (!disposed) setRevision(v => v + 1); }); };
    const handles = [conn.db.decisions, conn.db.scenarioInfo, conn.db.households, conn.db.requests, conn.db.tasks, conn.db.assignments,
      conn.db.disasters, conn.db.activities, conn.db.householdDecisions, conn.db.teamRecommendations];
    for (const table of handles) { table.onInsert(changed); table.onDelete(changed); table.onUpdate(changed); }
    const subscription = conn.subscriptionBuilder().onApplied(changed).subscribe([tables.decisions, tables.scenarioInfo, tables.activities]);
    return () => { disposed = true; subscription.unsubscribe(); for (const table of handles) { table.removeOnInsert(changed); table.removeOnDelete(changed); table.removeOnUpdate(changed); } };
  }, [conn]);
  return revision;
}

export function OperationalPanel({ conn }: { conn: DbConnection }) {
  const revision = useRevision(conn);
  const [selected, setSelected] = useState<string>("");
  const [overlookedOnly, setOverlookedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [hazard, setHazard] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const snapshot = useMemo(() => {
    void revision;
    return { homes: new Map([...conn.db.households.iter()].map(h => [h.id.toString(), h])),
      rows: [...conn.db.decisions.iter()].sort((a, b) => b.score - a.score || b.highestUrgency - a.highestUrgency ||
        (a.lastContactMicros === undefined ? (b.lastContactMicros === undefined ? 0 : -1) : b.lastContactMicros === undefined ? 1 : a.lastContactMicros < b.lastContactMicros ? -1 : a.lastContactMicros > b.lastContactMicros ? 1 : 0) || (a.householdId < b.householdId ? -1 : 1)),
      info: [...conn.db.scenarioInfo.iter()][0], disasters: [...conn.db.disasters.iter()], activities: [...conn.db.activities.iter()].slice().sort((a, b) => a.timestamp.microsSinceUnixEpoch > b.timestamp.microsSinceUnixEpoch ? -1 : 1).slice(0, 12) };
  }, [conn, revision]);
  const rows = snapshot.rows.filter(row => (!overlookedOnly || row.overlooked) && (!search || snapshot.homes.get(row.householdId.toString())?.displayName.toLowerCase().includes(search.toLowerCase())));
  const actualPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 25) - 1));
  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage("");
    try { await action(); setMessage(success); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <div className="operations">
    <div className="operations-heading"><div><p className="eyebrow">Employee coordination</p><h2>Priority and follow-through</h2>
      <p>Demo rules support employee decisions. Outreach is recorded as simulated; no messages are sent.</p></div>
      <button disabled={busy} onClick={() => perform(() => conn.reducers.refreshDecisionSnapshot({}), "Decision snapshot refreshed.")}>Refresh decisions</button></div>
    <p>{snapshot.info ? `Run ${snapshot.info.runId} · Updated ${snapshot.info.evaluatedAt.toDate().toLocaleString()}` : "No decision run yet. Refresh existing data or ask an administrator to seed the scenario."}</p>
    {message && <p role="status" className="operation-message">{message}</p>}
    <div className="operations-grid"><section aria-label="Priority queue">
      <label>Find household <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Household name" /></label>
      <label><input type="checkbox" checked={overlookedOnly} onChange={e => { setOverlookedOnly(e.target.checked); setPage(0); }} /> Show overlooked only</label>
      <p>{rows.length.toLocaleString()} matching / {snapshot.rows.length.toLocaleString()} evaluated households</p>
      <ol className="priority-list">{rows.slice(actualPage * 25, actualPage * 25 + 25).map(row => <li key={row.householdId.toString()}>
        <button aria-pressed={selected === row.householdId.toString()} onClick={() => setSelected(row.householdId.toString())}>
          <strong>{snapshot.homes.get(row.householdId.toString())?.displayName ?? `Household ${row.householdId}`}</strong>
          <span>Score {row.score} · {row.highestSeverity === "none" ? "No matching exposure" : `${row.highestSeverity} exposure`}{row.overlooked ? " · Overlooked" : ""}</span>
        </button></li>)}</ol>
      {!rows.length && <p>No households match this filter.</p>}
      <div className="list-pagination"><button disabled={actualPage === 0} onClick={() => setPage(actualPage - 1)}>Previous</button>
        <span>Page {actualPage + 1} of {Math.max(1, Math.ceil(rows.length / 25))}</span><button disabled={(actualPage + 1) * 25 >= rows.length} onClick={() => setPage(actualPage + 1)}>Next</button></div>
    </section><section aria-label="Household operations">
      {selected && snapshot.homes.has(selected) ? <HouseholdOperations key={`${selected}:${snapshot.info?.runId}`} conn={conn} householdId={BigInt(selected)}
        revision={revision} name={snapshot.homes.get(selected)!.displayName} busy={busy} perform={perform} /> : <p>Select a household to inspect its score, concerns, suggestions, and assistance.</p>}
    </section></div>
    {snapshot.info?.canManageScenario && <details className="scenario-controls"><summary>Manage synthetic scenario</summary>
      <label>Disaster <select value={hazard} onChange={e => setHazard(e.target.value)}><option value="">Choose a disaster</option>{snapshot.disasters.map(d => <option key={d.id.toString()} value={d.id.toString()}>{d.name} · {d.phase}</option>)}</select></label>
      <button disabled={busy || !hazard} onClick={() => perform(() => conn.reducers.escalateScenario({ disasterId: BigInt(hazard) }), "Selected hazard escalated; decisions refreshed.")}>Escalate selected hazard</button>
      <p>Reset replaces synthetic operational records and starts a new run. Employee access and activity history are preserved.</p>
      <label>Type RESET SYNTHETIC DEMO <input value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      <button disabled={busy || confirmation !== "RESET SYNTHETIC DEMO"} onClick={() => perform(async () => { await conn.reducers.resetDemo({ confirmation }); setConfirmation(""); }, "Scenario reset to its seeded baseline in a new run.")}>Reset synthetic scenario</button>
    </details>}
    <details><summary>Recent activity</summary><ul>{snapshot.activities.map(a => <li key={a.id.toString()}>{a.timestamp.toDate().toLocaleString()} · {label(a.action)} · {a.summary}</li>)}</ul></details>
  </div>;
}

function HouseholdOperations({ conn, householdId, revision, name, busy, perform }: {
  conn: DbConnection; householdId: bigint; revision: number; name: string; busy: boolean;
  perform: (action: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  const [need, setNeed] = useState("welfare_check"), [people, setPeople] = useState(1), [urgency, setUrgency] = useState(3);
  useEffect(() => {
    const subscription = conn.subscriptionBuilder().onError(ctx => setError(String(ctx.event))).subscribe(`SELECT * FROM household_decisions(${householdId})`);
    return () => subscription.unsubscribe();
  }, [conn, householdId]);
  const detail = useMemo(() => {
    void revision;
    const row = [...conn.db.householdDecisions.iter()].find(r => r.householdId === householdId);
    return row ? JSON.parse(row.payload) as Detail : undefined;
  }, [conn, householdId, revision]);
  const tasks = [...conn.db.tasks.iter()].filter(t => t.householdId === householdId);
  const assignments = [...conn.db.assignments.iter()];
  if (error) return <p role="alert">{error}</p>;
  if (!detail) return <p role="status">Loading household decisions…</p>;
  return <div className="household-operations"><h3>{name}</h3>
    <p><strong>Score {detail.score}</strong>{detail.overlooked ? " · Overlooked contact" : ""} · {detail.needsFollowUp ? "Follow-up concerns remain" : "No qualifying follow-up concerns"}</p>
    <p>{detail.contactExplanation}</p><ul>{detail.concerns.map(c => <li key={c.code}>{c.explanation}</li>)}</ul>
    <details><summary>Why this score and exposure?</summary><ul>{detail.reasons.map(r => <li key={r.factor}><strong>+{r.points}</strong> {r.explanation}</li>)}</ul>
      <ul>{detail.exposureEvidence.map(e => <li key={e.layerId}>{label(e.hazardType)} · {label(e.component)} · {e.severity} · {e.source}</li>)}</ul></details>
    <div className="action-row"><button disabled={busy} onClick={() => perform(() => conn.reducers.recordOutreach({ householdId }), "Simulated contact recorded; follow-up flags refreshed.")}>Record contact</button>
      <label>Check-in <select defaultValue="" disabled={busy} onChange={e => { if (e.target.value) void perform(() => conn.reducers.updateCheckIn({ householdId, status: e.target.value }), "Check-in updated; assistance requests remain separate."); }}>
        <option value="" disabled>Update status</option>{["unknown", "safe", "needs_help", "urgent"].map(s => <option key={s} value={s}>{label(s)}</option>)}</select></label></div>
    <h4>Preparedness suggestions</h4><p>Review each suggestion before approving an operational task.</p>
    {detail.preparation.suggestions.map(s => <article key={s.recommendationId} className="suggestion"><strong>{s.title}</strong><p>{s.description}</p>
      <ul>{s.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul><a href={s.guidanceUrl} target="_blank" rel="noreferrer">Public guidance</a>{" "}
      <button disabled={busy} onClick={() => perform(() => conn.reducers.approvePreparedness({ householdId, recommendationId: s.recommendationId, expectedRunId: BigInt(detail.runId) }), "Preparedness task approved.")}>Approve task</button></article>)}
    {!detail.preparation.suggestions.length && <p>No new preparedness suggestions for the current exposure, phase, and task history.</p>}
    {detail.preparation.suppressed.length > 0 && <p>{detail.preparation.suppressed.length} suggestion(s) already have tasks in this run.</p>}
    <h4>Tasks</h4>{tasks.map(t => <div className="action-row" key={t.id.toString()}><span>{label(t.recommendationId || t.actionType)} · {label(t.status)}</span>
      {t.status !== "completed" && <button disabled={busy} onClick={() => perform(() => conn.reducers.updateTask({ taskId: t.id, status: "completed" }), "Task completed.")}>Complete task</button>}</div>)}
    <h4>Assistance requests</h4>{detail.requests.map(r => {
      const assignment = assignments.find(a => a.requestId.toString() === r.id && ["assigned", "in_progress"].includes(a.status));
      return <article key={r.id}><strong>{label(r.needType)}</strong> · {r.people} people · urgency {r.urgency}/5 · {label(r.status)}
        {r.status === "open" && <div className="action-row"><button onClick={() => setRequestId(r.id)}>Recommend teams</button><button disabled={busy} onClick={() => perform(() => conn.reducers.resolveRequest({ requestId: BigInt(r.id) }), "Unassigned assistance request resolved.")}>Resolve request</button></div>}
        {assignment && <div className="action-row">{assignment.status === "assigned" && <button disabled={busy} onClick={() => perform(() => conn.reducers.updateAssignment({ assignmentId: assignment.id, status: "in_progress" }), "Assignment started.")}>Start assistance</button>}
          <button disabled={busy} onClick={() => perform(() => conn.reducers.updateAssignment({ assignmentId: assignment.id, status: "completed" }), "Assistance completed; team released.")}>Complete assistance</button>
          <button disabled={busy} onClick={() => perform(() => conn.reducers.updateAssignment({ assignmentId: assignment.id, status: "cancelled" }), "Assignment cancelled; request reopened and team released.")}>Cancel assignment</button></div>}
      </article>;
    })}
    {requestId && <RequestTeams key={requestId} conn={conn} requestId={BigInt(requestId)} revision={revision} busy={busy} perform={perform} />}
    <form onSubmit={e => { e.preventDefault(); void perform(() => conn.reducers.createRequest({ householdId, needType: need, urgency, people }), "Assistance request created."); }}>
      <h4>Record a help request</h4><label>Need <select value={need} onChange={e => setNeed(e.target.value)}>{needs.map(n => <option key={n} value={n}>{label(n)}</option>)}</select></label>
      <label>People <input type="number" min={1} max={10000} required value={people} onChange={e => setPeople(Number(e.target.value))} /></label>
      <label>Urgency (1–5) <input type="number" min={1} max={5} required value={urgency} onChange={e => setUrgency(Number(e.target.value))} /></label><button disabled={busy}>Create request</button>
    </form>
  </div>;
}

function RequestTeams({ conn, requestId, revision, busy, perform }: { conn: DbConnection; requestId: bigint; revision: number; busy: boolean;
  perform: (action: () => Promise<unknown>, success: string) => Promise<void> }) {
  const [error, setError] = useState("");
  useEffect(() => { const handle = conn.subscriptionBuilder().onError(ctx => setError(String(ctx.event))).subscribe(`SELECT * FROM team_recommendations(${requestId})`); return () => handle.unsubscribe(); }, [conn, requestId]);
  const report = useMemo(() => { void revision; const row = [...conn.db.teamRecommendations.iter()].find(r => r.requestId === requestId); return row ? JSON.parse(row.payload) as Recommendations : undefined; }, [conn, requestId, revision]);
  if (error) return <p role="alert">{error}</p>;
  if (!report) return <p>Loading team recommendations…</p>;
  return <section className="team-recommendations"><h4>Recommended teams</h4><p>Straight-line distance and approximate ETA at 30 km/h. This is not a verified road route.</p>
    {report.requestBlockReasons.map(r => <p key={r.explanation}>{r.explanation}</p>)}
    <p>{report.eligibleTeamCount} eligible / {report.excludedTeamCount} excluded teams</p>
    {report.recommendations.map(t => <article key={t.teamId}><strong>{t.name}</strong><p>{t.distanceKm.toFixed(1)} km · approximately {Math.ceil(t.approximateEtaMinutes)} minutes</p>
      <ul>{t.reasons.map(r => <li key={r}>{r}</li>)}</ul><button disabled={busy} onClick={() => perform(() => conn.reducers.assignTeam({ requestId, teamId: BigInt(t.teamId) }), "Team assigned after employee review.")}>Assign this team</button></article>)}
    <details><summary>Why other teams were excluded</summary><p>{Object.entries(report.exclusionCounts).map(([reason, count]) => `${label(reason)}: ${count}`).join(" · ")}. Reasons may overlap.</p>
      <ul>{report.excludedTeams.slice(0, 25).map(t => <li key={t.teamId}>{t.name}: {t.reasons.map(r => r.explanation).join(" ")}</li>)}</ul>{report.excludedTeams.length > 25 && <p>Showing 25 of {report.excludedTeams.length} exclusions.</p>}</details>
  </section>;
}
