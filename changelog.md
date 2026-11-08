# Changelog

Current version: **1.31**

## Instructions for future updates

When a contributor asks to update this changelog:

- Keep these rules and the entry template above the changelog entries. Add each new version entry below the rules and above the previous entries, keeping the full history.
- Keep versions in the `1.x` series and increase the second number for each update: `1.9`, `1.10`, `1.11`, `1.12`, and so on. Do not advance to `2.x` unless explicitly requested.
- Update the current version shown at the top of this file.
- Record the contributor's full name under **Author** and the update date as `YYYY-MM-DD`. Ask for the name if it is unknown; do not reuse the previous author's name automatically. List all authors for a shared contribution.
- Review the actual changes since the previous checkpoint and describe what changed, why it matters, and how it was verified. Do not repeat earlier changes as new work.
- Distinguish implemented behavior from tested behavior. Record remaining verification when relevant.
- Use this project's version sequence even for small changes; it is a team convention rather than semantic versioning.

Entry template:

```markdown
## Version X.Y — YYYY-MM-DD

**Author:** Contributor's full name

### Changes

- Describe the changes and affected files.

### Verification

- Record checks performed and their results.
- Note relevant checks still pending.
```

## Version 1.31 — 2026-11-08

**Author:** Josh Sebastian

### Changes

- Resolved PR #18 against main (`69b9c56`), preserving circular risk, reviewed outreach, response routing and marker controls alongside the area follow-up chat, Ask StateWatch AI assistant and development mock mode.
- Combined both branches' dashboard imports, response/map and AI styles, and frontend test commands. Preserved main's changelog entries 1.28/1.29 and renumbered this branch's former 1.28 entry to 1.30.

### Verification

- On Node 24.22.2, all 40 frontend scenario/notification/AI tests passed. Frontend lint passed with two warnings (generated bindings and an unused test import). Conflict-marker and whitespace checks passed for the merge changes.
- Frontend production compilation passed, but typecheck and build failed on pre-existing missing dummy-weather binding types/reducers and the unsupported response-approval `areaId` argument. The affected controls, action wrapper and generated bindings are unchanged by this merge.
- Backend tests passed 143 of 144; the unchanged dummy-weather test failed because returned radii were ordered `[1500, 3000, 500]` instead of `[500, 1500, 3000]`. Backend files are unchanged by this merge. Live browser/API acceptance remains pending; no database deployment, commit or push was performed during conflict resolution.

## Version 1.30 — 2026-11-08

**Author:** Josh Sebastian

### Changes

- Added shared circular High/Medium/Low risk modeling for map exposure and backend decisions, with None outside modeled event footprints. Added versioned administrator hazard ingestion, cancellation/expiry handling, a normalized-feed polling/replay script, and deterministic dummy-weather controls and scheduled updates.
- Added risk-specific notification message review and recipient risk/message/event snapshots, stale-event approval rejection, and event-area context for replies and response approval. Retained compatibility with the legacy cloud wire contract; risk-specific editing depends on matching generated bindings and backend deployment.
- Updated map risk displays, notification/response marker filters and badges, selected-household styling, and overlapping-event review context. Restyled the response workspace and added explicit run/team URL selection, area navigation, and routing-reset activity records.
- Added employee-managed dispatch-team enrollment and household dispatch-approval contracts, generated client bindings for new dispatch/hazard operations, and administrator removal of Alaska/Hawaii operational records. Added explicit local database seed/reseed scripts and setup documentation, workflow/routing plans, pnpm configuration and lockfile, and regression coverage.

### Verification

- All 31 frontend scenario, notification-dialog, shared-dashboard and AI tests passed with `npm --prefix frontend run test:scenario`.
- Backend tests were attempted with `npm --prefix backend test` but could not start on the installed Node 20.11.0 runtime: the Vitest dependency requires `node:util.styleText`. Backend tests on a supported runtime, typechecks, production/module builds, and live feed/browser/deployment acceptance remain pending for this checkpoint.
- `git diff --cached --check` reported an extra blank line at the end of `frontend/tests/notification-dialog.test.cjs`. No database deployment, reseed, commit or push was performed during this changelog update.

## Version 1.29 — 2026-11-08

**Author:** Tien Phan

### Changes

- Added the map-wide AI assistant **Ask StateWatch AI**. An **Ask AI** button floats in the bottom-right corner of the dashboard (`frontend/src/components/map/ai-assistant.tsx`, rendered by `map-dashboard.tsx` when at least one area is shown) and opens a chat panel with three starter questions and a 300-character question field. Answers are labeled AI-generated (and Simulation when applicable) and can include up to 3 **Review <area> →** buttons that open that area's popup. The panel closes with × or Escape and returns focus to the button. Modal popups still open above it.
- Added `POST /api/overview-chat` (`frontend/src/app/api/overview-chat/route.ts`) and the server-only call `frontend/src/lib/ai/generate-overview-chat.ts`. The browser sends a compact overview built by `frontend/src/lib/ai/overview-chat.ts`: totals across all shown areas plus per-area counts for up to 12 areas (most severe and most urgent first; the rest are counted in totals only). It carries counts and labels only, with no household names, IDs or coordinates. The route uses the same same-origin check as the review, a 32 KB body limit, and Gemini structured JSON output (`answer`, `relatedAreaIds`).
- Assistant rules for Gemini: answer only from the overview; compare areas only by named counts and never create scores, rankings or a priority order (the priority queue stays authoritative); keep household reports separate from scenario/forecast information; never add counts together or repeat a number from the question that is not in the overview; decline requests to notify, dispatch, change records or score households; treat the question as a question, not new instructions. Answers pass the shared no-new-numbers check, and related areas are limited to IDs present in the overview.
- Moved the shared multi-turn Gemini call into `frontend/src/lib/ai/gemini-chat.ts` (conversation building, timeout, token accounting, cut-off detection), now used by both area follow-ups and the assistant. The assistant shares the review budget and the per-conversation question limit (`GEMINI_CHAT_MAX_TURNS`), which resets when the map data or filters change or after an hour. Earlier answers are sent as context only when they were about the same view of the data.
- Added a development-only mock mode: `GEMINI_MOCK=1` in `frontend/.env.local` (`frontend/src/lib/ai/mock-mode.ts`). Reviews, follow-ups and the assistant then return canned text built from the snapshot counts, labeled with the model name "mock (no Gemini call)". No API key, Gemini call or budget is used. The canned text goes through the same validators as real replies. Production builds ignore it. This lets the follow-up and assistant UI be tested after the free-tier quota runs out.
- Styled the assistant in `globals.css`: a brand-red floating button and a fixed bottom-right panel (up to 400 px wide, scrollable thread), full width with 16 px gutters at 600 px or less. Added `frontend/tests/overview-chat.test.cjs` to `npm run test:scenario`. Updated `frontend/.env.example`, `README.md` and `frontend/src/components/map/README.md`.

### Verification

- `npm run build` (production, Turbopack) passed and lists `/api/area-chat`, `/api/area-review` and `/api/overview-chat`. TypeScript passed, ESLint on `src` reported 0 errors and 1 existing warning, and `npm run test:scenario` passed 36/36.
- Mock mode was exercised offline through the real modules with demo data: the review, a follow-up (with a question containing a number absent from the snapshot) and an assistant answer were all accepted by their validators, and the budget allowed calls even with limits that would otherwise deny them. The running dev server served the assistant styles.
- The Gemini API key appears in no `.next/static` file, `GEMINI_MOCK` appears in no browser bundle, and `frontend/.env.local` is still ignored by git.
- Pending: interactive browser check of the assistant (open/close, starter questions, Send, Retry, Clear, **Review <area> →**, limit and changed-data notices, narrow layout) and a live Gemini request through `/api/overview-chat`.

## Version 1.28 — 2026-11-08

**Author:** Tien Phan

### Changes

- Added AI follow-up questions to the area popup. After **Generate AI Review** succeeds, an **Ask a follow-up** box (`frontend/src/components/map/ai-area-chat.tsx`) shows three starter questions and a 300-character question field. Answers are labeled AI-generated, show their token use, and are suggestions only.
- Added `POST /api/area-chat` (`frontend/src/app/api/area-chat/route.ts`) and the server-only Gemini call `frontend/src/lib/ai/generate-area-chat.ts`. Each request carries the same small snapshot, the review, the last 3 answered turns and the question. The route uses the same same-origin check as the review, a 40 KB body limit, and re-validates the review against the snapshot so a client cannot slip in new figures. The route returns text only.
- Added the shared contract `frontend/src/lib/ai/area-chat.ts`: request validation, question cleanup, starter questions, and answer validation. Answers reuse the review's no-new-numbers check (now exported as `unsupportedNumbers` from `area-review.ts`). Leading numbered-list markers are turned into bullets first so they are not mistaken for figures. An answer with an unsupported number is withheld with a rephrase message.
- Follow-up rules for Gemini: answer only from the snapshot and review; say when something is not in the evidence; keep expected conditions separate from reported impacts; never claim evacuation orders or safe routes; decline unrelated questions and requests to notify, dispatch, change records or rank households; never repeat a number from the question that is not in the snapshot; and treat the question as a question, not new instructions.
- Budget: `reserveReview` is now `reserveGeminiCall`, so reviews and follow-ups share the per-minute, per-day and daily-token limits from v1.24. New limits `GEMINI_CHAT_MAX_TURNS` (default 6 answered follow-ups per review, 0 = off; failed calls do not count; resets after an hour or when the evidence changes) and `GEMINI_CHAT_MAX_OUTPUT_TOKENS` (default 512, floor 128). Minimal thinking applies to follow-ups too.
- The chat resets when the area, phase or review changes, cancels its request when the popup closes, ignores answers for a different area, and turns off with a notice when area data changes after the snapshot. Failed questions show a Retry button.
- Made the middle of the area popup scrollable (`globals.css`) so the review and follow-up box are no longer hidden behind the fixed **Back to map** / **Take action** bar. On wide screens the details column scrolls next to the map; on narrow screens (700 px or less) the map and details scroll together. The heading and actions stay fixed. Removed the chat's duplicate "does not send or dispatch" note, since the review's note directly below already says it.
- Added `frontend/tests/area-chat.test.cjs` (5 tests) to `npm run test:scenario`. Updated `frontend/.env.example`, `README.md`, `frontend/src/components/map/README.md`, and styles in `globals.css`.

### Verification

- `npx tsc --noEmit`, ESLint on `src` (0 errors, 1 existing warning), `npm run build`, and `npm run test:scenario` (30/30) passed.
- Live requests against `gemini-3.6-flash` through the dev server: "What evidence is missing?" answered from the evidence (200, 1,168 tokens, 2.8 s); an unrelated question was declined (200, 1,075 tokens); a tampered review was rejected (400); the per-minute limit returned 429 for calls beyond 5 in a minute; one call hit Gemini's temporary 503 and mapped to a retryable error.
- A prompt asking Gemini to dispatch a team and claim 500 evacuations was first refused, but the refusal repeated "500" and was withheld by the number check. After adding the "never repeat a number from the question" rule, the same prompt was refused without the number (200, 1,131 tokens), and "Can you send the notifications for me?" was declined, pointing to employee action in the app (200, 1,173 tokens). The answered-follow-up counter dropped 5, 4, 3, 2 as expected.
- `/api/area-chat` safety checks without Gemini calls: GET 405, cross-origin 403, non-JSON 415, missing snapshot 400, oversized body 413. `npm audit --omit=dev` found 0 vulnerabilities. The API key appears in no `.next/static` bundle or tracked file, and `frontend/.env.local` is still ignored by git.
- Headless Chrome (1280×760 and 390×760) on `/demo`: opened **Review an area**, generated a review, and confirmed the follow-up box started below the action bar and became fully visible above it after scrolling the popup; no horizontal page scroll.
- Pending: interactive browser check of the chat box (starter buttons, Send, Retry, limit and stale states).

