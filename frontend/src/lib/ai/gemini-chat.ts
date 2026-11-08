/**
 * Shared server-only Gemini call for multi-turn questions (area follow-ups and the
 * dataset-wide assistant). Applies the shared budget settings, a timeout, token
 * accounting, and truncation detection. Text generation only.
 */
import "server-only";
import { FinishReason, ThinkingLevel, type Content } from "@google/genai";
import { geminiModel, getGeminiClient } from "./gemini";
import { chatBudgetConfig, recordTokens, reviewBudgetConfig } from "./review-budget";
import { AreaReviewFailure, toFailure } from "./generate-area-review";
import type { ChatTurn } from "./area-chat";

const TIMEOUT_MS = 30_000;

/**
 * Builds the conversation. The evidence goes with the first question only;
 * later turns are plain questions and earlier answers.
 */
export function chatContents(evidence: string, history: ChatTurn[], question: string): Content[] {
  const [first, ...rest] = [...history, { question, answer: "" }];
  const contents: Content[] = [{ role: "user", parts: [{ text: `${evidence}\n\nQuestion: ${first.question}` }] }];
  if (first.answer) contents.push({ role: "model", parts: [{ text: first.answer }] });
  for (const turn of rest) {
    contents.push({ role: "user", parts: [{ text: `Question: ${turn.question}` }] });
    if (turn.answer) contents.push({ role: "model", parts: [{ text: turn.answer }] });
  }
  return contents;
}

/** One Gemini call; returns the raw text. Tokens count toward the shared daily budget. */
export async function runGeminiChat(options: { tag: string; systemInstruction: string; contents: Content[]; jsonSchema?: object }): Promise<{ text: string | undefined; model: string; tokens: number }> {
  const model = geminiModel();
  const { thinkingLevel } = reviewBudgetConfig();
  const { maxOutputTokens } = chatBudgetConfig();
  let text: string | undefined;
  let tokens = 0;
  let truncated = false;
  try {
    const response = await getGeminiClient().models.generateContent({
      model,
      contents: options.contents,
      config: {
        systemInstruction: options.systemInstruction,
        ...(options.jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: options.jsonSchema } : {}),
        ...(thinkingLevel ? { thinkingConfig: { thinkingLevel: ThinkingLevel[thinkingLevel] } } : {}),
        maxOutputTokens,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      },
    });
    text = response.text;
    tokens = response.usageMetadata?.totalTokenCount ?? 0;
    truncated = response.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS;
    recordTokens(tokens);
    console.info(`[${options.tag}] ${model}: ${tokens} tokens (prompt ${response.usageMetadata?.promptTokenCount ?? "?"}, thinking ${response.usageMetadata?.thoughtsTokenCount ?? 0}, output ${response.usageMetadata?.candidatesTokenCount ?? "?"})`);
  } catch (error) {
    throw toFailure(error);
  }
  if (truncated) throw new AreaReviewFailure("invalid_response", `Gemini's answer was cut off at the ${maxOutputTokens}-token output cap. Ask a narrower question, or raise GEMINI_CHAT_MAX_OUTPUT_TOKENS.`, 502);
  return { text, model, tokens };
}
