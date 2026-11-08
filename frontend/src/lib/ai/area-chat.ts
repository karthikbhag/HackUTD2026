/**
 * Shared contract for AI follow-up questions about one area (Person 4).
 * A follow-up always comes with the same snapshot and review it is about, so Gemini
 * only sees one small area's counts and labels, never the whole dataset.
 *
 * Keep this file free of runtime imports other than ./area-review so offline tests can load it.
 */
import { parseAreaReview, parseAreaSnapshot, unsupportedNumbers, type AreaReview, type AreaSnapshot } from "./area-review";
import type { Phase } from "../map/types";

export const CHAT_LIMITS = { question: 300, answer: 1200, history: 3 } as const;

/** Starter questions shown before the first follow-up. */
export const STARTER_QUESTIONS = [
  "What evidence is missing?",
  "Why are these the key risks?",
  "What should an employee check first?",
] as const;

export interface ChatTurn { question: string; answer: string }
export interface AreaChatRequest {
  snapshot: AreaSnapshot;
  review: AreaReview;
  /** Earlier follow-ups, oldest first. Only the last CHAT_LIMITS.history are sent. */
  history: ChatTurn[];
  question: string;
}
export interface AreaChatResult {
  areaId: string; phase: Phase; answer: string; model: string; generatedAt: string;
  /** Gemini tokens used by this answer (0 if unknown). */
  tokens: number;
  /** Follow-ups left for this review, or null when there is no per-review limit. */
  turnsLeft: number | null;
}

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max;

/** Trims whitespace and collapses it, so "  why?\n" and "why?" are the same question. */
export const cleanQuestion = (value: string) => value.replace(/\s+/g, " ").trim();

/** Validates a follow-up request. The review must itself pass review validation against the snapshot. */
export function parseAreaChatRequest(value: unknown): { request: AreaChatRequest } | { error: string } {
  if (!isObj(value)) return { error: "Request must be an object." };
  const snapshot = parseAreaSnapshot(value.snapshot);
  if ("error" in snapshot) return { error: snapshot.error };
  const review = parseAreaReview(value.review, snapshot.snapshot);
  if ("error" in review) return { error: "The review does not match this area's evidence." };
  if (typeof value.question !== "string") return { error: "Missing question." };
  const question = cleanQuestion(value.question);
  if (!question) return { error: "Question is empty." };
  if (question.length > CHAT_LIMITS.question) return { error: `Question is longer than ${CHAT_LIMITS.question} characters.` };
  const history = value.history;
  if (!Array.isArray(history) || history.length > CHAT_LIMITS.history ||
    !history.every(turn => isObj(turn) && text(turn.question, CHAT_LIMITS.question) && text(turn.answer, CHAT_LIMITS.answer))) return { error: "Invalid history." };
  return { request: { snapshot: snapshot.snapshot, review: review.review, history: history.map(turn => ({ question: cleanQuestion(turn.question), answer: turn.answer.trim() })), question } };
}

/**
 * Validates Gemini's answer: non-empty, length-capped, and no numbers that are not in the snapshot.
 * Leading list markers ("1." or "2)") are removed first so they are not mistaken for figures.
 */
export function parseAreaChatAnswer(value: string | undefined, snapshot: AreaSnapshot): { answer: string } | { error: string } {
  const answer = (value ?? "").split("\n").map(line => line.replace(/^\s*\d+[.)]\s+/, "- ").trimEnd()).join("\n").trim();
  if (!answer) return { error: "Gemini returned an empty answer." };
  const clipped = answer.length > CHAT_LIMITS.answer ? `${answer.slice(0, CHAT_LIMITS.answer - 1)}…` : answer;
  const unsupported = unsupportedNumbers(clipped, snapshot);
  if (unsupported.length) return { error: `The answer was withheld because it mentioned numbers that are not in the evidence (${unsupported.slice(0, 3).join(", ")}). Try rephrasing the question.` };
  return { answer: clipped };
}