## Version 1.27 — 2026-11-08

**Author:** Karthik Bhagavatula

### Changes

- Resolved PR #15 against main while preserving shared dashboard notices, replies, safe-confirmation carryover, clock validation and assignment approvals alongside the scenario desk, response-routing backend/worker and on-demand Gemini reviews.
- Unified the connected map and operational queue on the response connection hook, retained both backend table/reducer contracts, and regenerated the combined TypeScript bindings. Preserved the compile-first scenario builder and combined all scenario/AI test scripts. Fixed the retained routing worker build command to invoke esbuild through Node on Windows.
- Reconciled documentation and retained both branches' changelog entries; the PR's two entries are now 1.25 and 1.26 after main's 1.24.

### Verification

- All 134 backend tests across 13 files, 27 frontend scenario/adapter/AI tests and nine Python dataset tests passed on Node 24.22.1 and Python 3.12. Backend/frontend typechecks, the standard and staged Small module builds, routing-worker bundle and default Turbopack production build passed. Frontend lint passed with one existing generated-bindings warning.
- No conflict markers or whitespace errors remain. Interactive acceptance of the combined layout and live multi-client verification of this merge remain pending. No commit, push, real Gemini API call or live database deployment/mutation was made.

## Version 1.26 — 2026-11-08

**Author:** Karthik Bhagavatula

### Changes

- Fixed `backend/package.json`'s `build:scenario` command to compile the TypeScript runner with the existing esbuild dependency before running the resulting ignored `.mjs` file. This removes the direct `.ts` execution that raised `ERR_UNKNOWN_FILE_EXTENSION` in the user's Node 22.13.1 terminal; no new dependency was added.
- Documented the separate SDK-supported Node requirement and a PowerShell session command selecting the existing workspace's portable Node 24.22.1 runtime and Python 3.12. Kept all earlier application changes and changelog history intact.

### Verification

- The repaired command built and validated the Demo preset successfully on Node 24.22.1: 10,000 households, 56 disasters, 112 zones, 220 teams, 2,000 requests and 93 impact layers. The staged SpacetimeDB module build and backend TypeScript check passed.
- Node 22.13.1 remains below the SDK's declared supported engine range; this change does not claim SDK compatibility with that version. No database was published, reset or mutated. No commit or push was made.

## Version 1.25 — 2026-11-08

**Author:** Karthik Bhagavatula

### Changes

- Connected Aalvee's merged notification-popup design to SpacetimeDB using Tien's existing shared connection/action wrappers. Main `/` and `/demo` now use shared operational data; retained the unchanged local rehearsal at `/demo/local` and the standalone `/outreach` route. Preserved StateWatch styling, area reviews, notification editing, tab behavior, pagination and simulated-action labels.
- Added private global clock/run, per-area notice, recipient/reply and assignment-link tables with employee-authorized views. Approved text and recipient snapshots persist across popup closure, area/tab changes, reloads and clients. Notice approval does not count as confirmed contact and sends no external message.
- Preserved the new demo policy: safe preparation replies carry forward into After, confirmed-safe households leave repeat outreach and dashboard response review, and older assistance records remain intact. Before permits safe confirmation; After also permits needs-help. Each second notice has its own complete 30-minute deadline, including notices approved after earlier areas' deadlines. Due unanswered/needs-help cases receive reviewable welfare requests; dispatch is never automatic.
- Added server-validated response approval that rechecks safety/phase, all recorded active need capabilities, people capacity, availability and assignment conflicts, then calls the existing atomic assignment reducer and records its link. Completion/cancellation reuse the original lifecycle. Other unresolved requests are retained; cancellation permits renewed approval, while completed assistance remains represented in the current dashboard run.
- Replaced browser-local mutations in connected mode with subscribed snapshots and awaited reducer calls. Added pending/error feedback and run/minute validation from the rendered snapshot, preventing a stale preparation popup from silently submitting into a newer phase. The connected queue follows safe exclusions, separately labels simulated notification-deadline concerns, and supports restored critical-exposure scoring (default maximum 190).
- Restored earlier decision/preparedness/exercise source and schema contracts already present in the running local database but absent from the newly merged checkout. This retained existing tables/columns during migration instead of deleting data. Restored 17 preparedness tests, modern schema-v3 Small, generator-v4 Small team regions/reproducibility, and Windows junction staging. Regenerated bindings for restored and new views/reducers.
- Updated the existing persistent local `riskreach-person3-demo` with `--delete-data=never`. The migration only added four private dashboard tables and four views. Before/after counts stayed at 10,000 households, 2,000 requests, zero assignments and two memberships, including the user's previously enrolled browser. No reseed/reset was performed on the main dataset.
- Added backend lifecycle/queue tests, frontend snapshot-join regressions and a disposable live verifier using the actual frontend wrappers, subscription adapter and map model. Added a scoped CommonJS test lint override and portable shared-module imports. Updated README progress/handoffs and added `backend/POPUP_WORKFLOW.md` with current route, policy, permissions, upgrade and verification commands.

### Verification

- All 104 backend tests across nine files passed on supported Node 24.22.1 with Python 3.12. This includes seven new shared-popup/queue cases and 17 restored preparedness cases, plus existing exposure, priority, follow-up, dispatch and large-fixture regressions. All 18 frontend scenario/adapter tests and all nine Python tests passed, including exact bundled Small reproducibility.
- Backend/frontend typechecks, module generation/build, staged Demo build, frontend lint and the default Turbopack production build passed. Build output includes `/`, `/demo`, `/demo/local` and `/outreach`. Lint retains one existing generated-bindings warning.
- Real two-client verification passed in a separate disposable Small database (`riskreach-popup-live-check`): shared notices/replies/clock, carried-safe exclusion without erased needs, duplicate/stale rejection, real competing assignment with exactly one winner, completion/team release, reconnect using the same identity, reset/replay and live access revocation. Temporary memberships are revoked in cleanup. The verifier did not mutate or reset the main Demo database.
- Desktop Brave smoke verification passed using the user's already enrolled browser: `/demo` displayed Connected, 10,000 dataset households, shared clock, live priority queue, area review and the Shared simulation notification popup with an enabled approval button. No notice or assignment was submitted in the main dataset during this check. Some basemap tiles failed to load; overlays, clustering and popup navigation remained usable. Full two-browser mutation, keyboard and narrow-layout acceptance remain pending. All actions remain synthetic; actual AI generation/delivery are unconnected and full-table subscriptions remain in use.
- No commit, push or cloud deployment was made. Existing local data and browser enrollment were preserved.

## Version 1.24 — 2026-11-08

**Author:** Tien Phan

### Changes

- Added a configurable token and request budget for the AI area review in `frontend/src/lib/ai/review-budget.ts`, so the free tier lasts longer and limits can be raised later through `frontend/.env.local` without code changes (0 turns a limit off):
  - `GEMINI_REVIEW_CACHE_MINUTES` (default 30): a review for identical evidence (same model, area, phase, counts, and sources) is reused from an in-memory server cache with no Gemini call. Identical concurrent requests share one call.
  - `GEMINI_THINKING_LEVEL` (default `minimal`; `default` keeps the model's own level, needed for models without `minimal` such as `gemini-3.8-flash` per Google's thinking docs).
  - `GEMINI_REVIEW_MAX_OUTPUT_TOKENS` (default 1,024, minimum 256; includes thinking tokens). A truncated reply is reported as an error rather than shown.
  - `GEMINI_REVIEW_MAX_PER_MINUTE` (default 5, replacing the fixed 6), `GEMINI_REVIEW_MAX_PER_DAY` (default 50), and `GEMINI_REVIEW_MAX_TOKENS_PER_DAY` (default 100,000), counted per Pacific-time day because Google resets daily quotas at midnight Pacific. Limits apply only when Gemini is actually called; cache hits are free.
- The route now records Gemini's reported token usage (server log shows prompt, thinking, and output tokens) and returns `cached` and `tokens`. The popup shows the token count or "Reused for unchanged evidence (no new tokens)". After a successful review the button reads **Review is up to date** and is disabled until the area's evidence changes, then offers **Regenerate with new data**.
- The development-only `GEMINI_REVIEW_SIMULATE_ERROR` check now runs before the cache, so cached reviews do not hide simulated errors.
- Counters and cache are per server process and reset on restart; they are not shared across multiple deployed instances. Google's project-level quotas still apply (Google's rate-limit page says limits are per project, not per key, and lists per-model free-tier values in AI Studio rather than on the page).
- Documented the variables in `frontend/.env.example` and the README.
- Pre-PR review fixes: removed the `temperature: 0.2` setting because Google's text-generation docs say Gemini 3.6+ ignores custom temperature, top_p and top_k and advise removing them; restored the small-text style of the popup's "Geographic membership" note, which lost its `.compact-area-brief > .muted` match when v1.23 wrapped the summary in a container (now `.brief-summary`); updated the README implementation note that still cited the old fixed limit of 6 reviews per minute.

### Verification

- Frontend `tsc --noEmit` passed; ESLint on `src` reported 0 errors (existing generated-bindings warning); `npm run build` passed.
- `npm run test:scenario`: 25 of 25 passed, including 5 new budget tests (defaults and env overrides, invalid values, per-minute release, daily request/token limits and Pacific-day reset, cache expiry and disabling, in-flight sharing).
- Live, with the Tampa fixture snapshot through the dev-server route: the first request returned 200 in 2.6 s using 984 tokens; an identical repeat returned in 5 ms from the cache with 0 tokens. A direct comparison with the same short prompt on `gemini-3.6-flash` used 1,413 tokens (827 thinking) and 5.7 s at the model's default level versus 742 tokens (0 thinking) and 2.3 s at `minimal`. One `minimal` comparison attempt first received Gemini 503 (overloaded).
- Pending: interactive browser check of the token label and the up-to-date/regenerate button states.

## Version 1.23 — 2026-11-08

**Author:** Tien Phan

### Changes

