/**
 * Server-only Gemini client (Person 4). Importing this from a Client Component
 * fails the build, so GEMINI_API_KEY can never reach the browser.
 *
 * Configuration (frontend/.env.local, see .env.example):
 * - GEMINI_API_KEY: required for generation; never use a NEXT_PUBLIC_ prefix.
 * - GEMINI_MODEL: optional override; defaults to DEFAULT_GEMINI_MODEL.
 *
 * Callers must treat "not configured" and request failures as normal outcomes and
 * keep the structured scenario details available (README: AI area review).
 */
import "server-only";
import { GoogleGenAI } from "@google/genai";

/** Stable Flash model with a free API tier (checked against ai.google.dev, 2026-11-08). */
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super("Gemini is not configured. Set GEMINI_API_KEY in frontend/.env.local and restart Next.js.");
    this.name = "GeminiNotConfiguredError";
  }
}

/** Model to use: GEMINI_MODEL when set, otherwise the default. */
export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

/** Whether a key is present. Never exposes the key itself. */
export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

let cached: { key: string; client: GoogleGenAI } | undefined;

/**
 * Returns a shared client for the Gemini Developer API (API-key auth, not Vertex AI).
 * Throws GeminiNotConfiguredError when GEMINI_API_KEY is missing.
 */
export function getGeminiClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new GeminiNotConfiguredError();
  // Recreate only if the key changed (e.g. after editing .env.local in dev).
  if (cached?.key !== key) cached = { key, client: new GoogleGenAI({ apiKey: key, vertexai: false }) };
  return cached.client;
}
