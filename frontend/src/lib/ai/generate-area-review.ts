/**
 * Server-only Gemini call for the AI area review. Text generation only: this module
 * has no access to SpacetimeDB, notifications, or dispatch, and returns suggestions.
 */
import "server-only";
import { ApiError } from "@google/genai";
import { geminiModel, getGeminiClient } from "./gemini";
import { AREA_REVIEW_JSON_SCHEMA, parseAreaReview, type AreaReview, type AreaReviewErrorCode, type AreaSnapshot } from "./area-review";

const TIMEOUT_MS = 30_000;

const SYSTEM_INSTRUCTION = `You summarize disaster-area evidence for employees of a utility/insurance-style outreach team.
Rules:
- Use ONLY the JSON snapshot you are given. Do not use outside knowledge about real places, events, or agencies.
- Separate expected conditions (scenario, simulation, forecast, guidance templates) from reported impacts (household check-ins, recorded needs, or impact layers whose dataKind is "report"). If nothing is reported, return an empty reportedImpacts list.
- If area.simulated or a layer's simulated flag is true, say the evidence is simulated.
- Do not invent numbers. Only use counts that appear in the snapshot, written exactly as digits. Do not restate timestamps, dates, or coordinates; refer to "the snapshot time" or "the source update" instead.
- Never claim an evacuation order, official warning, verified safe route, shelter availability, or confirmed exposure unless the snapshot states it. Household counts are geographic membership, not verified exposure.
- Next steps are suggestions for an employee to review. Never say that notifications were sent, teams were dispatched, or records were changed. Do not assign priority scores or rank households.
- Be concise and neutral. Do not mention individual households.`;

export class AreaReviewFailure extends Error {
  constructor(readonly code: AreaReviewErrorCode, message: string, readonly status: number, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = "AreaReviewFailure";
  }
}

/**
 * Development-only switch for testing error states without touching the key:
 * GEMINI_REVIEW_SIMULATE_ERROR=rate_limit | api_error | timeout | invalid_response.
 * Ignored in production builds.
 */
function simulatedFailure(): AreaReviewFailure | null {
  if (process.env.NODE_ENV === "production") return null;
  switch (process.env.GEMINI_REVIEW_SIMULATE_ERROR?.trim()) {
    case "rate_limit": return new AreaReviewFailure("rate_limited", "Gemini free-tier rate limit reached (simulated). Wait a minute and retry.", 429, 60);
    case "api_error": return new AreaReviewFailure("upstream_error", "Gemini request failed (simulated).", 502);
    case "timeout": return new AreaReviewFailure("timeout", "Gemini did not respond in time (simulated).", 504);
    case "invalid_response": return new AreaReviewFailure("invalid_response", "Gemini returned a review that failed validation (simulated).", 502);
    default: return null;
  }
}

export async function generateAreaReview(snapshot: AreaSnapshot): Promise<{ review: AreaReview; model: string }> {
  const simulated = simulatedFailure();
  if (simulated) throw simulated;
  const model = geminiModel();
  let text: string | undefined;
  try {
    const response = await getGeminiClient().models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: `Area evidence snapshot (JSON):\n${JSON.stringify(snapshot)}` }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseJsonSchema: AREA_REVIEW_JSON_SCHEMA,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      },
    });
    text = response.text;
  } catch (error) {
    throw toFailure(error);
  }
  if (!text) throw new AreaReviewFailure("invalid_response", "Gemini returned an empty response (it may have been blocked by safety filters).", 502);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new AreaReviewFailure("invalid_response", "Gemini returned malformed JSON.", 502); }
  const result = parseAreaReview(parsed, snapshot);
  if ("error" in result) throw new AreaReviewFailure("invalid_response", `Gemini's review failed validation: ${result.error}`, 502);
  return { review: result.review, model };
}

/** Maps SDK errors to safe messages. Upstream error text is logged by status only, never returned. */
function toFailure(error: unknown): AreaReviewFailure {
  if (error instanceof AreaReviewFailure) return error;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return new AreaReviewFailure("timeout", "Gemini did not respond within 30 seconds.", 504);
  if (error instanceof ApiError) {
    console.error(`[area-review] Gemini API error, status ${error.status}`);
    if (error.status === 429) return new AreaReviewFailure("rate_limited", "Gemini free-tier rate limit or quota reached. Wait a minute and retry.", 429, 60);
    if (error.status === 400 || error.status === 401 || error.status === 403) return new AreaReviewFailure("upstream_error", "Gemini rejected the request. Check that GEMINI_API_KEY is valid and the model is available on the free tier.", 502);
    if (error.status === 404) return new AreaReviewFailure("upstream_error", "The configured GEMINI_MODEL was not found.", 502);
    return new AreaReviewFailure("upstream_error", `Gemini is unavailable right now (status ${error.status}).`, 502);
  }
  console.error("[area-review] Gemini request failed", error instanceof Error ? error.name : typeof error);
  return new AreaReviewFailure("upstream_error", "Gemini request failed.", 502);
}
