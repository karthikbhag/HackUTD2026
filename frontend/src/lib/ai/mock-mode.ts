/**
 * Development-only Gemini mock (GEMINI_MOCK=1 in frontend/.env.local).
 * Reviews, follow-ups and the assistant return canned text built from the snapshot,
 * with no API key, no Gemini call and no budget use. Ignored in production builds.
 *
 * No runtime imports, so offline tests can load the modules that use it.
 */
export const MOCK_MODEL = "mock (no Gemini call)";

export function geminiMockEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.GEMINI_MOCK?.trim() === "1";
}
