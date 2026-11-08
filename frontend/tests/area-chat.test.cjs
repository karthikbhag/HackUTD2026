// Offline checks for AI follow-up questions (no network, no Gemini key).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

// Let the TypeScript sources require each other ("./area-review") and stub Next's "server-only".
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const originalLoad = Module._load;
Module._load = function (request, ...rest) { return request === 'server-only' ? {} : originalLoad.call(this, request, ...rest); };
const chat = require('../src/lib/ai/area-chat.ts');
const { buildAreaSnapshot } = require('../src/lib/ai/area-review.ts');
const { demoMapData } = require('../src/lib/map/demo-data.ts');
const budget = require('../src/lib/ai/review-budget.ts');
Module._load = originalLoad;

const zone = demoMapData.zones[0];
const snapshot = buildAreaSnapshot(demoMapData, zone, 'before', '2026-11-08T12:00:00.000Z');
const review = { summary: 'Simulated tornado scenario with 3 customers in the area.', expectedConditions: ['Simulated core impact area.'], reportedImpacts: [], keyRisks: [], nextSteps: [], limitations: [] };
const body = over => JSON.parse(JSON.stringify({ snapshot, review, history: [], question: 'What evidence is missing?', ...over }));

test('valid follow-ups pass and questions are cleaned', () => {
  const parsed = chat.parseAreaChatRequest(body({ question: '  What   is missing?\n', history: [{ question: 'Why?', answer: 'Because the evidence is simulated.' }] }));
  assert.ok('request' in parsed, parsed.error);
  assert.equal(parsed.request.question, 'What is missing?');
  assert.equal(parsed.request.history.length, 1);
});

test('rejects tampered snapshots, mismatched reviews, oversized questions, and long history', () => {
  assert.ok('error' in chat.parseAreaChatRequest(null));
  assert.ok('error' in chat.parseAreaChatRequest(body({ snapshot: { ...snapshot, phase: 'during' } })));
  assert.ok('error' in chat.parseAreaChatRequest(body({ review: { ...review, summary: '' } })));
  assert.match(chat.parseAreaChatRequest(body({ review: { ...review, summary: '99 customers affected.' } })).error, /does not match/, 'review numbers must come from the snapshot');
  assert.ok('error' in chat.parseAreaChatRequest(body({ question: '   ' })));
  assert.ok('error' in chat.parseAreaChatRequest(body({ question: 'x'.repeat(chat.CHAT_LIMITS.question + 1) })));
  const turn = { question: 'Q?', answer: 'A.' };
  assert.ok('error' in chat.parseAreaChatRequest(body({ history: Array(chat.CHAT_LIMITS.history + 1).fill(turn) })));
  assert.ok('error' in chat.parseAreaChatRequest(body({ history: [{ question: 'Q?', answer: 'x'.repeat(chat.CHAT_LIMITS.answer + 1) }] })));
});

test('answers cannot add numbers that are not in the snapshot; list markers are not figures', () => {
  assert.equal(chat.parseAreaChatAnswer('There are 3 customers in the area.', snapshot).answer, 'There are 3 customers in the area.');
  assert.equal(chat.parseAreaChatAnswer('17. Check outreach.\n18) Review needs.', snapshot).answer, '- Check outreach.\n- Review needs.');
  assert.match(chat.parseAreaChatAnswer('About 250 households were evacuated.', snapshot).error, /250/);
  assert.ok('error' in chat.parseAreaChatAnswer('   ', snapshot));
  assert.ok('error' in chat.parseAreaChatAnswer(undefined, snapshot));
  assert.ok(chat.parseAreaChatAnswer('a'.repeat(5000), snapshot).answer.length <= chat.CHAT_LIMITS.answer);
});

test('follow-up turns are capped per review, expire, and can be turned off', () => {
  const config = { maxTurns: 2, maxOutputTokens: 512 };
  const t = Date.parse('2026-12-10T20:00:00Z');
  assert.equal(budget.chatTurnsLeft('conv', config, t), 2);
  budget.countChatTurn('conv', t);
  budget.countChatTurn('conv', t + 1000);
  assert.equal(budget.chatTurnsLeft('conv', config, t + 2000), 0);
  assert.equal(budget.chatTurnsLeft('other', config, t + 2000), 2, 'other reviews keep their own count');
  assert.equal(budget.chatTurnsLeft('conv', config, t + 61 * 60_000 + 1000), 2, 'turns reset after an hour');
  assert.equal(budget.chatTurnsLeft('conv', { ...config, maxTurns: 0 }, t), null, '0 = unlimited');
});

test('chat budget defaults and env overrides', () => {
  const keys = ['GEMINI_CHAT_MAX_TURNS', 'GEMINI_CHAT_MAX_OUTPUT_TOKENS'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    keys.forEach(k => delete process.env[k]);
    assert.deepEqual(budget.chatBudgetConfig(), { maxTurns: 6, maxOutputTokens: 512 });
    Object.assign(process.env, { GEMINI_CHAT_MAX_TURNS: '0', GEMINI_CHAT_MAX_OUTPUT_TOKENS: '10' });
    assert.deepEqual(budget.chatBudgetConfig(), { maxTurns: 0, maxOutputTokens: 128 });
  } finally {
    keys.forEach(k => saved[k] === undefined ? delete process.env[k] : process.env[k] = saved[k]);
  }
});
