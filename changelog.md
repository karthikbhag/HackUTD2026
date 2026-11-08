# Changelog

Current version: **1.19**

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

## Version 1.19 — 2026-11-08

**Author:** Aalvee Ahtav

### Changes

- Moved the fixture demo's operational rehearsal onto the dashboard. **Take action** now replaces the area-review popup with `NotificationDialog` rather than navigating to `/outreach`. Employees can review/edit and approve the initial notice, simulate replies, close the popup, and advance time with dashboard controls. The older standalone outreach route remains available with its previous independent fresh-check-in behavior; connected records remain read-only.
- Added `dashboard-scenario.ts` with a shared fictional clock, per-area notification rounds/recipient snapshots, a two-hour impact skip, and independent 30-minute deadlines starting at each area's second notice. Closing popups or changing areas/tabs preserves rehearsal state; reset, reload, or leaving the dashboard clears it. Before becomes a preparation-history view after impact.
- Changed the dashboard demo's follow-up policy: confirmed-safe households are excluded from repeat notifications, the map/attention queue, and response-unit approval, even when an older welfare-check need is recorded. The assignment reducer enforces the same exclusion; original need records remain intact. Unanswered households carry into the second notification, and silence becomes eligible for response review only after that area's second-notification deadline. Explicit help replies and unresolved recorded needs are reviewable immediately after impact unless confirmed safe.
- Added employee-approved local response-unit matching by area, exact required capabilities, availability, and positive capacity. Assignments update the displayed team availability and prevent duplicate household assignments or reuse of an active unit. Cases without a suitable available unit remain visible. This is a fixture-only matcher, separate from Person 3's full backend recommendation/ETA helper.
- Renamed visible frontend branding, metadata, and fixture source labels to StateWatch; retained internal `riskreach` package/database/token identifiers. Changed the hero to **Disaster watch**, replaced the subtitle with a red count of visible area alerts containing unresolved, unassigned households, and renamed phase controls to **Disaster prep / After disaster respond**. The count reflects loaded and hazard-filtered records; it is not a risk score.
- Moved Overview, Households, Teams, and Preparedness navigation from the app header to the top of the household/team panel. Preserved active-state styling and added horizontal overflow for narrow layouts.
- Applied Noto Sans through `next/font/google`, including normal/italic variable styles and the global font token. Updated form controls, notification textareas, map labels, and markers to use the app font. Fonts are downloaded during an uncached build and served with the app.
- Updated the root README and map handoff for the current popup workflow, local-versus-connected behavior, setup/troubleshooting, verification, and remaining work. Revised Persons 1–4 responsibilities and deliverables, recorded Josh Sebastian and Karthik Bhagavatula from existing project history, and distinguished Person 1's completed local frontend rehearsal from Person 4's pending shared-state integration. Person 4's name remains TBD.

### Verification

- Frontend TypeScript checking and all 16 `npm run test:scenario` tests passed: nine dashboard-flow regressions plus seven retained standalone-outreach regressions. Dashboard coverage includes safe-confirmation exclusion with older needs, safe community cases, second-notification recipients, per-area deadlines, help versus silence eligibility, team matching, duplicate assignments, and reset/source immutability.
- `npm run build -- --webpack` passed after the final Noto Sans integration, producing `/`, `/demo`, and `/outreach`. The first sandboxed attempt could not resolve `fonts.googleapis.com`; a network-enabled retry fetched the font and completed successfully. The default Turbopack production build was not reverified.
- The dashboard preview returned HTTP 200 at `/demo` during this contribution. Git whitespace and documentation consistency checks passed. Full interactive visual/responsive/keyboard acceptance and connected-backend/two-browser operational verification remain pending; screenshots and state tests do not establish those checks.
- No new backend test suite or lint run was performed for this checkpoint. AI generation, real notification delivery, persisted/shared scenario state and dispatch, scoring/flag rendering, assignment completion UI, and full backend recommendation integration remain pending. No deployment, real outreach, or operational dispatch was performed.

## Version 1.18 — 2026-11-08

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
