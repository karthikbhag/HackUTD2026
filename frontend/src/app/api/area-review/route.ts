/**
 * POST /api/area-review — generates an AI area review from a small evidence snapshot.
 * The browser sends counts and labels only; GEMINI_API_KEY stays on the server.
 * This route only returns text: it never writes to SpacetimeDB, sends notifications, or dispatches teams.
 */
import { isGeminiConfigured } from "@/lib/ai/gemini";
import { AreaReviewFailure, generateAreaReview } from "@/lib/ai/generate-area-review";
import { parseAreaSnapshot, type AreaReviewError, type AreaReviewErrorCode, type AreaReviewResult } from "@/lib/ai/area-review";

const MAX_BODY_BYTES = 16_000;
// Local guard for the shared free-tier quota (per server process); Gemini enforces its own limits too.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 6;
const recent: number[] = [];

function fail(code: AreaReviewErrorCode, message: string, status: number, retryAfterSeconds?: number) {
  const body: AreaReviewError = { error: { code, message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) } };
  return Response.json(body, { status, headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined });
}

function originHost(origin: string) {
  try { return new URL(origin).host; } catch { return null; }
}

export async function POST(request: Request) {
  // Only the app's own pages may call this route from a browser.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && originHost(origin) !== host) return fail("forbidden", "Cross-origin requests are not allowed.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return fail("invalid_request", "Expected a JSON body.", 415);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("invalid_request", "Snapshot is too large.", 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return fail("invalid_request", "Body is not valid JSON.", 400); }
  const parsed = parseAreaSnapshot(body);
  if ("error" in parsed) return fail("invalid_request", parsed.error, 400);
  const { snapshot } = parsed;

  if (!isGeminiConfigured()) return fail("not_configured", "AI review is not configured. Add GEMINI_API_KEY to frontend/.env.local and restart the dev server.", 503);

  const now = Date.now();
  while (recent.length && now - recent[0] > WINDOW_MS) recent.shift();
  if (recent.length >= MAX_PER_WINDOW) {
    const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - recent[0])) / 1000));
    return fail("rate_limited", `Too many AI reviews in the last minute (local limit ${MAX_PER_WINDOW}). Retry in ${retryAfterSeconds} s.`, 429, retryAfterSeconds);
  }
  recent.push(now);

  try {
    const { review, model } = await generateAreaReview(snapshot);
    const result: AreaReviewResult = {
      areaId: snapshot.areaId, phase: snapshot.phase, snapshotAt: snapshot.snapshotAt, generatedAt: new Date().toISOString(),
      model, simulated: snapshot.area.simulated || snapshot.impactLayers.some(layer => layer.simulated), review,
    };
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AreaReviewFailure) return fail(error.code, error.message, error.status, error.retryAfterSeconds);
    console.error("[area-review] unexpected failure", error instanceof Error ? error.name : typeof error);
    return fail("upstream_error", "AI review failed unexpectedly.", 500);
  }
}
