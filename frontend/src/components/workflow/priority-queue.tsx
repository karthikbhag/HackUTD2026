"use client";

import { useEffect, useMemo, useState } from "react";
import type { OperationalRows } from "@/lib/map/backend-data";
import { hazards, type Hazard, type Selection } from "@/lib/map/types";
import { buildPriorityQueue, type PriorityQueue as Queue, type QueueItem } from "@/lib/workflow/priority-queue";
import type { WorkflowActions } from "./actions";

type View = "follow_up" | "overlooked" | "all";
const PAGE = 25;
const hazardTypes = Object.keys(hazards) as Hazard[];
const CONTACT_LABEL: Record<QueueItem["contactState"], string> = { never_contacted: "Never contacted", overdue: "Contact overdue", recent: "Recently contacted" };

/** Re-evaluates time-based rules (contact age, overdue) without a backend change. */
// The clock is read only in effects: Cache Components prerenders "/" and rejects Date.now() during render.
function useNowMicros(intervalMs = 30_000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [intervalMs]);
  return now === null ? null : BigInt(now) * 1000n;
}

export function PriorityQueue({ rows, connected, busy, selection, onSelect, actions, run }: {
  rows: OperationalRows | undefined; connected: boolean; busy: boolean;
  selection: Selection; onSelect?: (selection: Selection) => void;
  actions: WorkflowActions; run: (label: string, action: () => Promise<void>, success?: string) => Promise<boolean>;
}) {
  const now = useNowMicros();
  const [view, setView] = useState<View>("follow_up");
  const [hazard, setHazard] = useState<Hazard | "all">("all");
  const [limit, setLimit] = useState(PAGE);

  const result = useMemo((): { queue: Queue } | { error: string } | null => {
    if (!rows || now === null) return null;
    try { return { queue: buildPriorityQueue(rows, now) }; }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }, [rows, now]);

  const queue = result && "queue" in result ? result.queue : null;
  const byHazard = queue ? queue.items.filter(item => hazard === "all" || item.hazard === hazard) : [];
  const counts = { follow_up: byHazard.filter(i => i.needsFollowUp).length, overlooked: byHazard.filter(i => i.overlooked).length, all: byHazard.length };
  const shown = byHazard.filter(item => view === "all" || (view === "overlooked" ? item.overlooked : item.needsFollowUp));

  const select = (item: QueueItem) => {
    onSelect?.({ kind: "household", id: item.householdId });
    document.querySelector(".map-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return <div className="workflow-card queue">
    <div className="queue-header">
      <div><h3>Priority queue</h3><p className="queue-label">Demo scoring — employee review required</p></div>
      {queue && <span className="muted small">{counts.overlooked} overlooked · {counts.follow_up} need follow-up · {counts.all} households</span>}
    </div>

    <div className="queue-filters">
      <div className="queue-views" role="group" aria-label="Queue view">
        {([["follow_up", "Needs follow-up"], ["overlooked", "Overlooked"], ["all", "All households"]] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={view === value} onClick={() => { setView(value); setLimit(PAGE); }}>{label} <small>{counts[value]}</small></button>)}
      </div>
      <label className="workflow-field compact">Hazard
        <select value={hazard} onChange={event => { setHazard(event.target.value as Hazard | "all"); setLimit(PAGE); }}>
          <option value="all">All hazards</option>
          {hazardTypes.map(type => <option key={type} value={type}>{hazards[type].label}</option>)}
        </select>
      </label>
    </div>

    {!rows && <p className="muted small">The queue appears once operational data is connected.</p>}
    {result && "error" in result && <p className="queue-error" role="alert">Queue unavailable: {result.error}</p>}
    {queue && !shown.length && <p className="muted small">{view === "overlooked" ? "No overlooked households for this filter." : "No households match this filter."}</p>}

    {queue && shown.length > 0 && <ol className="queue-list">
      {shown.slice(0, limit).map(item => {
        const selected = selection?.kind === "household" && selection.id === item.householdId;
        return <li key={item.householdId} className={`queue-item${selected ? " selected" : ""}${item.overlooked ? " overlooked" : ""}`}>
          <div className="queue-score" aria-label={`Score ${item.score} of ${queue.maxScore}`}><strong>{item.score}</strong><small>/ {queue.maxScore}</small></div>
          <div className="queue-body">
            <div className="queue-title">
              <button type="button" className="queue-name" onClick={() => select(item)} aria-pressed={selected}>{item.name}</button>
              {item.hazard && <span className="queue-tag" style={{ color: hazards[item.hazard].color }}>{hazards[item.hazard].label}</span>}
              <span className="queue-tag">{item.zoneName}</span>
              <span className={`queue-tag check-${item.checkIn}`}>{item.checkIn.replace("_", " ")}</span>
              {item.overlooked && <span className="queue-tag flag">Overlooked</span>}
            </div>
            <p className="muted small">{CONTACT_LABEL[item.contactState]}. {item.contactExplanation}</p>
            {item.concerns.length > 0 && <ul className="queue-concerns">{item.concerns.map(c => <li key={c.code}>{c.explanation}</li>)}</ul>}
            <details>
              <summary>Why this score</summary>
              <ul className="queue-reasons">{item.reasons.map(r => <li key={r.factor} className={r.points ? "" : "zero"}><strong>+{r.points}</strong> {r.explanation}</li>)}</ul>
            </details>
          </div>
          <div className="queue-actions">
            <button type="button" className="workflow-button secondary" onClick={() => select(item)}>Show on map</button>
            <button type="button" className="workflow-button" disabled={!connected || busy}
              onClick={() => run(`Mark ${item.name} contacted`, () => actions.recordOutreach(item.householdId), `${item.name} marked contacted (simulated outreach).`)}>Mark contacted</button>
          </div>
        </li>;
      })}
    </ol>}
    {queue && shown.length > limit && <button type="button" className="workflow-button secondary" onClick={() => setLimit(value => value + PAGE)}>Show {Math.min(PAGE, shown.length - limit)} more ({shown.length - limit} hidden)</button>}

    {queue && <small className="queue-note">{queue.label}. {queue.exposureNote} Overlooked = an unresolved concern plus missing or overdue contact (6 h standard, 1 h urgent). Scores rank attention only; they do not dispatch teams or close requests. A household hidden by the map&apos;s hazard layers cannot be highlighted until that layer is shown.</small>}
  </div>;
}