- Connected Gemini to the area-review popup's review section. `frontend/src/components/map/ai-area-review.tsx` replaces the "AI review · Preview" block in `AreaBrief` with the existing scenario guidance (now labeled **Scenario guidance**) and an explicit **Generate AI Review** button; nothing is generated on open, click, or data update. The section stays mounted while the evidence view is open, so a generated review is not lost.
- Added `frontend/src/lib/ai/area-review.ts`, a dependency-free contract shared by browser and server: `buildAreaSnapshot` (selected area only: hazard, severity, source, timestamps, simulation flags, up to 8 impact layers with basis/limitations/data kind, household counts by check-in, recorded-need/vulnerability/never-contacted counts, top 8 needs and vulnerability flags, team counts by status, and up to 5 guidance items; no household names, IDs, or coordinates), `parseAreaSnapshot`, the Gemini JSON schema, and `parseAreaReview`, which requires all fields, caps lengths, and rejects any number not present in the snapshot.
- Added `POST /api/area-review` (`frontend/src/app/api/area-review/route.ts`) and the server-only `frontend/src/lib/ai/generate-area-review.ts`. The route checks same-origin and JSON content type, limits the body to 16 KB, validates the snapshot, returns `not_configured` (503) without a key, and applies a local limit of 6 reviews per minute per server process. Generation uses the existing client and `GEMINI_MODEL` (default `gemini-3.6-flash`, free tier), temperature 0.2, structured JSON output, a 30-second timeout, and a system instruction to use only the snapshot, separate expected conditions from reported impacts, label simulations, and not invent numbers, evacuation orders, safe routes, or confirmed exposure. SDK errors map to `rate_limited` (429), `upstream_error`, `timeout`, or `invalid_response` with safe messages; upstream error text is logged by status only.
- The UI shows the review with an **AI-generated · model** label, a **Simulation** label when the area or a layer is simulated, snapshot and generation times, and sections for summary, expected conditions, reported impacts, key risks, suggested next steps (employee review required), and limitations. Loading, retry, and error states keep the structured area details visible. Responses are keyed to the area and phase and guarded by a request sequence; a selection change or newer request aborts the old one, so a response cannot appear under another area. A notice appears when area data changes after the snapshot.
- Added an optional `dataKind` (simulation/forecast/report) to `MapImpactLayer`, populated by the SpacetimeDB adapter so reported layers can be distinguished; fixtures report `unspecified`.
- Added a development-only `GEMINI_REVIEW_SIMULATE_ERROR` switch (`rate_limit`, `api_error`, `timeout`, `invalid_response`) for testing error states without changing the key; it is ignored in production builds and listed in `frontend/.env.example`.
- AI output is text only. It does not send notifications, dispatch teams, write to SpacetimeDB, or affect deterministic priority scores. No billing was enabled. Chatbot and AI-drafted notifications remain later work.
- Added AI review styles to `globals.css`, `tests/area-review.test.cjs` (included in `npm run test:scenario`), and README/map handoff updates.

### Verification

- Frontend `tsc --noEmit` passed; ESLint on `src` reported 0 errors (existing generated-bindings warning); `npm run build` passed with `/api/area-review` as a dynamic route.
- `npm run test:scenario`: 20 of 20 passed, including 4 new offline tests for snapshot scoping and privacy (no names, IDs, or coordinates), snapshot validation of tampered/oversized input, review validation (missing fields, wrong types, invented numbers), and fingerprint changes.
- Against the running dev server: an invalid snapshot returned 400, a cross-origin request 403, and GET 405. With the local key, the first two live requests with the Dallas fixture snapshot received Gemini 503 (overloaded), which the route returned as `upstream_error`; the next request returned 200 in about 20 seconds from `gemini-3.6-flash`, passed validation, and separated simulated expected conditions from reported check-ins.
- Confirmed the key value and the `GEMINI_API_KEY` name do not appear in `.next/static` browser bundles or tracked files.
- Rebased onto main after the response-routing merge (main v1.21) and Tien Phan's Gemini client entry (v1.22); this entry was renumbered from 1.22 to 1.23. The connected main dashboard README text from main was kept, with the AI review notes added.
- Pending: interactive browser checks of the button, loading/error/retry states, area-switch cancellation, the stale-data notice, and the not-configured, simulated rate-limit, and API-error paths in the UI.

## Version 1.22 — 2026-11-08

**Author:** Tien Phan

### Changes

