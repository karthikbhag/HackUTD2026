/**
 * POST /api/area-review — generates an AI area review from a small evidence snapshot.
 * The browser sends counts and labels only; GEMINI_API_KEY stays on the server.
 * This route only returns text: it never writes to SpacetimeDB, sends notifications, or dispatches teams.
 */
import { geminiModel, isGeminiConfigured } from "@/lib/ai/gemini";
import { AreaReviewFailure, generateAreaReview, simulatedFailure } from "@/lib/ai/generate-area-review";
import { parseAreaSnapshot, snapshotFingerprint, type AreaReviewError, type AreaReviewErrorCode, type AreaReviewResult, type AreaSnapshot } from "@/lib/ai/area-review";
import { getCachedReview, reserveGeminiCall, setCachedReview, shareInFlight, type CachedReview } from "@/lib/ai/review-budget";

const MAX_BODY_BYTES = 16_000;

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

  // Development-only error simulation runs before the cache so cached reviews do not hide it.
  const simulated = simulatedFailure();
  if (simulated) return fail(simulated.code, simulated.message, simulated.status, simulated.retryAfterSeconds);

  // Identical evidence (same area, phase, counts and sources) reuses a recent review: no Gemini tokens.
  const key = `${geminiModel()}|${snapshotFingerprint(snapshot)}`;
  const hit = getCachedReview(key);
  if (hit) return Response.json(toResult(snapshot, hit, true), { headers: { "Cache-Control": "no-store" } });

  try {
    const { promise, joined } = shareInFlight(key, async () => {
      // Budget is checked only when Gemini will actually be called (not for cache hits or joined requests).
      const denied = reserveGeminiCall();
      if (denied) throw new AreaReviewFailure("rate_limited", denied.message, 429, denied.retryAfterSeconds);
      const { review, model, tokens } = await generateAreaReview(snapshot);
      const value: CachedReview = { review, model, tokens, generatedAt: new Date().toISOString() };
      setCachedReview(key, value);
      return value;
    });
    return Response.json(toResult(snapshot, await promise, joined), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AreaReviewFailure) return fail(error.code, error.message, error.status, error.retryAfterSeconds);
    console.error("[area-review] unexpected failure", error instanceof Error ? error.name : typeof error);
    return fail("upstream_error", "AI review failed unexpectedly.", 500);
  }
}

function toResult(snapshot: AreaSnapshot, value: CachedReview, cached: boolean): AreaReviewResult {
  return {
    areaId: snapshot.areaId, phase: snapshot.phase, snapshotAt: snapshot.snapshotAt, generatedAt: value.generatedAt,
    model: value.model, simulated: snapshot.area.simulated || snapshot.impactLayers.some(layer => layer.simulated),
    review: value.review, cached, tokens: cached ? 0 : value.tokens,
  };
}
