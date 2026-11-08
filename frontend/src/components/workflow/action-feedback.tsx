"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** One shared success/error message for every workflow action. */
export type Feedback = { kind: "pending" | "success" | "error"; message: string } | null;

export function useActionRunner() {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  /** Runs an action, shows "label…", then success text or the backend's rejection message. */
  const run = useCallback(async (label: string, action: () => Promise<void>, success = `${label}: done.`) => {
    const id = ++latest.current;
    setBusy(true);
    setFeedback({ kind: "pending", message: `${label}…` });
    try {
      await action();
      if (mounted.current && id === latest.current) setFeedback({ kind: "success", message: success });
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (mounted.current && id === latest.current) setFeedback({ kind: "error", message: `${label} failed: ${reason}` });
      return false;
    } finally {
      if (mounted.current && id === latest.current) setBusy(false);
    }
  }, []);

  return { run, busy, feedback, clear: () => setFeedback(null) };
}

export function ActionFeedback({ feedback, onDismiss }: { feedback: Feedback; onDismiss: () => void }) {
  // Keep the live region mounted so screen readers announce each new message.
  return <div className="action-feedback-region" aria-live="polite">
    {feedback && <div className={`action-feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>
      <span>{feedback.message}</span>
      {feedback.kind !== "pending" && <button type="button" onClick={onDismiss} aria-label="Dismiss message">×</button>}
    </div>}
  </div>;
}
