"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AreaReview, AreaReviewError, AreaSnapshot } from "@/lib/ai/area-review";
import { CHAT_LIMITS, STARTER_QUESTIONS, cleanQuestion, type AreaChatResult, type ChatTurn } from "@/lib/ai/area-chat";

type Message = { question: string; answer?: string; tokens?: number; error?: string; code?: string };

/**
 * Follow-up questions about one generated AI review. Mounted inside the review, so it
 * resets (and cancels any request) when the area, phase, or review changes.
 * Text only: answers never send notifications, dispatch teams, or change records.
 */
export function AiAreaChat({ snapshot, review, stale }: { snapshot: AreaSnapshot; review: AreaReview; stale: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const thread = useRef<HTMLDivElement>(null);

  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => { thread.current?.scrollTo({ top: thread.current.scrollHeight }); }, [messages]);

  const limitReached = turnsLeft === 0 || messages.at(-1)?.code === "limit_reached";
  const disabled = loading || stale || limitReached;

  async function ask(raw: string, retry = false) {
    const question = cleanQuestion(raw);
    if (!question || disabled) return;
    // Only answered turns are context; failed ones are dropped. A retry replaces the failed message.
    const earlier = retry ? messages.slice(0, -1) : messages;
    const history: ChatTurn[] = earlier.filter((m): m is Message & { answer: string } => Boolean(m.answer)).slice(-CHAT_LIMITS.history).map(m => ({ question: m.question, answer: m.answer }));
    setMessages([...earlier, { question }]);
    setDraft("");
    setLoading(true);
    const abort = new AbortController();
    controller.current = abort;
    let reply: Message;
    try {
      const response = await fetch("/api/area-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot, review, history, question }), signal: abort.signal });
      const body = await response.json().catch(() => null) as AreaChatResult | AreaReviewError | null;
      if (response.ok && body && "answer" in body && body.areaId === snapshot.areaId && body.phase === snapshot.phase) {
        reply = { question, answer: body.answer, tokens: body.tokens };
        setTurnsLeft(body.turnsLeft);
      } else if (body && "error" in body) reply = { question, error: body.error.message, code: body.error.code };
      else reply = { question, error: `AI follow-up failed (HTTP ${response.status}).`, code: "upstream_error" };
    } catch (error) {
      if (abort.signal.aborted) return;
      reply = { question, error: error instanceof Error ? `Could not reach the AI follow-up route: ${error.message}` : "Could not reach the AI follow-up route.", code: "network" };
    }
    if (abort.signal.aborted) return;
    setMessages([...earlier, reply]);
    setLoading(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  const last = messages.at(-1);
  return <div className="ai-chat">
    <h5>Ask a follow-up</h5>
    {messages.length > 0 && <div className="ai-chat-thread" ref={thread} aria-live="polite">
      {messages.map((message, i) => <div key={i} className="ai-chat-turn">
        <p className="ai-chat-question"><strong>You:</strong> {message.question}</p>
        {message.answer && <div className="ai-chat-answer"><span className="tag ai-tag">AI-generated</span><p>{message.answer}</p>{message.tokens ? <small>{message.tokens.toLocaleString()} Gemini tokens</small> : null}</div>}
        {message.error && <div className="ai-review-error" role="alert">{message.error}
          {i === messages.length - 1 && message.code !== "limit_reached" && message.code !== "not_configured" && <> <button type="button" className="ai-chat-retry" onClick={() => void ask(message.question, true)} disabled={disabled}>Retry</button></>}
        </div>}
        {!message.answer && !message.error && <p className="muted small" role="status">Asking Gemini…</p>}
      </div>)}
    </div>}
    {stale ? <p className="ai-review-stale">Follow-ups are off because the area data changed. Regenerate the review first.</p>
      : limitReached ? <p className="ai-review-stale">Follow-up limit reached for this review. Regenerate after the area data changes, or try again later.</p>
      : messages.length === 0 && <div className="ai-chat-starters">{STARTER_QUESTIONS.map(q => <button key={q} type="button" onClick={() => void ask(q)} disabled={disabled}>{q}</button>)}</div>}
    <form className="ai-chat-form" onSubmit={submit}>
      <input type="text" value={draft} onChange={event => setDraft(event.target.value)} maxLength={CHAT_LIMITS.question} placeholder="Ask about this area's evidence" aria-label="Follow-up question" disabled={disabled}/>
      <button type="submit" className="outline-button" disabled={disabled || !cleanQuestion(draft)}>{loading ? "Sending…" : "Send"}</button>
    </form>
    <small>{turnsLeft !== null && !limitReached ? `${turnsLeft} follow-up${turnsLeft === 1 ? "" : "s"} left for this review. ` : ""}{last?.code === "not_configured" ? "" : "Answers use only this area's snapshot and review."}</small>
  </div>;
}
