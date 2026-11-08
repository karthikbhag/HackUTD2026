import type { RiskLevel } from './risk-bands';
export type RiskMessages = Record<Exclude<RiskLevel, 'None'>, string>;
/** Existing reducer string transports a versioned, reviewed set of three messages. */
export function parseRiskMessages(message: string): RiskMessages | undefined {
  if (!message.trim().startsWith('{')) return;
  let value;
  try { value = JSON.parse(message); } catch { return; }
  if (value?.format !== 'risk-messages-v1') return;
  for (const band of ['High', 'Medium', 'Low']) {
    if (typeof value.messages?.[band] !== 'string' || !value.messages[band].trim() || value.messages[band].length > 4000) throw new Error('Each risk message must contain 1–4000 characters');
  }
  return value.messages as RiskMessages;
}
export function encodeRiskMessages(messages: RiskMessages, eventVersion?: string) {
  return JSON.stringify({ format: 'risk-messages-v1', messages, eventVersion });
}

export function expectedEventVersion(message: string): string | undefined {
  try { return JSON.parse(message).eventVersion; } catch { return undefined; }
}
