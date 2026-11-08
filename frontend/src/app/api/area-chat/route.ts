/**
 * POST /api/area-chat — answers one follow-up question about an AI area review.
 * The browser sends the same small snapshot and review, the last few turns, and the question;
 * GEMINI_API_KEY stays on the server. Returns text only: never writes records, notifies, or dispatches.
 */
import { createHash } from "node:crypto";
import { geminiModel, isGeminiConfigured } from "@/lib/ai/gemini";
import { AreaReviewFailure, simulatedFailure } from "@/lib/ai/generate-area-review";
import { generateAreaChatAnswer } from "@/lib/ai/generate-area-chat";
import { parseAreaChatRequest, type AreaChatResult } from "@/lib/ai/area-chat";
import { snapshotFingerprint, type AreaReviewError, type AreaReviewErrorCode } from "@/lib/ai/area-review";
import { chatBudgetConfig, chatTurnsLeft, countChatTurn, reserveGeminiCall } from "@/lib/ai/review-budget";

// Snapshot (~4 KB) + review (up to ~16 KB) + three earlier turns + the question.
const MAX_BODY_BYTES = 40_000;

function fail(code: AreaReviewErrorCode, message: string, status: number, retryAfterSeconds?: number) {
  const body: AreaReviewError = { error: { code, message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) } };
  return Response.json(body, { status, headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined });
}

function originHost(origin: string) {
  try { return new URL(origin).host; } catch { return null; }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && originHost(origin) !== host) return fail("forbidden", "Cross-origin requests are not allowed.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return fail("invalid_request", "Expected a JSON body.", 415);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("invalid_request", "Request is too large.", 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return fail("invalid_request", "Body is not valid JSON.", 400); }
  const parsed = parseAreaChatRequest(body);
  if ("error" in parsed) return fail("invalid_request", parsed.error, 400);
  const chat = parsed.request;

  if (!isGeminiConfigured()) return fail("not_configured", "AI follow-ups are not configured. Add GEMINI_API_KEY to frontend/.env.local and restart the dev server.", 503);
  const simulated = simulatedFailure();
  if (simulated) return fail(simulated.code, simulated.message, simulated.status, simulated.retryAfterSeconds);

  // One conversation = one model + one evidence snapshot + one review.
  const key = createHash("sha256").update(`${geminiModel()}|${snapshotFingerprint(chat.snapshot)}|${JSON.stringify(chat.review)}`).digest("hex");
  const config = chatBudgetConfig();
  if (chatTurnsLeft(key, config) === 0)
    return fail("limit_reached", `Follow-up limit reached for this review (${config.maxTurns}). It resets when the area data changes or after an hour.`, 429);

  try {
    const denied = reserveGeminiCall();
    if (denied) throw new AreaReviewFailure("rate_limited", denied.message, 429, denied.retryAfterSeconds);
    const { answer, model, tokens } = await generateAreaChatAnswer(chat);
    countChatTurn(key);
    const result: AreaChatResult = {
      areaId: chat.snapshot.areaId, phase: chat.snapshot.phase, answer, model, tokens,
      generatedAt: new Date().toISOString(), turnsLeft: chatTurnsLeft(key, config),
    };
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AreaReviewFailure) return fail(error.code, error.message, error.status, error.retryAfterSeconds);
    console.error("[area-chat] unexpected failure", error instanceof Error ? error.name : typeof error);
    return fail("upstream_error", "AI follow-up failed unexpectedly.", 500);
  }
}
