# Changelog

Current version: **1.9**

## Instructions for future updates

When a contributor asks to update this changelog:

- Keep these rules and the entry template above the changelog entries. Add each new version entry below the rules and above the previous entries, keeping the full history.
- Increase the version by one minor step for each new update: `1.1`, `1.2`, through `1.9`, then `2.0`, `2.1`, and so on. After any `.9`, increase the first number and reset the second number to `0`; do not use `1.10`.
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

## Version 1.9 — 2026-11-07

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
