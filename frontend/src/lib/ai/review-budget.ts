/**
 * Token and request budget for Gemini calls (Person 4): AI area reviews and follow-up
 * questions share one set of per-minute, per-day and token-per-day counters.
 *
 * Every limit is an environment variable with a free-tier-friendly default, so a
 * paid plan only needs new values in frontend/.env.local, not code changes.
 * Set a limit to 0 to turn it off. Restart Next.js after changing any of them.
 *
 * State lives in this server process's memory: it resets when the dev server restarts
 * and is not shared between multiple server instances. Google's own quotas still apply.
 */
import "server-only";
import type { AreaReview } from "./area-review";

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

const THINKING_LEVELS = ["MINIMAL", "LOW", "MEDIUM", "HIGH"] as const;
export type ThinkingLevelName = (typeof THINKING_LEVELS)[number];

export interface ReviewBudgetConfig {
  /** Reviews per rolling minute. 0 = unlimited. */
  maxPerMinute: number;
  /** Reviews per Pacific-time day (Google resets daily quotas at midnight PT). 0 = unlimited. */
  maxPerDay: number;
  /** Gemini tokens (prompt + thinking + output) per Pacific-time day. 0 = unlimited. */
  maxTokensPerDay: number;
  /** Output cap per review, including thinking tokens. */
  maxOutputTokens: number;
  /** Reuse a review for identical evidence for this many minutes. 0 = no cache. */
  cacheMinutes: number;
  /** Gemini thinking level; "" leaves the model default (more tokens). */
  thinkingLevel: ThinkingLevelName | "";
}

export function reviewBudgetConfig(): ReviewBudgetConfig {
  const level = (process.env.GEMINI_THINKING_LEVEL?.trim().toUpperCase() ?? "MINIMAL") || "MINIMAL";
  return {
    maxPerMinute: intEnv("GEMINI_REVIEW_MAX_PER_MINUTE", 5),
    maxPerDay: intEnv("GEMINI_REVIEW_MAX_PER_DAY", 50),
    maxTokensPerDay: intEnv("GEMINI_REVIEW_MAX_TOKENS_PER_DAY", 100_000),
    maxOutputTokens: Math.max(256, intEnv("GEMINI_REVIEW_MAX_OUTPUT_TOKENS", 1024)),
    cacheMinutes: intEnv("GEMINI_REVIEW_CACHE_MINUTES", 30),
    // "DEFAULT" opts out of the override (e.g. for models without MINIMAL).
    thinkingLevel: level === "DEFAULT" ? "" : (THINKING_LEVELS as readonly string[]).includes(level) ? level as ThinkingLevelName : "MINIMAL",
  };
}

// ---------- usage counters ----------

