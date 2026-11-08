// Offline checks for the AI review token/request budget (no network, no Gemini key).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

// "server-only" is provided by Next.js at build time; stub it for plain Node.
const originalLoad = Module._load;
Module._load = function (request, ...rest) { return request === 'server-only' ? {} : originalLoad.call(this, request, ...rest); };
const filename = path.resolve(__dirname, '../src/lib/ai/review-budget.ts');
const loaded = new Module(filename, module);
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
Module._load = originalLoad;
const budget = loaded.exports;

const config = over => ({ maxPerMinute: 2, maxPerDay: 3, maxTokensPerDay: 1000, maxOutputTokens: 1024, cacheMinutes: 30, thinkingLevel: 'MINIMAL', ...over });
// Noon Pacific on separate days keeps each test's daily counters independent.
const noon = day => Date.parse(`2026-12-${String(day).padStart(2, '0')}T20:00:00Z`);

test('defaults are free-tier friendly and env overrides apply (0 = unlimited)', () => {
  const keys = ['GEMINI_REVIEW_MAX_PER_MINUTE', 'GEMINI_REVIEW_MAX_PER_DAY', 'GEMINI_REVIEW_MAX_TOKENS_PER_DAY', 'GEMINI_REVIEW_MAX_OUTPUT_TOKENS', 'GEMINI_REVIEW_CACHE_MINUTES', 'GEMINI_THINKING_LEVEL'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    keys.forEach(k => delete process.env[k]);
    assert.deepEqual(budget.reviewBudgetConfig(), { maxPerMinute: 5, maxPerDay: 50, maxTokensPerDay: 100000, maxOutputTokens: 1024, cacheMinutes: 30, thinkingLevel: 'MINIMAL' });
    Object.assign(process.env, { GEMINI_REVIEW_MAX_PER_MINUTE: '0', GEMINI_REVIEW_MAX_PER_DAY: '500', GEMINI_REVIEW_MAX_TOKENS_PER_DAY: 'abc', GEMINI_REVIEW_MAX_OUTPUT_TOKENS: '10', GEMINI_THINKING_LEVEL: 'default' });
    const c = budget.reviewBudgetConfig();
    assert.equal(c.maxPerMinute, 0);
    assert.equal(c.maxPerDay, 500);
    assert.equal(c.maxTokensPerDay, 100000, 'invalid values fall back to the default');
    assert.equal(c.maxOutputTokens, 256, 'output cap has a floor so JSON is not always truncated');
    assert.equal(c.thinkingLevel, '', 'DEFAULT leaves the model default');
    process.env.GEMINI_THINKING_LEVEL = 'low';
    assert.equal(budget.reviewBudgetConfig().thinkingLevel, 'LOW');
  } finally {
    keys.forEach(k => saved[k] === undefined ? delete process.env[k] : process.env[k] = saved[k]);
  }
});

test('per-minute limit blocks, then frees after a minute', () => {
  const t = noon(1);
  assert.equal(budget.reserveReview(t, config()), null);
  assert.equal(budget.reserveReview(t + 1000, config()), null);
  const denied = budget.reserveReview(t + 2000, config());
  assert.equal(denied.reason, 'minute');
  assert.ok(denied.retryAfterSeconds > 0 && denied.retryAfterSeconds <= 60);
  assert.equal(budget.reserveReview(t + 61_000, config()), null);
});

test('daily request and token limits block until midnight Pacific', () => {
  const t = noon(3);
  for (let i = 0; i < 3; i++) assert.equal(budget.reserveReview(t + i * 61_000, config()), null);
  const denied = budget.reserveReview(t + 4 * 61_000, config());
  assert.equal(denied.reason, 'day_requests');
  assert.ok(denied.retryAfterSeconds > 10 * 3600 && denied.retryAfterSeconds <= 13 * 3600, `noon PT is ~12 h from midnight (${denied.retryAfterSeconds}s)`);
  assert.equal(budget.reserveReview(noon(4), config()), null, 'a new Pacific day resets the count');
  budget.recordTokens(1200, noon(4));
  assert.equal(budget.reserveReview(noon(4) + 61_000, config()).reason, 'day_tokens');
  assert.equal(budget.reserveReview(noon(4) + 122_000, config({ maxTokensPerDay: 0, maxPerDay: 0 })), null, '0 disables daily limits');
  assert.deepEqual(budget.usageToday(noon(4) + 122_000), { requests: 2, tokens: 1200 });
});

test('cache returns identical evidence until it expires; 0 minutes disables it', () => {
  const t = noon(6);
  const value = { review: { summary: 's' }, model: 'm', generatedAt: 'g', tokens: 42 };
  budget.setCachedReview('k', value, config({ cacheMinutes: 1 }), t);
  assert.equal(budget.getCachedReview('k', t + 59_000), value);
  assert.equal(budget.getCachedReview('k', t + 61_000), null);
  budget.setCachedReview('off', value, config({ cacheMinutes: 0 }), t);
  assert.equal(budget.getCachedReview('off', t), null);
});

test('identical concurrent requests share one call', async () => {
  let calls = 0;
  let release;
  const start = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const first = budget.shareInFlight('same', start);
  const second = budget.shareInFlight('same', start);
  assert.equal(first.joined, false);
  assert.equal(second.joined, true);
  release({ tokens: 1 });
  assert.deepEqual(await second.promise, { tokens: 1 });
  assert.equal(calls, 1);
  const third = budget.shareInFlight('same', async () => { calls++; return { tokens: 2 }; });
  assert.equal(third.joined, false, 'finished calls are not reused (the cache handles that)');
  await third.promise;
});
