"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { MapData, Phase } from "@/lib/map/types";
import type { AreaReviewError } from "@/lib/ai/area-review";
import { CHAT_LIMITS, cleanQuestion, type ChatTurn } from "@/lib/ai/area-chat";
import { OVERVIEW_STARTERS, buildOverviewSnapshot, overviewFingerprint, type OverviewChatResult } from "@/lib/ai/overview-chat";

type Message = { question: string; fingerprint: string; answer?: string; relatedAreaIds?: string[]; tokens?: number; error?: string; code?: string };

/**
 * Dataset-wide AI assistant ("Ask StateWatch AI"). Answers from a compact overview of the
 * areas currently shown on the map (counts only; no household names or locations).
 * Text only: it never sends notifications, dispatches teams, changes records, or sets priorities.
 */
export function AiAssistant({ data, phase, onOpenArea }: { data: MapData; phase: Phase; onOpenArea: (areaId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);

  // Only summarize the data while the panel is open (it can cover thousands of households).
  const fingerprint = useMemo(() => open ? overviewFingerprint(buildOverviewSnapshot(data, phase, "")) : "", [open, data, phase]);
  const areaNames = useMemo(() => new Map(data.zones.map(zone => [zone.id, zone.name])), [data.zones]);

  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { thread.current?.scrollTo({ top: thread.current.scrollHeight }); }, [messages, open]);
  // The per-view question limit restarts when the data or filters change.
  const [limitFingerprint, setLimitFingerprint] = useState("");
  const limitReached = (turnsLeft === 0 || messages.at(-1)?.code === "limit_reached") && limitFingerprint === fingerprint;
  const disabled = loading || limitReached;
  const last = messages.at(-1);
  const dataChanged = Boolean(last && open && last.fingerprint !== fingerprint);

  function close() {
    setOpen(false);
    launcher.current?.focus();
  }

  async function ask(raw: string, retry = false) {
    const question = cleanQuestion(raw);
    if (!question || disabled) return;
    const snapshot = buildOverviewSnapshot(data, phase, new Date().toISOString());
    const current = overviewFingerprint(snapshot);
    const earlier = retry ? messages.slice(0, -1) : messages;
    // Earlier answers are context only if they were about the same view of the data.
    const history: ChatTurn[] = earlier.filter((m): m is Message & { answer: string } => Boolean(m.answer) && m.fingerprint === current).slice(-CHAT_LIMITS.history).map(m => ({ question: m.question, answer: m.answer }));
    setMessages([...earlier, { question, fingerprint: current }]);
    setDraft("");
    setLoading(true);
    const abort = new AbortController();
    controller.current = abort;
    let reply: Message;
    try {
      const response = await fetch("/api/overview-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot, history, question }), signal: abort.signal });
      const body = await response.json().catch(() => null) as OverviewChatResult | AreaReviewError | null;
      if (response.ok && body && "answer" in body) {
        reply = { question, fingerprint: current, answer: body.answer, relatedAreaIds: body.relatedAreaIds, tokens: body.tokens };
        setTurnsLeft(body.turnsLeft);
      } else if (body && "error" in body) reply = { question, fingerprint: current, error: body.error.message, code: body.error.code };
      else reply = { question, fingerprint: current, error: `AI assistant failed (HTTP ${response.status}).`, code: "upstream_error" };
    } catch (error) {
      if (abort.signal.aborted) return;
      reply = { question, fingerprint: current, error: error instanceof Error ? `Could not reach the AI assistant route: ${error.message}` : "Could not reach the AI assistant route.", code: "network" };
    }
    if (abort.signal.aborted) return;
    setLimitFingerprint(current);
    setMessages([...earlier, reply]);
    setLoading(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  if (!open) return <button ref={launcher} type="button" className="ai-assistant-launcher" onClick={() => setOpen(true)} aria-haspopup="dialog">Ask AI</button>;

  return <section className="ai-assistant" role="dialog" aria-label="Ask StateWatch AI" onKeyDown={event => { if (event.key === "Escape") close(); }}>
    <header className="ai-assistant-header">
      <div><strong>Ask StateWatch AI</strong><span className="tag ai-tag">AI-generated</span>{(data.zones.some(zone => zone.simulated) || (data.impactLayers ?? []).some(layer => layer.simulated)) && <span className="tag">Simulation</span>}</div>
      <div>
        {messages.length > 0 && <button type="button" className="text-button" onClick={() => { controller.current?.abort(); setMessages([]); setLoading(false); setTurnsLeft(null); }}>Clear</button>}
        <button type="button" className="dialog-close" aria-label="Close assistant" onClick={close}>×</button>
      </div>
    </header>
    <p className="ai-assistant-scope">Answers use counts from the {data.zones.length.toLocaleString()} area{data.zones.length === 1 ? "" : "s"} shown on the map ({phase === "before" ? "before impact" : "after impact"}). No names or locations are sent.</p>
    <div className="ai-assistant-thread" ref={thread} aria-live="polite">
      {messages.length === 0 && <div className="ai-chat-starters">{OVERVIEW_STARTERS.map(q => <button key={q} type="button" onClick={() => void ask(q)} disabled={disabled}>{q}</button>)}</div>}
      {messages.map((message, i) => <div key={i} className="ai-chat-turn">
        {i > 0 && messages[i - 1].fingerprint !== message.fingerprint && <p className="ai-review-stale">Map data or filters changed. Answers below use the newer view.</p>}
        <p className="ai-chat-question"><strong>You:</strong> {message.question}</p>
        {message.answer && <div className="ai-chat-answer">
          <p>{message.answer}</p>
          {message.relatedAreaIds?.some(id => areaNames.has(id)) && <div className="ai-assistant-areas">{message.relatedAreaIds.filter(id => areaNames.has(id)).map(id => <button key={id} type="button" onClick={() => onOpenArea(id)}>Review {areaNames.get(id)} →</button>)}</div>}
          {message.tokens ? <small>{message.tokens.toLocaleString()} Gemini tokens</small> : null}
        </div>}
        {message.error && <div className="ai-review-error" role="alert">{message.error}
          {i === messages.length - 1 && message.code !== "limit_reached" && message.code !== "not_configured" && <> <button type="button" className="ai-chat-retry" onClick={() => void ask(message.question, true)} disabled={disabled}>Retry</button></>}
        </div>}
        {!message.answer && !message.error && <p className="muted small" role="status">Asking Gemini…</p>}
      </div>)}
      {dataChanged && !loading && <p className="ai-review-stale">Map data or filters changed since the last answer. New questions use the current view.</p>}
    </div>
    {limitReached && <p className="ai-review-stale">Question limit reached for this view. It resets when the map data or filters change, or after an hour.</p>}
    <form className="ai-chat-form" onSubmit={submit}>
      <input ref={input} type="text" value={draft} onChange={event => setDraft(event.target.value)} maxLength={CHAT_LIMITS.question} placeholder="Ask about the areas on the map" aria-label="Question for the AI assistant" disabled={disabled}/>
      <button type="submit" className="outline-button" disabled={disabled || !cleanQuestion(draft)}>{loading ? "Sending…" : "Send"}</button>
    </form>
    <small className="ai-assistant-note">{turnsLeft !== null && !limitReached ? `${turnsLeft} question${turnsLeft === 1 ? "" : "s"} left for this view. ` : ""}Suggestions for employee review. It cannot send notifications, dispatch teams, change records, or set priorities; the priority queue stays authoritative.</small>
  </section>;
}
