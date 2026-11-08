# StateWatch — HackUTD 2026

> A multi-hazard disaster preparedness and response dashboard for State Farm employees, powered by SpacetimeDB.

## Project overview

StateWatch helps employees answer four questions: **Where could a disaster cause harm? Who may be affected? What should we prepare? What assistance is still needed afterward?**

We are building this for a 24-hour hackathon, combining State Farm's **“The Worst Day, at Scale”** catastrophe-response challenge with Spacetime's main track. The primary user is a State Farm employee coordinating preparedness, outreach, and assistance across an affected region.

The dashboard connects a map of disaster impact with household information, help requests, response teams, and a shared activity history. The project models a hypothetical nationwide catastrophe-response operation for State Farm employees; it does not claim to reproduce confidential State Farm procedures or systems. State Farm customers can receive proactive outreach because the organization already has a contact relationship with them. Non-customers can also request or receive help. Assistance priority should reflect urgency and need; customer status provides outreach context rather than overriding emergency need.

This is a hackathon prototype using synthetic households and simulated response operations. Actual State Farm customer records, internal systems, and operational access are not assumed.

## Before and after a disaster

The main `/` and `/demo` dashboards now use shared SpacetimeDB records: area alerts open reviews, **Take action** opens the notification popup, and dashboard controls advance the shared synthetic clock through impact and each area's follow-up deadline. Safe confirmations are excluded from repeat outreach and dashboard response approval while original assistance records remain intact. Notices, recipient snapshots, replies and assignments survive reloads and synchronize between enrolled employees. `/demo/local` preserves the isolated browser rehearsal. Actual AI generation and notification delivery remain pending. The older `/outreach` route retains its independent fresh-check-in behavior. See [connected popup setup and policy](backend/POPUP_WORKFLOW.md).

### Before: identify risk, explain it, and check on customers

1. **Receive a simulated hazard scenario.** Supply the disaster type, location, severity, expected impact time, and geographic footprint. Use fictional weather/hazard data so the demonstration can reliably show tornadoes and other disasters without waiting for real events.
2. **Show impact shapes on the map.** Use hazard-specific shapes for different impact areas, with severity labels and a legend identifying the most affected area. Keep geographic context boundaries distinct from hazard footprints; overlapping hazards remain individually inspectable.
3. **Open an area review.** An employee selects a shape or its information icon to see the underlying scenario data and an AI-generated summary of what is happening or expected to happen. Ground the summary in the supplied severity, timing, location, and exposure evidence; label it as a simulation and distinguish expected conditions from reported impact.
4. **Prioritize outreach from high to low.** Identify State Farm customers inside the impact footprint and explain outreach priority using hazard severity, household exposure, known assistance needs, time until impact, and contact history. Use transparent scoring; AI summarizes the evidence and drafts messages for employee review.
5. **Approve a preparation notification.** Recommend relevant hazard information and protective actions for employee approval. For a high-risk scenario with an evacuation instruction, include the affected area, timing, and evacuation guidance from the scenario's emergency-authority advisory. Severity alone must not invent an evacuation order. MVP notifications are simulated and recorded; actual delivery is a separate integration.
6. **Record customer responses.** Before impact, customers only confirm **safe**; unanswered check-ins remain **No reply**, with no simulated response recorded. The **need help** option becomes available in the fresh post-disaster check-in. Show the latest response, its time, and the outreach attempt so employees can see who still needs follow-up.

### Simulated time: advance the scenario deliberately

Use a fixed fictional scenario clock rather than waiting for a real disaster date. An explicit employee-controlled time skip advances from preparation to post-disaster conditions. A second, shorter time skip advances past a configurable response deadline to demonstrate follow-up. Display the simulated time, elapsed interval, and deadline; record phase changes and contact attempts so the demonstration can be reset and replayed. Changing the existing before/after presentation toggle alone does not advance time or mutate the scenario.

### After: check again, follow up, and dispatch help

1. **Follow up with unconfirmed households.** After the first time skip, open an area's alert and approve a second notification in a popup. Offer **safe** and **need help** responses. In the dashboard preview, earlier safe confirmations leave the repeat-outreach queue; preserve those replies in the preparation round. This exclusion is a demo policy, not a new observation of post-impact safety.
2. **Update the dashboard.** Show confirmed-safe counts and keep unconfirmed households and assistance requests on the map and in the queue. Keep the original assistance records, but exclude confirmed-safe households from the demo queue and response-unit approval. The configured main/demo state is now shared and persisted; only `/demo/local` keeps browser-local rehearsal state.
3. **Advance past the follow-up deadline.** After the shorter time skip, flag customers who have not answered the post-disaster check-in and customers who explicitly requested help. No response indicates unknown safety, not confirmed injury. Urgent help requests can be reviewed immediately without waiting for the deadline.
4. **Recommend and approve a response unit.** Create or review a help request or welfare-check request, recommend an available team with matching capabilities and capacity, and let an employee approve dispatch. Explain priority and show approximate distance/ETA; prevent duplicate active assignments.
5. **Track assistance through completion.** Synchronize team status, assignment progress, household updates, and activity history across employee dashboards. Record the outcome and release the team when its assignment is completed or cancelled.

Non-customers can also request or receive assistance. Rank response needs by urgency and need; State Farm customer status determines proactive outreach context rather than emergency assistance priority.