const pacificDay = (now: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const minute: number[] = [];
let day = { key: "", requests: 0, tokens: 0 };

function rollDay(now: number) {
  const key = pacificDay(now);
  if (day.key !== key) day = { key, requests: 0, tokens: 0 };
}

export type BudgetDenial = { reason: "minute" | "day_requests" | "day_tokens"; message: string; retryAfterSeconds: number };

/** Reserves one Gemini request (review or follow-up), or explains which limit blocks it. Cache hits must not call this. */
export function reserveGeminiCall(now = Date.now(), config = reviewBudgetConfig()): BudgetDenial | null {
  // GEMINI_MOCK=1 (dev only, see mock-mode.ts) makes no Gemini calls, so it uses no quota. Inlined so offline tests can load this file alone.
  if (process.env.NODE_ENV !== "production" && process.env.GEMINI_MOCK?.trim() === "1") return null;
  rollDay(now);
  while (minute.length && now - minute[0] > 60_000) minute.shift();
  if (config.maxPerDay && day.requests >= config.maxPerDay)
    return { reason: "day_requests", message: `Daily AI request limit reached (${config.maxPerDay} per day, shared by reviews and follow-ups). It resets at midnight Pacific time.`, retryAfterSeconds: secondsToPacificMidnight(now) };
  if (config.maxTokensPerDay && day.tokens >= config.maxTokensPerDay)
    return { reason: "day_tokens", message: `Daily AI token budget used (${config.maxTokensPerDay.toLocaleString("en-US")} tokens). It resets at midnight Pacific time.`, retryAfterSeconds: secondsToPacificMidnight(now) };
  if (config.maxPerMinute && minute.length >= config.maxPerMinute) {
    const retryAfterSeconds = Math.max(1, Math.ceil((60_000 - (now - minute[0])) / 1000));
    return { reason: "minute", message: `Too many AI requests in the last minute (limit ${config.maxPerMinute}). Retry in ${retryAfterSeconds} s.`, retryAfterSeconds };
  }
  minute.push(now);
  day.requests++;
  return null;
}

/** Adds the tokens Gemini reports for a finished request, including failed validations. */
export function recordTokens(tokens: number, now = Date.now()) {
  rollDay(now);
  if (Number.isFinite(tokens) && tokens > 0) day.tokens += tokens;
}

export function usageToday(now = Date.now()) {
  rollDay(now);
  return { requests: day.requests, tokens: day.tokens };
}

function secondsToPacificMidnight(now: number) {
  // Step forward in 10-minute increments until the Pacific date changes (DST-safe, at most 145 steps).
  const today = pacificDay(now);
  let t = now;
  while (pacificDay(t) === today) t += 600_000;
  return Math.max(60, Math.ceil((t - now) / 1000));
}

// ---------- cache and in-flight de-duplication ----------

export interface CachedReview { review: AreaReview; model: string; generatedAt: string; tokens: number }
const cache = new Map<string, { value: CachedReview; expires: number }>();
const inFlight = new Map<string, Promise<CachedReview>>();
const MAX_CACHE_ENTRIES = 100;

export function getCachedReview(key: string, now = Date.now()): CachedReview | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires <= now) { cache.delete(key); return null; }
  return hit.value;
}

export function setCachedReview(key: string, value: CachedReview, config = reviewBudgetConfig(), now = Date.now()) {
  if (!config.cacheMinutes) return;
  cache.delete(key);
  cache.set(key, { value, expires: now + config.cacheMinutes * 60_000 });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
}

/** Identical evidence requested twice at once shares one Gemini call. */
export function shareInFlight(key: string, start: () => Promise<CachedReview>): { promise: Promise<CachedReview>; joined: boolean } {
  const existing = inFlight.get(key);
  if (existing) return { promise: existing, joined: true };
  const promise = start().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return { promise, joined: false };
}

// ---------- follow-up questions ----------

export interface ChatBudgetConfig {
  /** Follow-up questions per generated review. 0 = unlimited. */
  maxTurns: number;
  /** Output cap per answer, including thinking tokens. */
  maxOutputTokens: number;
}

export function chatBudgetConfig(): ChatBudgetConfig {
  return {
    maxTurns: intEnv("GEMINI_CHAT_MAX_TURNS", 6),
    maxOutputTokens: Math.max(128, intEnv("GEMINI_CHAT_MAX_OUTPUT_TOKENS", 512)),
  };
}

// Answered follow-ups per review, so one popup cannot use the whole daily budget.
const turns = new Map<string, { used: number; expires: number }>();
const TURN_WINDOW_MS = 60 * 60_000;
const MAX_CONVERSATIONS = 200;

function liveTurns(key: string, now: number) {
  const entry = turns.get(key);
  if (entry && entry.expires <= now) { turns.delete(key); return 0; }
  return entry?.used ?? 0;
}

/** Follow-ups left for a review, or null when unlimited. */
export function chatTurnsLeft(key: string, config = chatBudgetConfig(), now = Date.now()): number | null {
  return config.maxTurns ? Math.max(0, config.maxTurns - liveTurns(key, now)) : null;
}

/** Counts one answered follow-up. Failed calls are not counted, so a retry does not use up a turn. */
export function countChatTurn(key: string, now = Date.now()) {
  const used = liveTurns(key, now) + 1;
  turns.delete(key);
  turns.set(key, { used, expires: now + TURN_WINDOW_MS });
  while (turns.size > MAX_CONVERSATIONS) turns.delete(turns.keys().next().value!);
}