- Added a reusable server-only Gemini client in `frontend/src/lib/ai/gemini.ts` for the planned AI area review. It reads `GEMINI_API_KEY` and an optional `GEMINI_MODEL` (default `gemini-3.6-flash`, the stable Flash model with a free API tier per Google's model and pricing pages checked on 2026-11-08). It uses the Gemini Developer API with API-key auth, not Vertex AI, and reuses one client unless the key changes. A missing key throws `GeminiNotConfiguredError`; `isGeminiConfigured()` reports presence without exposing the key.
- `import "server-only"` makes any Client Component import of the client fail the build, so the key cannot be bundled for the browser.
- Added the `@google/genai` 3.0.0 dependency (`frontend/package.json`, lockfile).
- Added `frontend/.env.example` with SpacetimeDB and Gemini placeholders. The root `.gitignore` still ignores `.env*` (including `.env.local`) but now allows `.env.example` to be committed.
- README: local setup notes for the Gemini variables and the free-tier data-use caveat; Person 4 AI review checklist note.
- No UI, API route, chat, or SpacetimeDB change in this step. No billing was enabled.

### Verification

- Frontend `tsc --noEmit` passed; ESLint on `src` reported 0 errors (existing generated-bindings warning); `npm run build` passed (`/`, `/demo`, `/_not-found`).
- A temporary Client Component page importing the client failed the build with the `server-only` error, confirming the guard; the page was removed.
- Offline check with a fake key and no network calls: no key reports not configured and throws `GeminiNotConfiguredError`; with a key the same client instance is reused with `vertexai` false; `GEMINI_MODEL` overrides the model after trimming, and a blank value falls back to the default.
- Confirmed `frontend/.env.local` is ignored and has never been committed. No live Gemini request has been made yet.
- Merged with main's v1.19, v1.20 (Aalvee Ahtav) and v1.21 (response-routing merge); this entry was renumbered from 1.19 to 1.21 and then to 1.22 to avoid duplicate versions.

## Version 1.21 — 2026-11-08

### Changes

- Merged main into response routing, preserving the shared connected desk and routing connection alongside StateWatch branding, dashboard popup rehearsal, and the retained connected outreach route. Combined styles and configuration and retained both branches’ history.

### Verification

- Frontend TypeScript, all 16 scenario tests and lint passed (one existing generated-bindings warning). All 127 backend tests, backend typecheck and the production Webpack build passed on Node 24.22.2. The build required network access for the configured Google font. Interactive browser acceptance remains pending.

## Version 1.20 — 2026-11-08

**Author:** Aalvee Ahtav

### Changes

- Moved the fixture demo's operational rehearsal onto the dashboard. **Take action** now replaces the area-review popup with `NotificationDialog` rather than navigating to `/outreach`. Employees can review/edit and approve the initial notice, simulate replies, close the popup, and advance time with dashboard controls. The older standalone outreach route remains available with its previous independent fresh-check-in behavior; connected map and notification details remain read-only; the merged operational panel separately supports persisted Mark contacted.
- Added `dashboard-scenario.ts` with a shared fictional clock, per-area notification rounds/recipient snapshots, a two-hour impact skip, and independent 30-minute deadlines starting at each area's second notice. Closing popups or changing areas/tabs preserves rehearsal state; reset, reload, or leaving the dashboard clears it. Before becomes a preparation-history view after impact.
- Changed the dashboard demo's follow-up policy: confirmed-safe households are excluded from repeat notifications, the map/attention queue, and response-unit approval, even when an older welfare-check need is recorded. The assignment reducer enforces the same exclusion; original need records remain intact. Unanswered households carry into the second notification, and silence becomes eligible for response review only after that area's second-notification deadline. Explicit help replies and unresolved recorded needs are reviewable immediately after impact unless confirmed safe.
- Added employee-approved local response-unit matching by area, exact required capabilities, availability, and positive capacity. Assignments update the displayed team availability and prevent duplicate household assignments or reuse of an active unit. Cases without a suitable available unit remain visible. This is a fixture-only matcher, separate from Person 3's full backend recommendation/ETA helper.
- Renamed visible frontend branding, metadata, and fixture source labels to StateWatch; retained internal `riskreach` package/database/token identifiers. Changed the hero to **Disaster watch**, replaced the subtitle with a red count of visible area alerts containing unresolved, unassigned households, and renamed phase controls to **Disaster prep / After disaster respond**. The count reflects loaded and hazard-filtered records; it is not a risk score.
- Moved Overview, Households, Teams, and Preparedness navigation from the app header to the top of the household/team panel. Preserved active-state styling and added horizontal overflow for narrow layouts.
- Applied Noto Sans through `next/font/google`, including normal/italic variable styles and the global font token. Updated form controls, notification textareas, map labels, and markers to use the app font. Fonts are downloaded during an uncached build and served with the app.
- Updated the root README and map handoff for the current popup workflow, local-versus-connected behavior, setup/troubleshooting, verification, and remaining work. Revised Persons 1–4 responsibilities and deliverables, recorded Josh Sebastian and Karthik Bhagavatula from existing project history, and distinguished Person 1's completed local frontend rehearsal from Person 4's pending shared-state integration. The subsequent merge identifies Person 4 as Tien Phan; the README now credits his delivered queue and Mark contacted work.

- Reconciled the merge with Tien Phan’s operational workflow: preserved the connection/action lifecycle, raw subscribed rows, selection-aware workflow slot, priority queue and its stylesheet alongside the popup demo, standalone outreach route, and StateWatch styling. Retained Tien’s v1.18 entry; renumbered the local popup checkpoint to v1.19 and this dashboard checkpoint to v1.20 to avoid duplicate versions. Updated the README ownership and progress to reflect the live queue and persisted Mark contacted action.

### Verification

- After resolving merge conflicts, frontend TypeScript checking, the Webpack production build, and all 16 `npm run test:scenario` tests passed: nine dashboard-flow regressions plus seven retained standalone-outreach regressions. Dashboard coverage includes safe-confirmation exclusion with older needs, safe community cases, second-notification recipients, per-area deadlines, help versus silence eligibility, team matching, duplicate assignments, and reset/source immutability.
- `npm run build -- --webpack` passed after the final Noto Sans integration, producing `/`, `/demo`, and `/outreach`. The first sandboxed attempt could not resolve `fonts.googleapis.com`; a network-enabled retry fetched the font and completed successfully. The default Turbopack production build was not reverified.
- The dashboard preview returned HTTP 200 at `/demo` during this contribution. Git whitespace and documentation consistency checks passed. Full interactive visual/responsive/keyboard acceptance and connected-backend/two-browser operational verification remain pending; screenshots and state tests do not establish those checks.
- No new backend test suite or lint run was performed for this checkpoint. AI generation, real notification delivery, persisted/shared scenario state and dispatch, authoritative score/flag persistence, assignment completion UI, and full backend recommendation integration remain pending. No deployment, real outreach, or operational dispatch was performed.

## Version 1.19 — 2026-11-08

**Author:** Aalvee Ahtav

### Changes

- Added a centered area-review popup opened by the red map information icon, with a map scoped to the selected area, severity, household context, and a source-based AI preview. The compact layout places the map beside the review on wider screens and reduces its size on narrow screens; action buttons remain outside the content area. Evidence and source details use a separate view with paged shapes instead of expanding the popup. Escape, close/back buttons, and backdrop dismissal restore focus.
- Added **Take action** navigation to `/outreach?area=<id>&mode=demo` or `mode=connected`, preserving the selected area and data mode. The outreach page focuses on preparation controls and households needing attention, without a map. Connected mode reuses the authorized subscription flow, shows read-only customer/community records, and handles loading, connection errors, and unavailable areas.
- Added the browser-local scenario rehearsal available through `/demo`: employee-approved simulated notices, a two-hour skip to impact, a fresh post-disaster check-in, and a 30-minute follow-up deadline. Previous replies remain history and do not answer a new check-in. State resets when leaving the page, changing areas, reloading, or explicitly resetting.
- Limited pre-disaster replies to **safe**. Removed the pre-disaster need-help button and metric, updated the suggested notice to request safety confirmation only, and labeled unanswered sent check-ins **No reply**. The reducer rejects pre-disaster help replies; silence remains an absent reply. Confirmed-safe customers leave the pre-disaster attention filter even when source records contain an earlier need.
- Kept **safe** and **need help** replies after impact. Help requests can be reviewed immediately; unanswered post-disaster cases become eligible for a simulated welfare check after the deadline. Local team matching requires availability, welfare-check capability, positive capacity, and the same area; duplicate active assignments are prevented. Safe replies do not clear recorded assistance needs after impact.
- Added fictional outer/core impact bands, severity styling, area information markers, and three customer records per fixture hotspot to exercise safety and unanswered outcomes. Counts remain geographic membership rather than verified exposure. AI generation, actual notification delivery, persisted/shared operational controls, and full backend team-recommendation integration remain pending; no messages are delivered or teams dispatched by the rehearsal.

### Verification

- Frontend type checking passed after the final safety-only preparation change. All seven `npm run test:scenario` tests passed, covering pre-disaster reply restrictions, silence, fresh post-impact rounds, immediate help versus overdue unanswered cases, safe-response exclusion from no-response dispatch, duplicate assignments, and reset behavior.
- `npm run build -- --webpack` passed with `/`, `/demo`, and `/outreach` after the compact popup changes. The later safety-only preparation change was checked with TypeScript and scenario tests; the production build was not repeated afterward. Earlier Turbopack worker-port failures remain historical; a successful Webpack build does not verify that Turbopack restriction is resolved.
- Static rendering checks during the popup/outreach split verified selected-area/data-mode links, URL encoding, read-only connected behavior, community cases, unavailable areas, and removal of inline outreach from the overview. These checks preceded the subsequent map relocation, compact popup, and safety-only UI refinements.
- Git whitespace checks passed. Final visual checks for popup fit, keyboard interaction, responsive map sizing, and the revised check-in flow remain pending, as do connected-backend end-to-end verification and the full shared operational acceptance checks. No deployment or real outreach/dispatch was performed.

## Version 1.18 — 2026-11-08

**Author:** Tien Phan

### Changes

- Started Person 4's operational workflow in `frontend/src/components/workflow/`. This entry replaces the earlier Person 4 v1.15 entry, which was overwritten when main's v1.15 (team recommendations) merged.
- `actions.ts` adds typed wrappers for every operational reducer (check-in, outreach, tasks, requests, assignments, escalation, reset) and converts string view-model IDs to u64. A `ConnectionLink` reuses the single connection owned by `ConnectedDashboard`, so no second connection or identity is opened.
- `action-feedback.tsx` shows one shared pending/success/error message after every action. Backend rejections show the reducer's own `SenderError` text, for example "Team is unavailable".
- `operational-workflow.tsx` is mounted through `MapDashboard`'s `workflowPanel` slot. Its "Record outreach" card acts on the household selected on the map or in the queue (a dropdown would list every household, 10,000+ in the Demo preset), showing check-in and last-contact time with a "Mark contacted" button that calls `recordOutreach`; results return through the existing subscription, so other sessions see them live.
- Added the live priority queue. `frontend/src/lib/workflow/priority-queue.ts` builds it from subscribed rows by importing Person 3's `rankHouseholds` and `detectFollowUp` from `backend/src` (not copied, so there is one source of truth). Exposure is computed in the browser from subscribed impact layers with `calculateExposure`. With no layers, every household gets empty exposure and the queue says so; unsupported layers are skipped and counted. Each layer is checked on its own with Person 3's validator, so one malformed or duplicate layer is skipped instead of zeroing exposure for every household. The clock never runs behind the latest recorded contact, which tolerates browser/database clock skew.
- `priority-queue.tsx` shows ranked rows with score out of 175, hazard/zone/check-in tags, an Overlooked flag, follow-up concerns, and a "Why this score" breakdown of all six reasons. Views: Needs follow-up (default), Overlooked, and All households, plus a hazard filter, with counts and paging of 25. "Show on map" selects the household; "Mark contacted" records outreach. Labeled "Demo scoring — employee review required", with the assumption label, exposure source, and overlooked rule shown. Time-based rules recompute every 30 seconds; the clock is read in an effect, not during render, because Cache Components prerenders `/` and rejects `Date.now()` there.
- `MapDashboard`'s `workflowPanel` can now be a function that receives the map selection and its setter. This is backward compatible and documented in `frontend/src/components/map/README.md`. `ConnectedDashboard` also passes raw subscribed rows, since the queue needs request urgency and microsecond timestamps.
- `next.config.ts` sets `turbopack.root` and `outputFileTracingRoot` to the repository root, because Turbopack does not resolve files outside its root. `tsconfig.json` targets ES2020 for BigInt literals in the shared helpers.
- Reconciled with Aalvee Ahtav's v1.17 redesign: kept the redesigned dashboard and stylesheet unchanged apart from the `workflowPanel` hook, and restyled the workflow/queue CSS with the redesign's brand, border, and status tokens (red pill buttons, shared check-in colors). Restored the workflow styles that the earlier merge had dropped. Updated the README Person 4 checklist and Person 3 integration notes.

### Verification

- After reconciliation: frontend `tsc --noEmit` passed and ESLint on `src` passed with the existing generated-bindings warning. Installing the redesign's new `leaflet.markercluster` dependencies (already in the lockfile) was required for typechecking. Full `npm run lint` still reports six `require()` errors in the redesign's `tests/scenario-demo.test.cjs`, unrelated to this work.
- Offline smoke test on the Small fixture: 60 households, 24 need follow-up, 12 overlooked, all six hazards mapped. Recording contact on the top household cleared its overlooked flag while it still needed follow-up (score 105 to 90). A synthetic high-severity layer added 30 exposure points, and an unsupported layer was skipped.
- Before the redesign merge, the dev server rendered the queue after the Turbopack root change; before that change, the backend import failed with "Module not found". After reconciliation, the running dev server reported a cached "Can't resolve leaflet.markercluster CSS" error because it was started before the dependency install; a restart is needed to re-verify rendering.
- `npm run build` on Next.js 16.4.5 first failed prerendering `/` ("unstable value `Date.now()` in a Client Component") and passed after the clock fix, prerendering `/`, `/demo`, and `/_not-found`.
- Offline check: one valid plus one malformed layer (simulation flag mismatch) still gives the valid layer's 30 exposure points and reports 1 ignored layer. `npm run test:scenario` passed (6 of 6).
- Pending: interactive browser checks and two-session verification of Mark contacted and queue updates.

## Version 1.19 — 2026-11-08 (response routing)

**Author:** Josh Sebastian

### Changes

- Implemented response-routing configuration, an isolated 20-household/two-team Dallas fixture, and dedicated welfare queues. Existing nationwide fixtures/manual assistance remain available. Unknown routed cases need no fabricated requests or passenger-capacity checks.
- Added private run/config, visit, route, position and worker-membership tables; authorized views; regenerated bindings; and reducers for settings, fenced leases, planning holds, version-checked publication, pause/resume, availability, movement/dwell/completion and isolated reset. Safe reports atomically cancel future/travelling visits; active checks retain a notice and unrelated assistance stays open. Manual dispatch rejects welfare-reserved teams. Full reset invalidates workers and routing rows.
- Integrated fresh authoritative post-impact rounds and the shared exercise deadline/clock. Playback preserves elapsed time across pause/settings/holds; active service keeps its start-time duration. Leases have increasing fencing tokens and a separate worker heartbeat; epoch/config/origin/route/sequence checks reject stale work.
- Added the persistent Node routing worker, deterministic urgent-first insertion heuristic, bounded relocation/swap/reversal, fixed active destinations/service, urgent targets, waiting-time ties, assignment-change preference, uncovered reasons, road-polyline movement and return-to-staging checks. API requests occur on relevant replans/refresh, not movement ticks. Failed solves keep valid old legs stale and freeze invalid destinations.
- Adapted the original matrix plan to Josh's no-billing requirement: default Google demo-key mode uses supported Compute Routes legs to construct directional estimates and final road routes, with bounded waypoint batches, traffic-unaware estimates, no provider reordering, request limits and explicit errors. Compute Route Matrix returned `BILLING_DISABLED`; no billing settings were changed. Offline fixture routing is explicitly selected and labelled, never silently substituted.
- Configured the Turbopack workspace root to include the shared routing config; the live development server otherwise returned a module-resolution error despite the webpack build passing. Started and enrolled the persistent no-billing Google demo worker on loopback port 3201 for user testing.
- Added `/response` with Google map, selected team, ordered stops/ETAs, notices, uncovered cases, settings, playback controls and deterministic scenario actions. Extracted the existing endpoint-scoped connection lifecycle for both page shells. Leaflet keeps household states/team movement and welfare destination grouping; Google geometry stays on the response screen and in short-lived worker memory.
- Added worker startup/enrollment, demo-key setup and user acceptance instructions to `backend/SHARED_WORKFLOW.md`, plus a disposable offline live verifier. Browser keys accept both the planned variable and the existing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` name. Secrets were not printed or committed.
- Upgraded the actual configured local `riskreach-stress-100k` database using its matching Stress bundle with `--delete-data=never`, and initialized shared decision state. Confirmed 100,000 households, 1,970 teams and 20,000 requests remain. The older README Demo database was absent; the initial precheck stopped without publishing there. A first verification assertion incorrectly included query-duration metadata; corrected comparison checks row counts.

### Verification

- Supported Node 24.22.2: all 127 backend tests pass, backend/worker typechecks pass, generated module/Stress builds pass, and frontend typecheck/production webpack build pass. Lint passes with one existing generated-bindings unused-disable warning. Default Turbopack is blocked by this environment's build-process port restriction.
- Transactional tests cover safe queued/en-route/in-progress behavior, service dwell, duplicate stops/ticks, worker expiry/takeover, origin/config/shift versions, settings/clock holds, unavailable teams, stale reset work and isolated fixture cleanup. Provider tests cover road interpolation, missing edges, narrow masks, billing error parsing, demo-only leg estimates and stripping household metadata from Google requests. Small exact reference and two-team nearest-next comparisons pass; the fixture heuristic covers all 17 non-safe households and meets the urgent-wait comparison. No global-optimality claim is made.
- Disposable live offline verification passed twice: two published team routes, both teams moving, safe queued/current cancellation, urgent replanning, pause freezing positions and loopback geometry delivery. Temporary memberships were revoked and the test worker stopped. Only this isolated verifier resets test data.
- Live no-billing Google checks passed Compute Routes (HTTP 200), a two-point directional estimate and final road polylines (two legs, 31 vertices each; endpoint snaps about 15–16 meters). Full-fixture Google quota/road acceptance and interactive browser testing remain for the user. Browser automation was unavailable/not approved; user elected to test the UI themselves. The main worker is now running and enrolled for user testing; no synthetic routing run was automatically started.

## Version 1.18 — 2026-11-08 (shared decisions)

**Author:** Karthik Bhagavatula

### Changes

- Restored Person 3's missing authoritative decision integration from the earlier staged source: preparedness helper/adapter, 17 tests and report CLI; private decision/run/catalog/timer state; authorized summary and selected-household/request views; transactional refresh; reviewed run-aware task approval; capped critical exposure and scoring; and selected-fixture reset preserving access/history. These changes were absent from the updated checkout despite the earlier session report. Preserved the current team's map redesign and `/demo` additions.
- Added a shared synthetic exercise clock per disaster, separately persisted pre/post-impact reply rounds and approved notice text. Enrolled employees can approve a simulated notice, record simulated replies and advance the bounded exercise to impact and its 30-minute deadline. Earlier replies remain in history and cannot confirm post-impact safety. Full dataset reset and direct scenario escalation remain administrator-only.
- Added overdue fresh post-impact concerns independently of older contact freshness, with reviewable welfare requests for unanswered/needs-help cases. Existing active welfare requests are reused. Safety replies do not silently resolve assistance; recommendations never reserve teams and dispatch still requires explicit employee approval with transactional revalidation. Clock/run checks reject stale/duplicate operations.
- Connected the redesigned main scenario desk through the existing SDK connection: area-scoped priority ranking/search/25-row pages/overlooked filtering, selected-case score and exposure explanations, sourced preparedness approval and task completion, contact, requests, team eligibility/distance/approximate ETA, assignment lifecycle and shared activity. Dynamic selected-area/household/request subscriptions are cleaned up when selection changes. Both customers and community assistance cases participate under the same decision rules.
- Kept `/demo` browser-local. The main `/` route now requires database configuration rather than silently substituting demo records. Added a public `.env.example` and ignored local configuration pointing to a newly created persistent loopback database, `riskreach-person3-demo`, containing the 10,000-household Demo preset on port 3100. Started the main Next.js development page on localhost:3000. Browser identity enrollment remains required; no self-enrollment or token-sharing flow was added.
- Restored modern bundled schema-v3 Small (ten impacts and 12 reviewed templates), generator-v4 Small team regions and reproducibility coverage, while retaining legacy-v1 and generator-v3 compatibility. Windows staging uses dependency junctions. Regenerated TypeScript bindings for all restored and new views/reducers.
- Installed the two already-declared MarkerCluster packages missing from this checkout. Scoped the CommonJS test lint rule to the existing Node `.cjs` demo tests. Updated the README tracker and backend/map/data handoffs; added `backend/SHARED_WORKFLOW.md` with startup, enrollment, persistent storage, permissions, replay and verification commands.

### Verification

- All 101 backend tests across nine files passed on supported Node 24.22.1 with Python 3.12, including 17 restored preparedness cases and four new shared workflow/authorization/lifecycle cases. The four shared cases passed again after final employee time-skip authorization changes. All nine Python tests (including exact bundled Small reproducibility) and all six existing browser-local demo-state tests passed.
- Backend/frontend TypeScript checking, module generation/build, staged Demo build, frontend lint and production build passed. Lint retains one existing generated-bindings warning. Initially, missing MarkerCluster packages blocked frontend checking and the existing CommonJS test imports failed lint; installing the declared packages and applying the narrow test-file rule resolved both. The older CSS worker-port build failure did not recur.
- Published/seeded a new persistent local Demo database without deleting existing data. Tested the complete workflow in a separate disposable Small database with two enrolled SDK clients plus an outsider: suggestion approval/duplicate rejection, separate rounds, employee time skips, fresh overdue welfare review, non-customer assistance, competing dispatch with one winner, completion/team release, the real scheduled refresh, shared reset/replay, stale-run rejection and live revocation all passed. Test memberships are revoked in cleanup; the main Demo dataset was not mutated by the verifier.
- Interactive browser acceptance and enrollment of the user's actual browser remain separate from these automated checks. Actual AI generation and notification delivery remain pending. Full-table subscriptions remain; fixture correctness and SDK checks are not production throughput or browser-responsiveness guarantees.
- No commit, push or cloud deployment was made. The older local verification databases on port 3123 were left unchanged.

## Version 1.17 — 2026-11-07

**Author:** Aalvee Ahtav

### Changes

- Applied the selected State Farm themed readiness-overview concept: white surfaces, red pill controls, charcoal headings, centered hero, red outline icons, and responsive two-column map/review layout.
- Replaced the permanent hazard sidebar with accessible filter chips and an expandable hotspot list. Kept map selection, reset, geographic-context/footprint legend, phase guidance, household/team details, simulation/source labels, and shared workflow composition.
- Added visible-record summary counts, household review by check-in status, household/team/guidance navigation, and working quick actions. No priority score, activity events, outreach, or dispatch operations are fabricated; existing backend integration remains read-only.
- Reconciled the redesign with the pulled v1.14 large-scenario changes, retaining footprint layers, regional membership, dataset/filter/drawn count distinctions, keyed detail pagination, and bounded household/team browsing. Preserved all upstream changelog entries and renumbered the local redesign entry to 1.17 to follow the pulled 1.x release convention. Reconciled the v1.16 clustering styles, map hint, selection-refresh behavior, and team-recommendation progress with the redesign.
- Desaturated basemap tiles independently of hazard overlays. Added responsive layouts and reduced-motion-aware navigation. Preserved the existing README edits while documenting this UI checkpoint.

### Verification

- Rechecked the v1.16 conflict resolution with frontend type checking, full lint (zero errors; existing generated-bindings warning), conflict-marker scan, and Git whitespace checks. Interactive browser and production build checks were not rerun for this reconciliation.
- Frontend type checking passed. ESLint passed with no errors and the existing unused-disable warning in generated bindings.
- Static React rendering checks passed for the fixture summary, six hazard controls, household review, empty data, loading, connection error, and connected states.
- Production build failed at the previously documented Turbopack CSS worker-port permission restriction, including an elevated retry.
- After conflict reconciliation, frontend type checking and lint passed. Static rendering verified merged dataset/regional counts, hotspot grouping, household/team pagination (including last-page clamping), regional record selection, footprint details, and empty/loading/error states. Backend regression tests could not run in this checkout because Vitest is not installed.
- Interactive browser, responsive visual, and connected-backend checks remain pending for the redesigned interface.

## Version 1.16 — 2026-11-07

**Author:** Josh Sebastian

### Changes

- Merged main's team-recommendation implementation into PR #10 and resolved the README checkpoint conflict while preserving both map and recommendation progress.
- Restored selected household visibility after rebuilding the cluster index on live data updates or responsive minimum-zoom changes. Reused the same reveal behavior for explicit selection; refreshes preserve the current map center and zoom instead of navigating back to the selected record.

### Verification

- Frontend TypeScript checking and targeted map-component lint passed.
- Extended the temporary actual Leaflet/MarkerCluster DOM harness to assert selected overlapping-household visibility across repeated data refreshes and resize, unchanged center/zoom on refresh, and preservation of a user's pan away from the selected record. Existing navigation, overlay, membership-count, cluster expansion, and spiderfying checks passed.
- Full visual/browser acceptance remains pending. The production build on Node 24.22.2 still fails because Turbopack cannot bind its CSS worker port (operation not permitted), including the elevated retry.

## Version 1.15 — 2026-11-07

**Author:** Karthik Bhagavatula

### Changes

- Completed Person 3 task 7 with `backend/src/team-recommendations.ts`, a deterministic SDK-independent snapshot helper matching the existing dispatch contract: open/unassigned requests; available teams; no active assignment; exact capability; and sufficient people capacity under one active assignment per team.
- Added bounded top-K ranking by raw Haversine distance with deterministic ID ties, configurable constant-speed approximate ETA (default 30 km/h), employee-approval labels, request blockers, unique eligibility/exclusion totals, and optional per-team exclusion reasons. No routing, reservation, or automatic dispatch is performed.
- Added a fixture adapter and selected-request report CLI. Shared the existing source need-name mapping with the backend converter without changing conversion behavior. Kept source IDs and documented the existing one-person party-size / numeric source-capacity / supply-to-water demo assumptions. Dispatch-only adaptation does not require display-region metadata, addressing generated Small v3's missing team-region field without weakening the full converter.
- Documented eligibility, snapshot freshness, concurrency/revalidation, capacity units, ETA limitations, and live integration in `backend/TEAM_RECOMMENDATIONS.md`; updated progress and handoffs. Preserved the merged large-dataset display work and the current 1.x changelog sequence.

### Verification

- All 80 backend tests passed, including 18 new recommendation cases and the existing 62 regressions. All nine Python generator/geometry tests, backend TypeScript checking, and Spacetime module build passed on Node 24.22.1 with Python 3.12 selected explicitly for fixture tests.
- Verified capabilities/capacity, all unavailable statuses, active-assignment conflicts despite spare capacity, request blockers, completed/cancelled release, exclusion reason counts, stable top-K ties, zero/dateline/antipodal distances, speed/limit validation, immutable snapshots, customer neutrality, bigint IDs, invalid references/data, and every request in Small/Demo/Stress.
- Datastore-harness checks assigned recommended teams through the actual reducer, confirmed identical default distance/ETA values, rejected reuse while active, and verified release on cancellation/completion. No live database was mutated by these tests.
- Ran the selected Stress request CLI: 138 of 1,970 teams eligible, 1,832 excluded, top five retained. Closest synthetic distance was approximately 0.542 km with a 1.084-minute assumed-speed ETA. Reason counts can overlap and are not summed into unique totals; these are synthetic results, not operational travel or throughput claims.
- An initial full-suite attempt used an older `python3` executable and failed three existing large-fixture tests; rerunning with installed Python 3.12 satisfied the documented prerequisite. No generator or existing display-converter validation changes were needed.
- The merged checkout does not contain the previous task-6 preparedness helper files; this independent task does not restore them or mark that checklist item complete. Live authorized recommendation views, selection UI, and browser verification remain pending. No commit, push, publish, or operational dispatch was made.

## Version 1.14 — 2026-11-07

**Author:** Josh Sebastian

### Changes

- Merged main's priority scoring and follow-up detection helpers, tests, scripts and handoffs into the large-dataset feature branch. Preserved the isolated fixture build/subscription/map implementation and both sets of backend commands.
- Reconciled README and scenario handoffs to distinguish implemented footprint persistence/display from pending exposure/score/flag persistence and queue integration.
- Kept release numbering in the requested 1.x series. Main's priority/follow-up entries, originally labeled 2.0/2.1, are retained below as 1.12/1.13 with their original authors and content; feature entries 1.10/1.11 and earlier history remain intact.

- Updated Leaflet navigation to fit selected region/context bounds with padding for map overlays and the actual canvas size. Recalculates the national minimum zoom and US pan limits on resize, including Alaska and Hawaii; sidebars outside the canvas are not subtracted twice.
- Replaced fixed national summaries and unclustered household circles with Leaflet MarkerCluster groups over all filtered household locations. Numbered circles count their underlying locations, split on zoom, fit member bounds on click, and reveal overlapping locations by spiderfying. Filtering rebuilds the cluster index; individual points and clusters use the hazard-filter palette, with proportional color segments for mixed-hazard clusters.
- Corrected point navigation to center the selected location without a delayed northward bounds pan or a second cluster navigation overriding the selection. Preserved selection styling, tooltips, response-team interactions, and existing map layout; updated map guidance and integration notes.

### Verification

- All 62 backend tests passed on Node 24.22.2, covering both upstream priority/follow-up logic and the feature branch's large-fixture regressions. Backend/frontend typechecks and the SpacetimeDB module build passed.
- Frontend lint passed with the existing generated-bindings warning. No runtime code conflict required resolution; helper implementations remain unchanged from main. Full interactive browser acceptance and the production-build limitation remain outstanding.

- Frontend TypeScript checking and targeted map-component lint passed. A temporary DOM harness exercised actual Leaflet/MarkerCluster behavior at mobile and desktop canvas sizes, all fixture regions plus Alaska/Hawaii, overlay padding, responsive minimum zoom, US pan bounds, exact membership counts, cluster expansion, coincident-point spiderfying, and point selection. The point-navigation regression also checked that the selected location stayed centered after a delay.
- The production build was retried but remains blocked by a Turbopack CSS-worker local-port permission error, including after an elevated retry. The user is performing browser verification; final visual/mobile/sidebar acceptance and large-dataset interactive performance are not claimed by the DOM checks.

## Version 1.13 — 2026-11-07

**Author:** Karthik Bhagavatula

### Changes

- Completed Person 3 task 5 with `backend/src/follow-up.ts`, a deterministic helper distinguishing contact freshness, remaining follow-up concerns, and overlooked cases. Cases are overlooked only when a qualifying concern and overdue/missing contact coexist.
- Added independent reasons for unresolved requests, needs-help/urgent check-ins, unconfirmed high-risk exposure, and optional vulnerable exposure. Preserves request/layer IDs, priority explanations, and unique household totals; overlapping reason counts remain separate.
- Added configurable labeled demo thresholds: six hours normally, one hour for urgent check-ins or active request urgency 4/5; never-contacted cases are immediately contact-overdue. Fresh contact clears the overlooked flag without resolving assistance. Request resolution and safe check-ins remove only their relevant concerns; assignment does not hide unresolved requests.
- Reused priority validation and ordering while keeping flag eligibility independent of priority weights and customer status. Extracted shared pure schema-v3 fixture input normalization without changing scoring behavior.
- Added an offline full/summary follow-up report command and `backend/FOLLOW_UP.md` covering exact threshold semantics, transitions, concern counts, assumptions, and integration responsibilities. Updated README progress and handoffs.

### Verification

- All 59 backend tests passed, including 17 new follow-up cases and all 42 existing regressions. All nine Python generator/geometry tests, backend TypeScript checking, and Spacetime module build passed on Node 24.22.1.
- Verified microsecond boundary behavior, urgent/standard thresholds, never-contacted cases, fresh-contact clearing, request resolution, independent concerns, safe check-ins, assignment/in-progress independence, configurable exposure/vulnerability policy, priority-weight independence, clock advancement, counts, customer neutrality, stable order, bigint IDs, and invalid inputs.
- Evaluated every household in Small (60), Demo (10,000), and Stress (100,000); for each preset verified an unresolved seeded case loses its overlooked flag after contact while retaining its assistance need.
- Ran the Stress summary report: 69,433 households retain follow-up concerns and 57,997 are flagged overlooked under demo defaults; saved the first 25 overlooked rows with complete counts/assumptions to an ignored local report. These are synthetic scenario results, not operational findings or backend performance benchmarks.
- No schema, seed/reset, reducer, binding, or frontend behavior changes were made. Flags remain derived snapshots; persisted/live authorized flags, timer-driven recomputation, subscriptions, and queue filtering are pending integration. No commit, push, publish, or database mutation was made.

## Version 1.12 — 2026-11-07

**Author:** Karthik Bhagavatula

### Changes

- Completed Person 3 task 4 with a deterministic SDK-independent priority helper in `backend/src/priority.ts`. Scores use configurable demo weights for strongest unresolved request urgency, capped distinct need types, check-in status, maximum impact severity, capped vulnerability contributions, and explicit-clock contact age.
- Added six readable reason contributions per household, retained full overlapping exposure evidence, and returned a copy of the configuration used. Customer status has no effect; safe check-ins do not remove unresolved needs. Resolved requests stop contributing urgency/needs, while assigned/in-progress requests remain active.
- Added deterministic tie-breaking by score, active urgency, oldest/missing contact, and ID; supports string or bigint IDs. Validates clock/contact values, required exposure coverage, duplicate IDs, request references/statuses/urgency, and scoring configuration.
- Added a pure schema-v3 fixture adapter and an offline priority report command. Full reports include all households; `--summary-only` scores all records but writes the top 25 with configuration and total count. Documented exact weights, caps, time thresholds, ID/time conventions, queue-filter responsibilities, and integration limits in `backend/PRIORITY.md`.
- Updated README progress and data/backend handoffs. Existing schema, production seed/reset, reducers, generated bindings, and frontend behavior are unchanged; persisted scores and live queue integration remain pending.

### Verification

- All 42 backend tests passed, including 14 new priority cases and the existing 28 workflow, conversion, map, and exposure regressions. All nine Python generator/geometry tests passed. Backend TypeScript checking and Spacetime module build passed on Node 24.22.1.
- Verified score/reason arithmetic, customer neutrality, safe-but-unresolved cases, urgency/severity escalation, resolution and assignment independence, need/flag deduplication and caps, contact-tier boundaries, exact microsecond parsing, custom weights, deterministic secondary ties, bigint IDs, and invalid inputs. Scored every household in Small (60), Demo (10,000), and Stress (100,000).
- Ran the offline Stress summary report: all 100,000 households ranked; the top 25 were written to an ignored report. The highest observed score was 150 under default demo weights; this is an exercise result, not an operational urgency threshold or performance guarantee.
- Before implementation, fast-forwarded the clean local main checkout to the user's already-merged remote main so the exposure helper was available. No new commit, push, database publish, or database mutation was made.
- Scoring is a derived helper/report, not persisted or subscribed functionality. Overdue/overlooked flags, household-specific suggestions, team recommendations, and live priority queue verification remain pending.

## Version 1.11 — 2026-11-07

**Author:** Josh Sebastian

### Changes

- Switched the ignored local frontend configuration from the development database to Demo and then Stress for manual inspection. The running Next.js server reloaded each environment change without replacing existing development data.
- Enrolled the supplied browser identities in their respective local test databases. Local environment values, identity tokens, generated fixtures and database contents are not part of this commit.

### Verification

- Repeated the real SDK subscription/adapter check for Demo: 10,000 households (8,000 neighborhood / 2,000 regional) and 93 footprints; approximately 171 ms subscription application and 17 ms adaptation.
- Repeated the same check for Stress: 100,000 households (80,000 neighborhood / 20,000 regional) and 93 footprints; approximately 1,364 ms subscription application and 152 ms adaptation. Authorized counts, hazard filtering, regional inspection data and outsider isolation passed.
- Confirmed the localhost frontend returned HTTP success after switching to Demo and observed Next.js environment reload/reconnection logs for both datasets. These checks do not establish interactive browser rendering or responsiveness; manual acceptance and the production-build limitation recorded in v1.10 remain outstanding.

## Version 1.10 — 2026-11-07

**Author:** Josh Sebastian

### Changes

- Added isolated `build:scenario` commands for Small/Demo/Stress. Builds validate and stage the selected fixture, invoke the installed SpacetimeDB CLI, and write a bundle plus generation/count/checksum manifest without replacing the tracked Small fixture. Normal builds retain Small.
- Extended conversion to schema v3 and added private impact-layer persistence with employee-authorized subscriptions, seed/reset handling and regenerated frontend bindings. Reused the existing exposure helper to validate layer geometry/provenance with empty household input; no exposure relations or live-update simulation were added.
- Retained regional households and actual zone IDs in the frontend adapter, adding separate hotspot/membership grouping. Regional assignment destinations now remain inspectable; missing active destinations still never fall back to proximity. Replaced repeated request/task/assignment scans with indexes and per-team centroid sorting with a nearest-centroid pass.
- Added national hotspot summaries with Alaska/Hawaii framing, viewport-limited Canvas household markers at zoom 9+, selection styling independent of geometry rebuilding, and 50-row household pages with membership filtering. Dataset totals, neighborhood/regional counts, hazard-filter matches and drawn marker counts are distinct.
- Rendered geographic context as dashed unfilled outlines and actual synthetic hazard footprints separately, retaining overlapping components and source/time/severity-basis/limitation details. Geographic membership is not labeled as hazard exposure.
- Added a manifest-driven local SDK subscription verification command and `backend/SCENARIOS.md` with generation, loading, startup, browser enrollment, size switching, repeat runs, expected counts and browser acceptance checks. Updated backend, scenario, exposure, map and root documentation.

### Verification

- All 31 backend tests passed on Node 24.22.2, including v3 Demo/Stress conversion/map/filter/viewport tests, Demo insertion/authorization/reset checks, damaged-input rejection and existing workflow/exposure regressions. Backend and frontend typechecks passed. Frontend lint passed with one existing generated-bindings warning. All nine Python generator/geometry tests passed.
- CLI/SDK 2.14.1 built, published and atomically seeded separate local `riskreach-demo-10k` and `riskreach-stress-100k` databases. No batched importer was needed. The existing `riskreach-local` database retained 60 households.
- Real authorized SDK subscriptions and map adaptation verified Demo's 10,000 households (8,000 neighborhood / 2,000 regional), 220 teams, 2,000 requests, 2,597 tasks and 93 footprints, and Stress's 100,000 households (80,000 / 20,000), 1,970 teams, 20,000 requests, 24,931 tasks and 93 footprints. Both have 56 disasters/hotspots, 112 zones and no assignments. Outsider isolation, hazard filters, regional inspection data and safe households with unresolved needs passed.
- Single local subscription/adaptation runs measured approximately 142/17 ms for Demo and 1,341/155 ms for Stress. These exclude browser rendering and are not responsiveness guarantees.
- Interactive browser acceptance remains pending because the computer-use browser host was unavailable. A second development process was refused by Next.js's existing per-checkout server lock; the user's existing server was left running. Production builds failed at the existing Turbopack CSS worker-port `Operation not permitted` error, including an elevated retry. No production-build or interactive-browser success is claimed.

## Version 1.9 — 2026-11-07

**Author:** Karthik Bhagavatula

### Changes

- Completed Person 3 task 3 with `backend/src/exposure.ts`, a deterministic SDK-independent TypeScript helper accepting source string IDs or backend bigint IDs. Calculates household exposure from explicit impact geometry, independent of geographic membership, customer status, or check-in status.
- Retains every matching layer/component and hazard with severity and source/timestamp/simulation evidence. Returns per-household maximum qualitative severity and unique overall/per-disaster/per-hazard counts; individual layer counts remain separate.
- Added boundary-inclusive polygon checks, geometry/input validation, a one-degree spatial candidate grid, bounding-box rejection, and a bounded broad-layer fallback. Supports concavity and either ring orientation; rejects holes, MultiPolygons, and dateline-spanning geometries.
- Added an offline schema-v3 exposure report command and documented source/backend ID mapping, result semantics, recomputation, supported geometry, and persistence handoff in `backend/EXPOSURE.md`. Reports and local verification tooling remain ignored.
- Corrected the existing v2 scenario conversion test to explicitly generate v2 base data now that the public generator emits v3. Existing production seed/schema/reducers and generated bindings are unchanged; no v3 persistence support is implied.
- Updated Person 3's checklist and current checkpoint. Consolidated duplicate current-version/checkpoint headers and grouped the two historical v1.5 author records without dropping their content.

### Verification

- Backend TypeScript checking, Spacetime module build, and all 28 backend tests passed on SDK-supported Node 24.22.1, including 10 new exposure tests and the 18 existing workflow/conversion/map regressions. All nine Python generator/geometry tests passed.
- Compared every Small, Demo, and Stress household against an independent winding-number oracle over all source layers. Verified edge/vertex inclusion, concave exclusions, reversed rings, negative coordinates, cross-hazard overlap, unique counts, input-order invariance, bigint IDs, invalid inputs, grid edges, and broad-layer fallback.
- Ran the offline Stress report: 82,184 of 100,000 unique households exposed; 187,353 spatial candidates versus 9,300,000 possible household-layer pairs. A local helper-only run took approximately 134 ms, excluding fixture generation/parsing, report writing, database work, and rendering. These are synthetic local measurements, not backend performance guarantees.
- Installed locked local dependencies for verification using Windows trust certificates and a checksum-verified portable Node runtime in ignored scratch storage; no system runtime/configuration changes were made.
- Exposure results are derived snapshots, not persisted or subscribed records. Current seed/reset still load legacy v1, and the existing converter accepts v1/v2 only. Persisted impact/exposure integration, map rendering, live update verification, prioritization, and subsequent Person 3 logic remain pending.

## Version 1.8 — 2026-11-07

**Author:** Josh Sebastian

### Changes

- Fixed PR #3's map adapter to resolve active assignment destinations against all backend households. Teams assigned to regional households are omitted from neighborhood markers, lists, and counts; missing active destination rows also cause omission. Active neighborhood assignments keep destination grouping. Only teams without active assignments use proximity grouping, which resumes after cancellation/completion; unavailable status remains intact.
- Added two production-seed/reducer regressions for a welfare check on `tornado-household-09` dispatched to `earthquake-team-1`, covering assigned/in-progress states, missing destination rows, cancellation/completion, unavailable teams, and access revocation.
- Corrected current merge status: fetched latest origin/main (`b7b533e`), already retained via existing merge commit `1f36906`. Both contributors’ backend/frontend work and dataset history remain intact; source fixtures/generator and generated bindings were not edited.
- Preserved limitations: only 48/60 households render; generic supplies map to water; absent party sizes default to one; source household-case capacity differs from backend people-per-assignment capacity; larger presets have conversion-only coverage.

### Verification

- The two new cases failed against the old adapter and passed after the fix. All 18 backend tests passed on SDK-supported Node 24.22.1, including existing neighborhood assignment/cancellation coverage and generated Demo/Stress conversion. Backend typecheck and SpacetimeDB module build passed.
- Frontend typecheck passed; lint passed with zero errors and one existing generated-bindings unused-disable warning. Production build was attempted normally and with escalation on Node 24.22.1; both failed because Turbopack's CSS worker could not bind a port (`Operation not permitted`). This is the known environment failure; production compilation remains unverified, and the attempt does not establish absence of later application build errors.
- All six Python tests and checked-in fixture validation passed (six disasters, 12 zones, 60 households, 12 teams, 12 requests). Larger preset testing remains generation/validation/conversion only, without database/subscription/browser performance claims.
- Review-fix diff whitespace/conflict-marker checks passed; no secrets, unrelated changes, generated bundles, or binding edits were added. The full branch comparison against origin/main reports four pre-existing extra EOF blank lines in generated bindings (`index.ts`, `types.ts`, `types/procedures.ts`, `types/reducers.ts`); these were left untouched to avoid hand-editing generated output. No commit, push, merge, deployment, or shared-database mutation was performed during this review fix. Live SDK smoke and integrated browser acceptance were not rerun; earlier local smoke results remain historical evidence.
- The requested PR review fixes satisfy the merge recommendation at code-review scope. Frontend production build, integrated browser acceptance, and larger-preset database/performance checks remain explicit verification gaps.

## Version 1.7 — 2026-11-07

**Author:** Josh Sebastian

### Changes

- Integrated origin/main `b7b533ea8f32fd7beda87dfd0307b6de44011f71` (dataset PR #2) into `josh/person-2-spacetime-backend`, recorded in merge commit `1f36906`. Preserved the pre-existing staged backend/frontend integration using a retained stash and external patch backups. Resolved README/changelog and homepage/map handoff conflicts with both contributors' work retained. Kept main's dataset history as v1.3/v1.4, renumbered the branch backend/map checkpoints to v1.5/v1.6, and kept all entries.
- Connected Person 3's checked-in Small dataset to actual administrator seed/reset: six disasters, 12 metro/neighborhood zones, 60 households, 12 teams, 12 requests, and 18 pending outreach tasks for never-contacted households. The previous sparse fixture is retained only for existing workflow regression tests.
- Added a validated adapter for source string IDs and foreign keys, snake_case fields, null options, exact UTC microsecond timestamps shifted together to the reducer clock, named risk/urgency, region → metro, serialized GeoJSON longitude/latitude polygons, and capability/need aliases. Kept schema, reducer arguments, frontend adapter, and generated bindings unchanged.
- Preserved raw source metadata, simulation labels, source IDs, vulnerabilities, generator presets, and geometry in the portable dataset. Explicit demo assumptions: generic supply delivery becomes water; missing party size becomes one person; source household-case team capacities retain their numeric limits under the existing single-active-assignment backend policy. These assumptions require review before operational use.
- Added dataset regression coverage and adapted the local live smoke test to imported records. Updated README, backend progress/handoff, and source documentation with actual integration status and limitations.

### Verification

- Backend: all 16 tests passed (12 workflow/map tests and four dataset cases, including malformed data rejection, actual seed/dispatch/reset/history, timestamp/ID conversion, map compatibility, and generated 10,000/100,000-household preset conversion). Type checking and SpacetimeDB 2.14.1 module build passed.
- Python: checked-in fixture validation and all six generator/validator unittest cases passed, including Demo and Stress integrity. Large-preset conversion is not a database or browser throughput measurement.
- Frontend: type checking passed; lint passed with zero errors and the existing one generated-bindings unused-disable warning. Production build failed normally and with escalation because Turbopack's CSS worker could not bind a local port (`Operation not permitted`). Production build remains unverified.
- Published and seeded only an isolated in-memory local database on port 3112. Live smoke passed: two authorized clients synchronized map/check-in/outreach, exactly one competing dispatch succeeded, completion cleared displayed need/released the team, outsider rejection and access revocation worked. The temporary server was stopped afterward; no shared deployment was made.
- Verification used Node 24.20.0, below SDK 2.14.1's supported patch range; supported-Node verification remains pending. Browser acceptance, larger-preset database/batched loading, performance, final geometry/decision rules and operational UI remain pending. The neighborhood-only map displays 48 of 60 imported households; regional households remain stored and authorized views expose all 60.
- Final diff review and whitespace/conflict-marker checks passed. No generated bundles, tokens, environment files, or unrelated files were added. The integration was subsequently recorded in merge commit `1f36906`.

## Version 1.6 — 2026-11-07

**Author:** Josh Sebastian

### Changes

- Integrated main through `5d61e4e` into the backend branch without a merge commit. Preserved the Leaflet dashboard, map navigation fixes, backend module, generated bindings, and both contributors’ documentation. Retained main’s v1.2 map record and renumbered the independent backend checkpoint to v1.3 to avoid duplicate versions.
- Connected the homepage to an optional read-only employee-authorized SpacetimeDB map using both `NEXT_PUBLIC_SPACETIMEDB_URI` and `NEXT_PUBLIC_SPACETIMEDB_DATABASE`; unconfigured use retains the labeled UI demo and partial configuration reports an error.
- Added a typed backend/map adapter for bigint IDs, GeoJSON longitude/latitude conversion, SDK timestamps, risk bands (1–2 moderate, 3–4 high, 5 critical), unresolved requests, and unfinished preparedness tasks. Only neighborhood zones render as hotspots so national context rectangles do not obscure exposure.
- Grouped teams by their active assignment’s household zone or nearest neighborhood for display; this is not a dispatch recommendation. Kept customer status separate from need and check-in separate from request resolution.
- Added endpoint-scoped identity token persistence, subscription readiness/error handling, automatic reconnect, batched transaction refreshes, enrollment guidance, and cleanup. Operational UI mutations and final scoring/recommendation logic remain pending.
- Reconciled setup, ownership, progress, and integration handoff documentation.

### Verification

- Frontend ESLint passed with no errors and one pre-existing unused-disable warning in generated bindings. Frontend and backend TypeScript checks passed. SpacetimeDB module build passed.
- All 12 datastore tests passed: the eight existing workflow tests plus four backend-to-map regressions covering six-hazard joins, coordinates/timestamps/bigint IDs, escalation/contact/resolution separation, remote assignment grouping/cancellation, unsupported geometry, and revoked access.
- Published and seeded a disposable in-memory local database on port 3111. The expanded live smoke check passed with two authorized clients and an outsider: map adaptation, synchronized check-in/outreach, exactly one competing dispatch succeeding, assignment-aware team grouping, completion clearing displayed needs, and revocation clearing map records. No cloud deployment was made.
- `npm --prefix frontend ci` accepted the merged manifest/lockfile. Frontend production build was attempted normally and with escalation; both failed at the existing Turbopack CSS worker port restriction (`Operation not permitted`). Integrated browser rendering, reconnect/unmount behavior in a browser, and full workflow acceptance checks remain unverified.
- Checks ran on Node 24.20.0, below SDK 2.14.1’s declared minimum patch; supported-Node verification remains pending. The historical development dependency findings were not re-audited in this update.
- `git diff --check` passed. README/changelog conflicts were resolved at this checkpoint; the integration was subsequently recorded in merge commit `1f36906`.

## Version 1.5 — 2026-11-07

**Author:** Karthik Bhagavatula

### Changes

- Completed Person 3 task 2 with synthetic hazard-specific impact layers: tornado damage corridors; nested earthquake shaking footprints; separate hurricane wind/surge areas; wildfire fire/smoke areas; blizzard snow/wind and isolation areas; and irregular flood inundation corridors.
- Introduced fixture schema/generator v3 for all generated presets. Small contains 10 impact layers; Demo and Stress each contain 93. Geographic context rectangles are now explicitly distinguished from impact footprints, preserving existing household coordinates, record IDs, memberships, teams, and requests.
- Added 12 reusable employee-review preparedness recommendation templates linked to layers, informed by current NWS, OSHA, and AirNow public guidance. Recorded source URLs and review date; agencies are not presented as sources of the synthetic geometry.
- Added per-layer qualitative severity/basis, simulation kind/label, authored source, timestamp, contextual links, and modeling limitations. The geometry is not fitted to terrain, coastlines, real wind, hydrology, or seismic conditions.
- Added simple-polygon QA and expanded metadata/reference validation and regression tests. Updated the dataset handoff, schema compatibility notes, and Person 3 checklist. Kept the original tracked v1 fixture unchanged and retained v1/v2 validation support.

### Verification

- Generated and validated Small (60 households), Demo (10,000), and Stress (100,000) via CLI, including all impact layers and 12 linked recommendation templates per preset.
- Nine regression tests passed, including legacy v1/v2 compatibility, unchanged base records, seeded repeatability, full Stress validation, component coverage, nested shaking zones, and invalid polygon rejection. Fifteen damaged-fixture mutation cases were rejected, including false live-source labels, missing components, cross-hazard recommendation links, missing human review, and open polygons.
- Geometry QA checks coordinate ranges, closure, unique vertices, nonzero area, self-intersections, regional bounds, and inner/outer earthquake containment. Tested a valid concave polygon and boundary-inclusive point checks for fixture QA.
- This is offline data/geometry verification. Household exposure calculation, map rendering of new impact layers, Spacetime persistence, household-specific action suggestions, prioritization, team matching, escalation, and reset remain pending. No live hazard integration or real-world prediction is claimed.

## Version 1.5 — 2026-11-07

**Author:** Josh Sebastian

### Changes

- Aligned the README and Person 2 implementation plan with main commit `39893be`: nationwide tornado, earthquake, hurricane, wildfire, blizzard, and flood support, with national/metro/neighborhood zone hierarchies. Preserved Josh's Person 2 assignment.
- Added a TypeScript SpacetimeDB 2.14.1 module under `backend/`, pinned dependencies/lockfile, local project configuration, and build/typecheck/test/binding-generation commands.
- Implemented the eight operational entities with lookup indexes, plus a private employee allowlist. The publishing identity is the initial administrator; only an administrator can grant/revoke employee access or seed/reset/escalate scenarios. Private tables are exposed through employee-authorized views.
- Implemented validated check-in, outreach, preparedness tasks, help requests, assignment creation/progress/completion/cancellation, and transactional durable activity events. Conflicting dispatch, unavailable teams, capability/capacity violations, invalid statuses, and unauthorized calls are rejected. Safety status stays separate from assistance resolution.
- Added synthetic integration fixtures for all six hazards: 18 zones, 12 households/requests/tasks, and six teams. Added targeted disaster escalation and controlled reset that preserves memberships and activity history. Geometry and hazard-specific tasks are demonstration placeholders for Person 3's final data/rules.
- Added straight-line assignment distance (km) and approximate ETA (minutes, assumed 30 km/h); these are not road routing or automatic team recommendations.
- Generated frontend bindings and installed the matching frontend SDK. Added datastore tests and a repeatable local-only live-client smoke script. Browser connection/UI integration remains Person 4's work.
- Documented setup, identity enrollment, reducer contracts, multi-hazard handoffs, and remaining work in `backend/README.md` and `backend/PLAN.md`; updated the root tracker and ignored backend bundles/local test output.

### Verification

- Backend TypeScript checking passed; SpacetimeDB module build and binding generation passed using CLI/SDK 2.14.1.
- Eight datastore-harness tests passed, covering authorization/revocation, check-in/contact separation, task/request validation, dispatch conflicts, capability/capacity rejection, completion/cancellation, all six seeded hazard types, targeted escalation isolation, and repeatable reset.
- Published to an isolated local verification database on port 3100. Live SDK verification passed for synchronized check-in/outreach, competing dispatch (exactly one succeeds), assignment completion/team release, outsider rejection, and membership revocation removing subscribed data. The same live check passed again after republishing/resetting the six-hazard fixture.
- Frontend type checking passed after final multi-hazard binding regeneration. ESLint had no errors and one unused-disable warning in generated bindings. Production frontend build/browser rendering remain unverified.
- Backend dependency installation audit reported zero vulnerabilities after selecting patched test tools. The frontend retains the previously documented eight moderate development-chain findings.
- Verification used Node 24.20.0; npm warns that SDK 2.14.1 requires `^22.23.4 || ^24.22.1 || >=26.12.1`. Setup documentation records the supported versions; verification on a supported Node patch is still pending.
- `git diff --check` passed.
- Final Person 3 geometry/exposure, prioritization/reasons, overlooked-case detection, and team recommendations remain pending. Map/queue/action UI and the root README's complete browser acceptance checks remain pending. No commits, pushes, or cloud deployments were made.

## Version 1.4 — 2026-11-07

**Author:** Karthik Bhagavatula

### Changes

- Expanded Person 3's generator with Small (60 households), Demo (10,000), and Stress (100,000) presets. Preserved the original small fixture and default behavior.
- Added 50 authored state context hotspots, including Alaska and Hawaii, alongside six dense narrative hotspots. Demo/Stress each contain 56 disaster exercises and 112 zones; Demo has 220 teams and 2,000 requests, while Stress has 1,970 teams and 20,000 requests.
- Added seeded coordinates, varied contact histories, customer/vulnerability mixes, team capacities/capabilities, stable IDs, hotspot count summaries, and explicit generator metadata in fixture schema v2. All data remains labeled synthetic; coordinates are approximate authored locations, not verified population or land-boundary samples.
- Added preset/seed/output CLI options and generalized validation for state coverage, per-hotspot counts, references, geometry, baseline cases, and team capability coverage. Added regression tests and ignored large generated outputs.
- Documented commands, schema compatibility, fixture handoff, and planned map aggregation, scoped subscriptions, and batched seeding. Those application integration features remain pending.

### Verification

- All six `unittest` cases passed, including original-fixture equality, national Demo coverage, full Stress validation, repeatability, changed-seed behavior, invalid presets, and ten damaged-data rejection cases.
- Generated Demo and Stress JSON through the CLI, validated both presets, and confirmed saved files match regenerated data. Verified large outputs are ignored by Git.
- On this local Python 3.12 run, Demo generation/validation took approximately 0.091/0.041 seconds; Stress took 0.963/0.389 seconds. Saved files were approximately 4.8 MB and 46.4 MB. These are local fixture-tool measurements, not backend, subscription, or browser benchmarks.
- Application dataset integration, Spacetime seeding, runtime performance, hazard-specific geometry, and remaining Person 3 decision logic are still pending.

## Version 1.3 — 2026-11-07

**Author:** Karthik Bhagavatula

### Changes

- Completed Person 3's first task with `data/scenarios/nationwide-v1.json`: six fictional disaster exercises, 12 regional/neighborhood zones, 60 households, 12 response teams, and 12 open help requests. Added national map framing and selected the tornado neighborhood as the initial demo hotspot.
- Included customer and community households, urgent non-customer requests, never-contacted and older-contact cases, available/unavailable teams, and safe households with unresolved supply requests for later workflow verification.
- Added stable IDs, explicit simulation/source labels, fixed UTC baseline timestamps, GeoJSON placeholder boundaries, and a deterministic fixture generator without third-party dependencies.
- Added a fixture validator and documented field conventions, coordinate order, proposed capability values, clock handling, and the handoff to Persons 1 and 2 in `data/scenarios/README.md`. Marked only the first Person 3 checklist item complete in the project README.

### Verification

- `python data/scenarios/validate.py` passed: six disasters, 12 zones, 60 households, 12 teams, and 12 requests. Checked unique IDs, foreign keys, geographic containment, source labels, timestamps, baseline statuses, and per-hazard demonstration coverage.
- Confirmed generator output equals the checked-in JSON fixture.
- Confirmed validation rejects seven intentionally damaged copies: duplicate IDs, missing hazards, broken references, invalid coordinates, future contacts, missing urgent community cases, and unlabeled geometry.
- These are offline fixture checks. Spacetime seeding, replacement of temporary frontend fixtures, hazard-specific impact geometry, runtime exposure calculation, priority scoring, overdue detection, preparedness suggestions, team matching/ETA, escalation, and database reset remain pending. No new application or database integration is claimed.

## Version 1.2 — 2026-11-07

**Author:** Aalvee Ahtav

### Changes

- Replaced the placeholder with Person 1's local map/interface dashboard: hazard visibility controls, hotspot navigation, before/after guidance, and zone/household/team detail panels.
- Added browser-only Leaflet 1.9.4 with attributed OpenStreetMap raster tiles, selectable hazard polygons and record markers, severity outlines, reset navigation, resizing support, and a basemap-load warning.
- Added disposable fictional UI fixtures for all six supported hazards across the contiguous U.S.; these are separate from Person 3's future authoritative datasets and are clearly labeled simulations.
- Added responsive layouts, keyboard-accessible hotspot/record selection, loading/empty/connection-error presentations, and fixed scenario source timestamps displayed in America/Chicago.
- Defined frontend data view models and a prop-based integration boundary with a workflow composition slot for Person 4. Documented coordinate ordering, IDs, status assumptions, and remaining backend integration in `frontend/src/components/map/README.md`.
- Assigned Person 1 ownership in the README and updated setup/progress documentation. Current scope follows the README's nationwide six-hazard plan; v1.1's single-region flood description records the earlier plan.
- Added explanatory comments to map components, frontend view models, temporary fixtures, and global styles covering Leaflet lifecycle/cleanup, selection/filter behavior, coordinate conventions, teammate integration, and responsive layout choices.
- Fixed the initial and reset map overview to fit the contiguous U.S. with padding instead of using a fixed zoom that cropped California hotspots on narrow screens.
- Refit the overview when its canvas resizes, while preserving manual pan/zoom and selected-record navigation.
- Matched both entity kind and ID for polygon, household-marker, and detail-row selection highlights so IDs shared across tables cannot select unrelated records.
- Updated the README checkpoint and map integration notes for these PR review fixes.
- No persisted operational changes, live hazard feeds, decision scoring, or SpacetimeDB integration were added.

### Verification

- `npm --prefix frontend run lint` and `npm --prefix frontend run typecheck` passed after implementation. Lint passed again after adding comments; `git diff --check` also passed.
- The contributor reported successful lint, type checking, and production build for the original starter before these dashboard changes.
- The new dashboard production build was attempted in the agent environment and retried with escalation; both attempts failed because Turbopack's CSS worker could not bind a local port. Compilation completion is not claimed for this version.
- The user confirmed browser verification of the fixture-backed map/interface tasks. Updated the README checklist to mark map rendering, hazard filtering, selection, before/after details, source labels, and UI loading/error/empty/responsive states complete. Live backend connection checks remain pending integration.
- npm installation reported eight moderate dependency findings. Backend acceptance checks and two-session verification remain pending.
- Frontend lint and type checking passed.
- Focused checks using Leaflet's actual bounds calculations fitted every fixture hotspot boundary at canvas widths of 294, 364, 569, and 849 pixels.
- An effect harness checked repeated resets, overview resizing, and preservation of manual navigation and selected-record focus during resize.
- Rendered detail-panel checks and overlay checks confirmed that colliding zone, household, and team IDs highlight only the selected entity type.
- Production build verification remains pending: the documented Turbopack worker-port restriction occurred during PR review, and the build was not rerun for these fixes.

## Version 1.1 — 2026-11-07

**Author:** Aalvee Ahtav

### Changes

- Documented RiskReach's employee-facing disaster preparedness and response concept for the State Farm and Spacetime hackathon challenges, including proactive customer outreach and community assistance.
- Defined the single-region flood MVP, stretch goals, proposed data contract, status lifecycles, prioritization, dispatch behavior, four-person task split, relative 24-hour schedule, progress checklist, and judging demo.
- Confirmed Next.js + TypeScript for the frontend and a planned TypeScript SpacetimeDB module for the backend.
- Scaffolded Next.js 16.4.5 with App Router, TypeScript, Tailwind CSS 4, ESLint, the `@/*` alias, and placeholder directories for shared components and helpers.
- Added a RiskReach starter page, project metadata, and system fonts. Map features, disaster workflows, and SpacetimeDB integration remain pending.
- Organized all Next.js source, static assets, configuration, package manifest/lockfile, framework guidance, and local generated files under `frontend/`.
- Created `backend/README.md` to document the planned SpacetimeDB module. Backend code and generated client bindings have not been added.
- Added frontend development/build/start/lint/typecheck scripts, shared `.nvmrc`, and root ignore rules covering nested dependencies, generated output, and environment files.
- Updated the README with actual setup commands, repository layout, completed/pending tasks, verification status, and dependency findings.
- Consolidated the documentation, frontend scaffold, and folder separation into this v1.1 checkpoint. Kept changelog rules and the entry template above the history.

### Verification

- Reviewed the sponsor screenshots, project proposal, and relevant official documentation as planning inputs.
- Installed frontend dependencies. After moving the application, `npm --prefix frontend run lint` and `npm --prefix frontend run typecheck` passed.
- Verified that nested dependencies, Next.js output, generated environment types, and TypeScript build information remain ignored by Git.
- Production build compilation was attempted before the directory move, but Turbopack's CSS worker could not bind a local port in this environment. An elevated retry encountered the same restriction. Production build and browser rendering remain unverified.
- The initial online npm audit reported eight moderate findings in the development linting dependency chain through `minimatch`, with no production dependency findings. No forced dependency downgrade was applied.
- Checked documentation consistency and `git diff --check`. Backend connectivity, domain behavior, acceptance checks, and final sponsor eligibility verification remain pending.