### What “prediction” means in this project

We will estimate potential exposure from available forecasts, hazard data, or clearly labeled demonstration scenarios. We are not training a new disaster-prediction model during the hackathon.

The supported disaster types are **tornadoes, earthquakes, hurricanes, wildfires, blizzards, and floods**. These hazards need different data, impact layers, preparedness actions, and response workflows. Earthquake features should use hazard scenarios or post-detection information rather than claim reliable advance prediction. For the MVP, use a **nationwide U.S. multi-hazard scenario** with a national overview and seeded high-risk neighborhoods/areas for all six hazard types. The full preparation-to-response workflow can be demonstrated end-to-end on one selected hotspot while the other hazards remain visible as supported scenario layers.

Every impact layer should show whether it is a forecast, a report, or a simulation. Recommendations support employee decisions and require human review before dispatch or outreach.

## Hackathon scope

### Required MVP

| Feature | Required behavior | Completion evidence |
| --- | --- | --- |
| Disaster map | Display a pannable and zoomable nationwide U.S. map with hazard-specific impact zones, households, and response teams | Selecting a neighborhood/zone shows its disaster type, severity, source, and affected households |
| Before/after views and simulated time | Show preparedness/response information and explicitly advance a fictional scenario clock through impact and a follow-up deadline | Time skips update scenario phase and follow-up eligibility; the display toggle alone does not advance time |
| Area review | Select an impact shape or information icon to inspect severity, timing, evidence, and an AI-generated scenario summary | The most affected area is identifiable; the summary distinguishes expected conditions from reported impact |
| Household details | Show customer/community status, check-in status, needs, and last contact | An employee can update a household and see the result |
| Prioritization | Rank unresolved cases and explain the contributing factors | Increased risk or a new urgent request changes the queue |
| Preparedness actions and safety check-ins | Before impact, accept safe confirmations and retain No reply for unanswered notices; after impact, accept safe/need-help replies with a follow-up deadline | Prior responses remain in history; post-disaster outreach creates a fresh check-in and deadline |
| Post-disaster assistance | Record help requests and suggest a suitable available team | A request can move from open to assigned to resolved |
| Dispatch | Assign a team and show estimated distance/travel time | The team and request both reflect the assignment |
| Shared live state | Store core operational data and changes in SpacetimeDB | Two browser sessions show the same updates without refresh |
| Overlooked cases | Flag unresolved, high-risk households overdue for contact | A seeded example appears and clears after an appropriate update |
| Demo scenario | Seed/reset fictional multi-hazard data and escalate one or more disaster severities | The complete judging story can be repeated reliably |

### Stretch goals — only after the MVP works

- Live weather or hazard feed ingestion with a documented fallback for each supported disaster type.
- Real road routing, travel times, and road-closure awareness.
- Public help-request form and mobile responder view.
- Shelter/resource inventory, damage photos, and claims follow-up.
- More detailed hazard-specific models, cross-hazard cascading impacts, and additional nationwide scenarios.
- Actual notification integrations; the MVP only records or simulates outreach.

## Technical design

**Confirmed stack: Next.js + TypeScript + SpacetimeDB.** The Leaflet/OpenStreetMap dashboard and operational backend are integrated through an shared subscription connection. The main and demo routes use configured operational data; an explicit local rehearsal is available at `/demo/local`. See [backend setup and contract](backend/README.md) and [map integration handoff](frontend/src/components/map/README.md). The connected operational panel now includes a live priority queue and persisted Mark contacted; notification/response approval and shared clock controls are now connected. Browser acceptance, actual AI/notification services and broader operational controls remain pending.

| Layer | Proposed approach | Responsibility |
| --- | --- | --- |
| Employee interface | Next.js + TypeScript | Map, preparedness/response views, household panel, priority queue, assignments |
| Map | Leaflet 1.9.4 + OpenStreetMap raster tiles (initial UI implementation) | Nationwide overview, pan/zoom navigation, hazard-specific polygons, neighborhood/household/team markers, selection, assignment lines |
| Core backend | SpacetimeDB module written in TypeScript | Tables, validated changes, assignments, prioritization, activity history |
| Live synchronization | Generated client bindings and SpacetimeDB subscriptions | Share operational updates between employee sessions |
| Scenario data | Seeded fictional households, teams, and hazard zones distributed across the U.S., with concentrated high-risk neighborhoods for all six disaster types | Repeatable demo independent of outside feeds |
| AI area review (planned) | AI provider consuming structured scenario evidence | Summarize selected impact areas and draft outreach for employee approval; keep deterministic ranking independent of the provider |
| Optional external services | Live forecast/hazard providers, routing provider, or notification delivery service | Extend the simulated workflow after the core integration is stable |

Spacetime must power the application's primary functionality for its main track. The database will hold disaster zones, households, requests, teams, tasks, and assignments. Employee actions will invoke server-side functions, and subscriptions will propagate committed changes to other dashboards. The main workflow must not depend on browser-only mock state.

Use reducers for validated transactional changes. If external APIs are added, use the appropriate supported integration mechanism, such as procedures; do not place network calls inside reducers. Confirm APIs against the installed SpacetimeDB version before coding.

### Initial data contract

