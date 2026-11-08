"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { displayTime, type MapData, type MapZone, type Phase } from "@/lib/map/types";
import { buildAreaSnapshot, snapshotFingerprint, type AreaReviewError, type AreaReviewResult, type AreaSnapshot } from "@/lib/ai/area-review";
import { AiAreaChat } from "./ai-area-chat";

type State =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | { status: "success"; key: string; result: AreaReviewResult; fingerprint: string; snapshot: AreaSnapshot }
  | { status: "error"; key: string; code: string; message: string };

/**
 * AI review section of the area popup. Generates only when the employee clicks,
 * from a small snapshot of this area's evidence. Text only: it never sends
 * notifications, dispatches teams, or changes records, and never affects priority scores.
 */
export function AiAreaReview({ data, zone, phase }: { data: MapData; zone: MapZone; phase: Phase }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [guidanceIndex, setGuidanceIndex] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  // A result belongs to one area and phase; anything else is hidden, never shown under another area.
  const key = `${zone.id}:${phase}`;
  const fingerprint = useMemo(() => snapshotFingerprint(buildAreaSnapshot(data, zone, phase, "")), [data, zone, phase]);
  const current = state.status !== "idle" && state.key === key ? state : { status: "idle" as const };

  // Cancel an in-flight request when the area or phase changes, or the popup closes.
  useEffect(() => () => { controller.current?.abort(); }, [key]);

  async function generate() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const id = ++sequence.current;
    const requestKey = key;
    const snapshot = buildAreaSnapshot(data, zone, phase, new Date().toISOString());
    const requestFingerprint = snapshotFingerprint(snapshot);
    setState({ status: "loading", key: requestKey });
    let next: State;
    try {
      const response = await fetch("/api/area-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot), signal: abort.signal });
      const body = await response.json().catch(() => null) as AreaReviewResult | AreaReviewError | null;
      if (response.ok && body && "review" in body && body.areaId === snapshot.areaId && body.phase === snapshot.phase) next = { status: "success", key: requestKey, result: body, fingerprint: requestFingerprint, snapshot };
      else if (body && "error" in body) next = { status: "error", key: requestKey, code: body.error.code, message: body.error.message };
      else next = { status: "error", key: requestKey, code: "upstream_error", message: `AI review failed (HTTP ${response.status}).` };
    } catch (error) {
      // Aborted by a newer request or a selection change: clear this request's loading state quietly.
      if (abort.signal.aborted) { if (id === sequence.current) setState({ status: "idle" }); return; }
      next = { status: "error", key: requestKey, code: "network", message: error instanceof Error ? `Could not reach the AI review route: ${error.message}` : "Could not reach the AI review route." };
    }
    // Ignore responses that arrive after a newer request or a selection change.
    if (id !== sequence.current || abort.signal.aborted) return;
    setState(next);
  }

  const guidance = phase === "after" ? zone.response : zone.preparation;
  const loading = current.status === "loading";
  // Unchanged evidence would only return the same (cached) review, so regenerating is offered only after data changes.
  const upToDate = current.status === "success" && current.fingerprint === fingerprint;

  return <div className="ai-review" aria-live="polite" aria-busy={loading}>
    {current.status === "success" ? <ReviewBody result={current.result} stale={current.fingerprint !== fingerprint}/> : <>
      <span className="tag">Scenario guidance</span>
      <h4>{phase === "after" ? "What needs attention now" : "What could happen here"}</h4>
      <p>{guidance[Math.min(guidanceIndex, Math.max(0, guidance.length - 1))] || "Review the source before planning outreach."}</p>
      {guidance.length > 1 && <div className="brief-page-controls"><button disabled={guidanceIndex === 0} onClick={() => setGuidanceIndex(guidanceIndex - 1)}>Previous</button><span>{guidanceIndex + 1} of {guidance.length}</span><button disabled={guidanceIndex + 1 >= guidance.length} onClick={() => setGuidanceIndex(guidanceIndex + 1)}>Next</button></div>}
    </>}
    {current.status === "error" && <div className="ai-review-error" role="alert"><strong>AI review unavailable.</strong> {current.message}{current.code === "not_configured" ? "" : " The area details above are unaffected."}</div>}
    <div className="ai-review-actions">
      <button type="button" className="outline-button ai-generate" onClick={generate} disabled={loading || upToDate}>
        {loading ? "Generating…" : current.status === "error" ? "Retry AI review" : current.status === "success" ? (upToDate ? "Review is up to date" : "Regenerate with new data") : "Generate AI Review"}
      </button>
      {loading && <span className="muted small" role="status">Asking Gemini using this area&apos;s evidence…</span>}
    </div>
    {current.status === "success" && <AiAreaChat key={`${current.key}:${current.result.generatedAt}`} snapshot={current.snapshot} review={current.result.review} stale={!upToDate}/>}
    <small>{current.status === "success" ? "AI-generated suggestions for employee review. It does not send notifications, dispatch teams, change records, or affect priority scores." : "Generates a summary from this area's counts and sources only (no names or locations). Synthetic data only; free-tier prompts may be used by Google."}</small>
  </div>;
}

function ReviewBody({ result, stale }: { result: AreaReviewResult; stale: boolean }) {
  const { review } = result;
  const section = (title: string, items: string[], empty?: string) => (items.length || empty) ? <><h5>{title}</h5>{items.length ? <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p className="muted">{empty}</p>}</> : null;
  return <div className="ai-review-result">
    <div className="tag-row"><span className="tag ai-tag">AI-generated · {result.model}</span>{result.simulated && <span className="tag">Simulation</span>}</div>
    <small>Snapshot {displayTime(result.snapshotAt)} · Generated {displayTime(result.generatedAt)} · {result.cached ? "Reused for unchanged evidence (no new tokens)" : result.tokens ? `${result.tokens.toLocaleString()} Gemini tokens` : "Token use unavailable"}</small>
    {stale && <p className="ai-review-stale">Area data changed after this snapshot. Regenerate for current evidence.</p>}
    <p>{review.summary}</p>
    {section("Expected conditions", review.expectedConditions)}
    {section("Reported impacts", review.reportedImpacts, "No reported impacts in the evidence.")}
    {section("Key risks", review.keyRisks)}
    {section("Suggested next steps (employee review required)", review.nextSteps)}
    {section("Limitations", review.limitations)}
  </div>;
}