Agree on exact field names, types, IDs, and status enums before separate frontend/backend work begins. These entities now have backend tables; exact implemented field types, reducer inputs, geography, and subscription names are documented in [the backend contract](backend/README.md#contract-and-client-handoff). Team-wide contract sign-off remains pending.

| Entity | Suggested fields |
| --- | --- |
| Disaster | `id`, `name`, `type` (`tornado`, `earthquake`, `hurricane`, `wildfire`, `blizzard`, `flood`), `phase`, `source`, `is_simulated`, `updated_at` |
| Zone | `id`, `disaster_id`, `name`, `level`, `parent_zone_id` (optional), `boundary`, `risk_level`, `updated_at` |
| Household | `id`, `zone_id`, `display_name`, `latitude`, `longitude`, `is_customer`, `check_in_status`, `vulnerability_flags`, `last_contact_at` |
| Help request | `id`, `household_id`, `need_type`, `urgency`, `status`, `created_at`, `resolved_at` |
| Response team | `id`, `name`, `latitude`, `longitude`, `status`, `capacity`, `capabilities` |
| Assignment | `id`, `request_id`, `team_id`, `status`, `estimated_distance`, `estimated_eta`, `created_at`, `completed_at` |
| Preparedness task | `id`, `zone_id`, `household_id` (optional), `action_type`, `status`, `created_at`, `completed_at` |
| Activity event | `id`, `entity_type`, `entity_id`, `action`, `actor_id`, `timestamp`, `summary` |

For the nationwide map, use a simple geographic hierarchy: national overview, broad affected areas or metro areas, and neighborhood-level hazard zones. The map should remain useful at every zoom level: national and broad-area layers provide context, while neighborhood layers reveal households, teams, and detailed risk. Keep the seeded MVP data intentionally sparse outside the selected hotspots so the national view is readable and the demo can quickly zoom into actionable areas. `level` and `parent_zone_id` support this hierarchy without changing the household and response workflows. A zone must also identify its disaster type so overlapping hazards can be displayed and prioritized separately.

Keep statuses separate so “safe” does not incorrectly imply all assistance needs are resolved:

- Household check-in: `unknown`, `safe`, `needs_help`, `urgent`. In the planned notification flow, “not safe / need help” maps to `needs_help` (or `urgent` when explicitly reported). “No response” is derived from an unanswered check-in whose deadline has passed; retain `unknown` safety rather than treating silence as a response. Track notification attempts, phase, responses, and deadlines separately so pre-disaster replies do not satisfy post-disaster check-ins. This per-check-in history is a planned contract extension, not a claim about the current household table.
- Request: `open`, `assigned`, `in_progress`, `resolved`.
- Team: `available`, `assigned`, `responding`, `unavailable`.
- Assignment: `assigned`, `in_progress`, `completed`, `cancelled`.
- Preparedness task: `pending`, `in_progress`, `completed`.

### Prioritization and recommendations

Start with a transparent rules-based ranking. Consider disaster type, explicit urgency, zone severity, vulnerability flags, and time without contact. Display the reasons next to each case. Agree on weights and an overdue-contact threshold, and label them as demo assumptions. Keep hazard-specific modifiers explainable—for example, wildfire smoke exposure, hurricane evacuation need, earthquake infrastructure disruption, tornado shelter need, blizzard isolation, or flood depth.

Recommend teams from those with suitable capabilities and remaining capacity, then compare proximity. For the initial demo, straight-line distance and an assumed speed can produce an **approximate** travel time; label it clearly. Do not present that line as a verified safe road route. Prevent duplicate active assignments and reject attempts to assign an unavailable team. Assignment completion or cancellation must update team availability consistently.

The planned AI area review summarizes structured scenario evidence and drafts next steps or notification text for employee review. Show the evidence, scenario timestamp, and simulation label alongside the summary. If generation is unavailable, retain the structured area details and identify the summary as unavailable. The ranking remains deterministic and does not require an LLM; a rules-based score should not be described as a trained predictive model.

## Four-person work split

Aalvee Ahtav owns Person 1's frontend work, Josh Sebastian owns Person 2's backend work, and Karthik Bhagavatula owns Person 3's data and decision logic. Tien Phan owns Person 4's shared workflow and integration work. The table separates delivered work from remaining integration; a browser-local rehearsal does not complete the shared operational workflow.

| Owner | Workstream | Delivered work | Remaining work and handoff |
| --- | --- | --- | --- |
| Person 1 — Aalvee Ahtav | Map, interface, and frontend demo | StateWatch branding, Noto Sans, Disaster watch heading and red area-alert count; nationwide Leaflet map, six hazard filters, footprints and clustering; household/team details; panel-level Overview/Households/Teams/Preparedness navigation; area-review and notification popups; dashboard demo clock, two-stage outreach, safe-reply exclusion, and employee-approved simulated response units | Verify final popup fit, keyboard behavior, and responsive layout; pair with Person 4 to connect UI controls to authoritative operations. Keep fixture-only state separate from subscribed records. |
| Person 2 — Josh Sebastian | Spacetime backend | Tables/indexes and generated bindings; authorized employee views; seed/reset and escalation reducers; check-ins, requests, atomic assignment lifecycle and activity events; live SDK and large-dataset integration checks recorded in prior changelog entries | Extend the contract for per-notification rounds and a shared scenario clock; integrate Person 3's decision helpers; pair with Person 4 on validated mutations and browser acceptance. |
| Person 3 — Karthik Bhagavatula | Disaster data and decision logic | Small/Demo/Stress fixtures for six hazards; synthetic impact geometry and sourced guidance templates; tested exposure, priority, overdue-contact, and capability/capacity recommendation helpers with approximate distance/ETA and offline reports | Integrate helpers into authoritative shared operations and the UI; reconcile preparedness-helper availability and escalation behavior. Local popup matching is a separate demo implementation, not the full recommendation engine. |
| Person 4 — Tien Phan | Shared workflow, integration, and delivery | Typed reducer wrappers and shared feedback on the existing connection; Mark contacted action; live priority queue using Person 3’s exposure, ranking, and follow-up helpers, with score reasons, overlooked/hazard filters, paging and map selection | Wire notification rounds, clock/deadlines, help requests and assignment approval to SpacetimeDB; show synchronized assignment progress/activity; complete interactive and two-browser verification, final demo and submission materials. Person 1’s popup rehearsal remains browser-local. |

Each owner resolves issues in their own workstream and helps with integration. Person 1 maintains the map, details, and demo popup/queue presentation. Person 4 coordinates shared operational state and actions with Person 2, using Person 3's decision logic and Person 1's UI. Coordinate edits to shared components before integration.

## Suggested 24-hour schedule

Times are relative to the team's build start, not a claim about the official submission deadline. Confirm the event's actual cutoff separately.

| Window | Team milestone |
| --- | --- |
| Hours 0–2 | Assign names, confirm the six supported disaster types and nationwide seeded hotspots, choose map provider, agree on schema/statuses, start app and Spacetime module |
| Hours 2–6 | Show the nationwide map with hazard layers, seeded zones/households/teams, and hotspot zoom; establish the real subscription connection; implement the first persisted status update |
| Hours 6–12 | Complete hazard filters, preparedness tasks, household updates, priority reasons, help requests, and team assignments |
| Hours 12–17 | Integrate hazard escalation, overlooked-case detection, before/after flow, approximate ETAs, and activity history |
| Hours 17–20 | Verify two sessions, assignment validation, reset/replay, loading/errors, and the complete demo |
| Hours 20–22 | Improve clarity and fix bugs; add stretch work only if the core demo is stable |
| Hours 22–24 | Freeze features, rehearse, finish setup instructions and submission materials, verify public repository requirement |

## Progress tracker

**Current checkpoint: v1.21 — 2026-11-08.** Connected the merged notification-popup design to shared clock/run state, per-area notice/recipient/reply records and validated real assignment records. Preserved carried-safe exclusion, independent second-notification deadlines, the StateWatch design and existing Person 4 action wrappers/queue. `/` and `/demo` connect to the configured database; `/demo/local` remains isolated. Updated the existing local 10,000-household database with an additive migration, preserving data and browser enrollment. All 104 backend tests, 18 scenario/adapter tests, nine Python tests, typechecks, lint, production build and live two-client verification pass. Interactive browser acceptance remains separate. See [the popup workflow runbook](backend/POPUP_WORKFLOW.md).

Use `[ ]` for pending and `[x]` for completed work. Add `(in progress — name)` or `(blocked — reason)` to an unchecked item as needed. Mark work complete only when its stated behavior has been verified. Update this tracker and add a changelog entry in the same contribution.

### Planning — shared

- [x] Read the sponsor challenge screenshots and initial project proposal.
- [x] Document the employee-facing pre-disaster and post-disaster concept.
- [x] Draft MVP, technical approach, data contract, four workstreams, and schedule.
- [x] Confirm Next.js + TypeScript for the application and TypeScript + SpacetimeDB for the core backend.
- [x] Set the frontend product name to StateWatch. Internal package names, database names, and token keys retain `riskreach` for compatibility.
- [x] Record all four workstream owners and the six-hazard nationwide scope.
- [ ] Finalize team-wide scenario assumptions and contract sign-off.
- [ ] Confirm map provider, hazard-layer behavior, schema, status enums, scoring weights, and contact threshold.
- [ ] Confirm official submission deadline and sponsor eligibility requirements.

### Map and interface — Person 1

Browser verification covers the fixture-backed UI. Integrated browser connection checks remain pending.

- [x] Scaffold the Next.js + TypeScript frontend and document how to run it.
- [x] Separate the Next.js app into `frontend/` and reserve `backend/` for SpacetimeDB.
- [x] Verify browser rendering of the fixture-backed dashboard. (verified by user)
- [x] Verify the production build with Webpack, including the Noto Sans integration. (passed; the Google Fonts download required network access)
- [x] Reverify the default Turbopack production build. (all main/demo/local/outreach routes pass on Node 24.22.1)
- [x] Render a pannable/zoomable nationwide map, hazard-specific layers, and severity legends. (verified by user)
- [x] Allow employees to filter visible hazards and inspect overlapping disaster zones. (verified by user)
- [x] Render selectable household and response-team markers. (verified by user)
- [x] Build before/after views and household/zone detail panels. (verified by user)
- [x] Display source timestamps and simulation/estimate labels. (verified by user)
- [x] Handle loading, connection errors, empty states, and narrower screens. (verified by user)
- [x] Apply StateWatch branding, Noto Sans, Disaster watch, the red visible-area alert count, and updated phase labels. (TypeScript and Webpack build passed)
- [x] Move Overview/Households/Teams/Preparedness navigation above the household panel. (TypeScript passed; final responsive/browser acceptance pending)
- [x] Implement same-dashboard notification popups, dashboard time skips, per-area reply rounds, and response-unit approval in fixture mode. (nine dashboard state tests pass)
- [x] Exclude confirmed-safe households from the queue and dispatch even with an older need; prevent duplicate assignments and unavailable/incompatible team approval. (regression tests pass)
- [ ] Verify the final popup flow, keyboard focus, phase controls, and panel navigation in desktop and narrow browser layouts.

### Backend — Person 2

- [x] Set up and verify the SpacetimeDB module and local development workflow.
- [x] Implement tables, indexes, and generated client bindings. (team-wide contract sign-off pending)
- [x] Add fictional seed data and a controlled demo reset.
- [x] Implement household check-in and outreach/task updates.
- [x] Implement help-request creation and status changes.
- [x] Implement assignment creation, completion, cancellation, and validation.
- [x] Persist activity events alongside operational changes.
- [x] Keep sensitive household data scoped to authorized employee views; keep credentials out of the repository.

See [backend setup/contract](backend/README.md) and [remaining Person 2 integration plan](backend/PLAN.md).

### Data and decision logic — Person 3: Karthik Bhagavatula

- [x] Create fictional nationwide datasets for tornadoes, earthquakes, hurricanes, wildfires, blizzards, and floods, with national context and concentrated high-risk neighborhoods/areas. Karthik Bhagavatula supplied the [portable fixtures and generator](data/scenarios/README.md): Small (60 households), Demo (10,000), Stress (100,000); the larger presets cover 50 states and 56 hotspots. Backend seed/reset now load the Small fixture through a validated adapter. Large-preset database loading and subscription checks now pass; national summaries and viewport rendering are implemented. Scoped server subscriptions remain deferred; interactive browser acceptance is pending.
- [x] Define hazard-specific impact geometry, source labels, and preparedness recommendations. Karthik Bhagavatula supplied schema v3 synthetic layers and 12 sourced employee-review templates; geometry/data validation passes. Explicit footprint persistence and subscribed rendering are implemented; interactive browser acceptance remains pending.
- [x] Determine affected households from the scenario zones. Karthik Bhagavatula implemented coordinate-based exposure against explicit impact layers in [backend/src/exposure.ts](backend/src/exposure.ts), with overlap evidence, unique counts, spatial indexing, and Small/Demo/Stress tests. [Handoff and offline report](backend/EXPOSURE.md); matched layer IDs now persist in restored decision summaries; the live queue reuses the same exposure helper.
- [x] Implement priority scores and readable reasons. Karthik Bhagavatula supplied the [configurable helper, weights, and offline report](backend/PRIORITY.md), with customer-neutral scoring, overlap/need caps, stable ranking, and tests across all presets. Live queue rendering is integrated in the browser by Person 4 (`frontend/src/lib/workflow/priority-queue.ts`); queue scores are computed client-side; restored authoritative summary views also persist decisions using the same helpers.
- [x] Implement overdue-contact/overlooked-case detection. Karthik Bhagavatula supplied the [configurable helper, transition rules, and offline report](backend/FOLLOW_UP.md), with independent concerns, fresh-contact clearing, customer-neutral behavior, and Small/Demo/Stress tests. Queue filtering is integrated by Person 4 and recomputes in the browser every 30 seconds; authoritative summaries/scheduled refresh are restored, and shared notification deadlines add an explicit separate queue concern.
- [x] Implement preparedness action suggestions. (restored helper, 17 tests and authorized backend suggestions/approval; broader popup task presentation remains separate work)
- [x] Implement capability/capacity-aware team recommendations and approximate distance/ETA. Karthik Bhagavatula supplied the [pure snapshot helper and offline report](backend/TEAM_RECOMMENDATIONS.md), with exact eligibility/exclusion reasons, top-K distance ranking, configurable approximate ETA, all-preset checks, and actual dispatch/release harness tests. Employee approval and reducer revalidation remain required; live/UI integration is pending.
- [x] Implement reproducible multi-hazard scenario escalation and reset behavior. (restored existing backend contract; shared dashboard reset restores the selected fixture, advances the run and preserves access/history; browser acceptance pending)

### Workflow, integration, and delivery — Person 4: Tien Phan

- [x] Connect the map to shared SpacetimeDB subscriptions. (adapter datastore/live SDK checks passed; integrated browser verification pending)
- [x] Connect typed reducer wrappers and shared pending/success/error feedback to the existing SpacetimeDB connection; wire Mark contacted for the selected household. (interactive/two-browser verification pending)
- [x] Build the live priority queue using Person 3’s exposure, ranking, and follow-up helpers, with score reasons, overlooked and hazard filters, pagination, map selection, and Mark contacted. (upstream offline smoke checks passed; interactive/two-browser verification pending)
- [x] Provide a browser-local rehearsal as the UI foundation. Person 1 delivered dashboard notification popups, two-hour and 30-minute time skips, safe-response exclusion, and simulated response-unit approval. (nine dashboard tests plus seven retained standalone-outreach tests pass; final browser checks pending)
- [x] Connect notification/check-in controls and assignment approval to persisted shared operational state. (actual frontend wrappers and subscription adapter verified with two SDK clients; browser acceptance pending)
- [ ] Connect AI-generated reviews grounded in scenario evidence. (selectable area information icons and explicitly labeled source-based previews are implemented)
- [x] Integrate a persisted/shared simulated scenario clock, impact time skip, independent area deadlines and shorter follow-up time skips. (`/` and `/demo`; `/demo/local` remains isolated)
- [x] Route needs-help replies and overdue unanswered second check-ins into reviewable persisted welfare requests and employee-approved assignment. (safe exclusion never erases older requests; no automatic dispatch)
- [ ] Finish broader help-request and assignment lifecycle controls. (popup welfare review/approval is connected; explicit need/party forms and general completion/cancellation UI remain separate work)
- [ ] Show synchronized assignment progress and activity history.
- [ ] Run the acceptance checks below and record outcomes.
- [x] Write setup instructions with actual commands, environment variables, and versions. See Local setup below and the [backend setup/contract](backend/README.md); the Webpack production build passed, while integrated browser verification remains pending.
- [ ] Prepare the demo script, pitch, screenshots, and submission materials.
- [ ] Verify repository visibility meets the sponsor's public-source requirement.

## Acceptance checks

The full browser acceptance checks below remain pending UI integration. Backend datastore/live SDK verification is recorded separately in `changelog.md`; it does not mark these browser checks complete.

1. **Shared updates:** Open two sessions on the same database. Change a check-in status in one; the other updates without refreshing.
2. **Preparedness:** Pan/zoom to a forecast/scenario hotspot for any supported disaster type, inspect affected households, and record outreach. Both sessions show its new status and activity event.
3. **Escalation:** Increase the severity of a seeded tornado, earthquake, hurricane, wildfire, blizzard, or flood scenario. Affected-case priorities and displayed reasons update consistently.
4. **Dispatch:** Assign an eligible available team to an open request. The request, assignment, and team all update together.
5. **Conflicting dispatch:** Try assigning the same request or unavailable team from another session. The backend rejects the invalid change without inconsistent state.
6. **Completion:** Resolve a request and complete its assignment. It leaves the unresolved queue, and team availability updates correctly.
7. **No one overlooked:** A seeded overdue household appears in the follow-up queue. Recording contact or resolving the relevant need changes the flag appropriately.
8. **Community assistance:** A non-customer request follows the same assistance workflow and is ranked by need.
9. **Repeatable demo:** Reset and replay the multi-hazard scenario successfully, including the simulated clock, check-ins, and deadlines. Simulated data, approximate travel times, and source timestamps remain clearly labeled.
10. **Area review:** Click a red information icon. The centered popup shows the selected area map, severity, and labeled source-based AI preview; evidence opens in a separate paged view. Verify the compact layout fits the viewport and action buttons remain visible without scrolling. **Take action** opens a notification popup on the same dashboard in demo mode; the connected read-only flow retains the older outreach route. Verify Escape/close and focus restoration.
11. **Two-stage check-in:** In Disaster prep, approve the initial notification and verify only safe replies are offered. Confirm one household safe and leave another unanswered. Use the dashboard skip to reach After disaster respond; the earlier safe responder is excluded from repeat outreach and dispatch, while the unanswered household remains. Send the second notification and verify safe/need-help replies and an independent 30-minute area deadline. State-transition tests pass; full browser/shared-state acceptance remains pending.
12. **Follow-up and dispatch:** Seed safe, needs-help, and unanswered post-disaster check-ins. Skip past the deadline; safe responders are excluded from all response-unit approval even with older recorded needs, while help requests and overdue unanswered cases are available for employee-reviewed dispatch. An urgent request is actionable before the skip.

## Judge demonstration — target 2–3 minutes

The current fixture rehearsal is local to one browser. Shared notification/assignment updates, assignment completion, and community dispatch below remain integration targets; the connected workflow separately supplies live priority ranking and Mark contacted; do not present them as implemented by `/demo`.

1. Open `/demo` in **Disaster prep**. Show the fictional map, red area-alert count, and household-panel tabs. Open a red information icon, review the local map and evidence, and choose **Take action**.
2. Review/edit and approve the initial simulated notification in the popup. Confirm a customer safe and leave another unanswered. Show the safe household leaving the queue, then close the popup.
3. Use **Skip 2 hours → After impact** on the dashboard. In **After disaster respond**, reopen the area alert and approve the second notification. Earlier safe responders are excluded; unanswered households carry forward.
4. Simulate **need help** for a recipient, or close the popup and use **Skip 30 min → Check responses** to make unanswered second notices overdue. Each area's deadline starts when its own second notice is sent.
5. Open an eligible household's popup, review a matching local unit, and approve the simulated assignment. Safe households cannot receive units; assigned teams cannot be reused. Cases with no available capability match remain visible.
6. Show that switching areas or tabs preserves the browser-local rehearsal, then use **Reset demo**. Explain that actual delivery, shared notification/assignment progress and completion remain integration targets. The connected workflow separately supports a live priority queue and Mark contacted.

Pitch: **StateWatch helps State Farm employees prepare before disasters, coordinate assistance afterward, and track unresolved needs so no one is overlooked.**

## Development and change tracking

### Current checkpoint — v1.21

The StateWatch dashboard now keeps fixture outreach on the map page: area-review and notification popups, explicit dashboard time skips, per-area second-notification deadlines, safe-household queue removal and dispatch blocking, and local capability-matched response approvals. Assigned teams become unavailable to other local cases. State persists across areas and tabs until reset, reload, or navigation away. Noto Sans is loaded through `next/font/google` with normal/italic variable weights; the header, hero, alert count, phase labels, panel navigation, forms, and map labels use the updated presentation. The older `/outreach` page retains its independent fresh-check-in rehearsal. Connected map details and notification controls remain read-only; the operational workflow supports persisted Mark contacted and a live priority queue. Remaining notification/assignment controls and activity-history UI are pending.

Follow [Local scenario inspection](backend/SCENARIOS.md) to generate, build, publish,
seed, verify and switch between separate Small/Demo/Stress databases. The default
build retains Small; generated v3 presets persist explicit hazard footprints.
Household exposure remains available as a pure helper/offline report; exposure
relations and operational controls are not part of this display integration.

Person 3's [exposure](backend/EXPOSURE.md), [priority scoring](backend/PRIORITY.md) and [follow-up detection](backend/FOLLOW_UP.md) helpers remain available as pure calculations and offline reports. Tien’s connected queue now computes exposure, scores/reasons, and follow-up flags from subscribed rows and refreshes time-based rules every 30 seconds. Persisted scores/flags and authoritative scheduled recomputation remain pending.

### Local setup

Use Node.js `^22.23.4 || ^24.22.1 || >=26.12.1` for the SpacetimeDB SDK; `.nvmrc` selects the Node.js 24 line (install its latest patch). The initial checks ran with Node.js 26.13.0 and npm 11.20.0. PR #3 review verification used SDK-supported Node.js 24.22.1: 18 backend tests, backend typecheck/build, frontend typecheck/lint, six Python tests, and fixture validation passed. The latest exposure checkpoint additionally records 28 passing backend tests, backend typecheck/build, and nine passing Python tests on SDK-supported Node.js 24.22.1. Lint retains one existing generated-bindings warning. Earlier frontend Turbopack builds encountered a CSS worker-port permission failure, including an elevated retry. The latest UI checkpoint built successfully with `npm run build -- --webpack`; this does not establish that the default Turbopack restriction is resolved. This starter uses Next.js 16.4.5, React 19.3.0, TypeScript, Tailwind CSS 4, and ESLint.

```sh
# Optional, if you use nvm:
nvm use

# Enter the frontend and install the locked dependencies:
cd frontend
npm ci

# Start the development server:
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the StateWatch simulation dashboard. If SpacetimeDB later runs locally on port 3000, use `npm run dev -- --port 3001` for Next.js.

With no connection configuration, the page uses fictional UI fixtures. For subscribed operational data, set both `NEXT_PUBLIC_SPACETIMEDB_URI` and `NEXT_PUBLIC_SPACETIMEDB_DATABASE` in `frontend/.env.local`, restart Next.js, and enroll the displayed browser identity using the [backend setup instructions](backend/README.md). Partial configuration shows an error. Internet access is needed for OpenStreetMap tiles; tile failure displays a warning while scenario overlays remain available. Never commit tokens, API keys, or real customer information.

The homepage `/` attempts a backend connection whenever both SpacetimeDB variables are configured. If the local server is stopped, start it with `spacetime start --listen-addr 127.0.0.1:3100` and follow the backend runbook for publishing, seeding, and employee enrollment. A connection failure leaves empty records; zero counts in that state do not establish that no alerts exist. Use `/demo` for frontend work without a backend. Browser extensions that inject attributes such as `data-sharkid` can cause hydration warnings; retry with extensions disabled for localhost.

Noto Sans is fetched at build time by `next/font/google` and served with the app; the first uncached build needs access to Google Fonts. No browser-time Google Fonts request is required.

### Try the current UI

1. Open [http://localhost:3000/demo](http://localhost:3000/demo) for the connected popup workflow, or [the local rehearsal](http://localhost:3000/demo/local) for isolated fixtures.
2. Click a red information icon for a centered area popup containing the local map, severity, summary preview, and evidence. Use **Take action** to open the notification popup on the same dashboard.
3. Review/edit and approve the initial notification. Simulate a **safe** reply for a household with no recorded assistance need; it disappears from the map and queue. Leave another household unanswered, then close the popup.
4. Use **Skip 2 hours → After impact** on the dashboard. The After tab opens with unanswered households retained. Open the area alert again and choose **Take action** to send the second notification; earlier safe responders are excluded.
5. Simulate **need help**, or close the popup and use **Skip 30 min → Check responses** to reveal overdue silence. Reopen the popup from the alert or a household queue row to approve a matching response unit. Assigned teams become unavailable to other cases; cases without a matching unit remain visible.

The dashboard demo clock applies to all six fictional areas; each second notification starts its own 30-minute reply deadline. Changing tabs or areas preserves state. Before becomes a history view after impact. Reloading, leaving the dashboard, or **Reset demo** clears the rehearsal. Recorded needs and community assistance remain visible for households without a safe confirmation. Safe confirmations remove households from the queue and block response-unit approval without deleting older needs. The older map-free `/outreach` route remains available separately. Connected mode uses authorized subscriptions. Its map and notification views remain read-only, while the operational workflow provides a live priority queue and persisted Mark contacted. AI reviews are source-based previews; the demo sends no messages and performs no operational dispatch.

The dashboard popup preview passed TypeScript, all 16 scenario tests (nine dashboard-flow tests and seven older outreach tests), and the Webpack production build. `/demo` returned HTTP 200 locally. Interactive visual, responsive, and keyboard acceptance remain pending.

### Available commands

Run these commands from `frontend/`. From the repository root, use `npm --prefix frontend run dev` (or the corresponding script).

| Command | Purpose | Current verification |
| --- | --- | --- |
| `npm run dev` | Start local development | Dashboard browser smoke check passed (user-reported) |
| `npm run lint` | Run ESLint | Earlier checkpoint passed with an existing generated-bindings warning; not rerun for v1.20 |
| `npm run typecheck` | Generate route types and check TypeScript | Passed |
| `npm run build` | Create a production build with default Turbopack | Historical CSS worker-port failure; default production build not reverified at v1.20 |
| `npm run build -- --webpack` | Build with Webpack | Passed at v1.20 after the popup workflow, safe-dispatch fix, branding/navigation, and Noto Sans changes |
| `npm run test:scenario` | Verify browser-local scenario transitions | All 16 tests passed (nine dashboard and seven standalone-outreach tests) |
| `npm start` | Serve a successful production build | Runtime smoke check pending |

### Repository structure

```text
frontend/
  src/
    app/
      layout.tsx      # Shared layout and project metadata
      page.tsx        # Optional connected dashboard; fixtures without configuration
      demo/page.tsx   # Fixture-only popup demo regardless of backend configuration
      outreach/page.tsx # Retained standalone outreach route
      globals.css     # Tailwind and base styling
      favicon.ico     # Starter favicon; branding pending
    components/map/   # Map dashboard, Leaflet renderer, detail panel, integration notes
    lib/map/          # Frontend view models and disposable fictional UI fixtures
  public/             # Static assets from the starter
  next.config.ts      # Next.js and Tailwind/Turbopack configuration
  eslint.config.mjs   # ESLint configuration
  tsconfig.json       # TypeScript configuration and @/* alias
  AGENTS.md           # Framework-generated coding guidance
  package.json        # Frontend dependencies and scripts
  package-lock.json   # Reproducible npm dependency versions
backend/
  README.md           # Verified backend setup and integration contract
  PLAN.md             # Person 2 progress and remaining handoffs
  src/                # Schema, reducers, seed fixtures, and datastore tests
  scripts/            # Repeatable live subscription check
  package.json        # Backend build, test, and binding-generation commands
.nvmrc                # Shared Node.js version
.gitignore            # Ignores generated files throughout the repository
README.md             # Project plan and setup
changelog.md          # Change history
```

SpacetimeDB module code is in `backend/src/` and generated bindings are in `frontend/src/module_bindings/`. Keep map/browser subscriptions in client components and preserve SpacetimeDB as the authoritative backend.

### Dependency findings

The initial online npm audit reported eight moderate findings in the development linting dependency chain, originating in a transitive `minimatch` dependency. No production dependency findings were reported. Review compatible upstream fixes before deployment; no forced major-version downgrade was applied.

### Updating project records

- **README.md:** Current project plan, ownership, scope, setup instructions, and completed/pending checklist.
- **[changelog.md](changelog.md):** Chronological record of actual changes, contributors, verification, and known gaps. Follow its existing version sequence and preserve prior entries.
- When starting work, mark the relevant checkbox in progress with an owner. When finishing, check the behavior, update the checklist, and record only the work actually completed in the changelog.
- If scope changes, revise the plan and document the decision. Do not mark proposed features as implemented.

## References

- Sponsor problem statements: the three challenge screenshots shared with the team; confirm final rules with organizers.
- [SpacetimeDB documentation](https://spacetimedb.com/docs/)
- [SpacetimeDB overview](https://spacetimedb.com/docs/intro/what-is-spacetimedb/)
- [Next.js quickstart](https://spacetimedb.com/docs/quickstarts/nextjs/)
- [Client subscriptions](https://spacetimedb.com/docs/clients/subscriptions/)
- [Current SpacetimeDB capabilities and misconceptions](https://spacetimedb.com/docs/intro/misconceptions/)

### Dataset integration checkpoint

Default seed/reset still bundle `data/scenarios/nationwide-v1.json`. `build:scenario`
stages a selected fixture without replacing that source, then produces a bundle and
count/checksum manifest for a separate local database. The converter supports
v1/v2/v3; explicit v3 footprints persist in an employee-authorized view.

The adapter retains all households, including regional records, with actual zone
membership separate from hotspot grouping. The map distinguishes dataset totals,
hazard-filter matches and rendered viewport markers. National summaries, local
Canvas household markers and 50-row lists bound rendering costs. Context outlines
are not hazard footprints or affected-household counts. [Commands, expected counts,
verification and remaining limits](backend/SCENARIOS.md).
