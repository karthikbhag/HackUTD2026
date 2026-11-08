# RiskReach — HackUTD 2026

> Working project name. A multi-hazard disaster preparedness and response dashboard for State Farm employees, powered by SpacetimeDB.

## Project overview

RiskReach helps employees answer four questions: **Where could a disaster cause harm? Who may be affected? What should we prepare? What assistance is still needed afterward?**

We are building this for a 24-hour hackathon, combining State Farm's **“The Worst Day, at Scale”** catastrophe-response challenge with Spacetime's main track. The primary user is a State Farm employee coordinating preparedness, outreach, and assistance across an affected region.

The dashboard connects a map of disaster impact with household information, help requests, response teams, and a shared activity history. The project models a hypothetical nationwide catastrophe-response operation for State Farm employees; it does not claim to reproduce confidential State Farm procedures or systems. State Farm customers can receive proactive outreach because the organization already has a contact relationship with them. Non-customers can also request or receive help. Assistance priority should reflect urgency and need; customer status provides outreach context rather than overriding emergency need.

This is a hackathon prototype using synthetic households and simulated response operations. Actual State Farm customer records, internal systems, and operational access are not assumed.

## Before and after a disaster

The following describes the intended end-to-end workflow. The main `/` page now connects Person 3 decisions and shared scenario actions to SpacetimeDB: preparation notices, separate post-impact check-ins, time skips, overdue follow-up, employee-approved assistance and shared activity. Open `/demo` for the preserved browser-local rehearsal. Notices/replies remain explicitly simulated; actual AI generation and notification delivery remain pending. See [connected main setup](backend/SHARED_WORKFLOW.md).

### Before: identify risk, explain it, and check on customers

1. **Receive a simulated hazard scenario.** Supply the disaster type, location, severity, expected impact time, and geographic footprint. Use fictional weather/hazard data so the demonstration can reliably show tornadoes and other disasters without waiting for real events.
2. **Show impact shapes on the map.** Use hazard-specific shapes for different impact areas, with severity labels and a legend identifying the most affected area. Keep geographic context boundaries distinct from hazard footprints; overlapping hazards remain individually inspectable.
3. **Open an area review.** An employee selects a shape or its information icon to see the underlying scenario data and an AI-generated summary of what is happening or expected to happen. Ground the summary in the supplied severity, timing, location, and exposure evidence; label it as a simulation and distinguish expected conditions from reported impact.
4. **Prioritize outreach from high to low.** Identify State Farm customers inside the impact footprint and explain outreach priority using hazard severity, household exposure, known assistance needs, time until impact, and contact history. Use transparent scoring; AI summarizes the evidence and drafts messages for employee review.
5. **Approve a preparation notification.** Recommend relevant hazard information and protective actions for employee approval. For a high-risk scenario with an evacuation instruction, include the affected area, timing, and evacuation guidance from the scenario's emergency-authority advisory. Severity alone must not invent an evacuation order. MVP notifications are simulated and recorded; actual delivery is a separate integration.
6. **Record customer responses.** Let customers confirm **safe**, report **not safe / need help**, or leave the check-in awaiting a response. Show the latest response, its time, and the outreach attempt so employees can see who still needs follow-up.

### Simulated time: advance the scenario deliberately

Use a fixed fictional scenario clock rather than waiting for a real disaster date. An explicit employee-controlled time skip advances from preparation to post-disaster conditions. A second, shorter time skip advances past a configurable response deadline to demonstrate follow-up. Display the simulated time, elapsed interval, and deadline; record phase changes and contact attempts so the demonstration can be reset and replayed. Changing the existing before/after presentation toggle alone does not advance time or mutate the scenario.

### After: check again, follow up, and dispatch help

1. **Send a new safety check-in.** After the first time skip, let the employee approve another notification to customers in the affected area asking whether they are safe or need help. Reuse the response choices, but update the message for post-disaster conditions. Preserve earlier responses as history; a pre-disaster “safe” response does not answer the new check-in.
2. **Update the shared dashboard.** Show safe, not-safe/needs-help, and awaiting-response households with the latest check-in time. Keep safety responses separate from assistance requests: confirming safety does not automatically resolve an existing need.
3. **Advance past the follow-up deadline.** After the shorter time skip, flag customers who have not answered the post-disaster check-in and customers who explicitly requested help. No response indicates unknown safety, not confirmed injury. Urgent help requests can be reviewed immediately without waiting for the deadline.
4. **Recommend and approve a response unit.** Create or review a help request or welfare-check request, recommend an available team with matching capabilities and capacity, and let an employee approve dispatch. Explain priority and show approximate distance/ETA; prevent duplicate active assignments.
5. **Track assistance through completion.** Synchronize team status, assignment progress, household updates, and activity history across employee dashboards. Record the outcome and release the team when its assignment is completed or cancelled.

Non-customers can also request or receive assistance. Rank response needs by urgency and need; State Farm customer status determines proactive outreach context rather than emergency assistance priority.

### Response routing — Person 2 handoff

**Status: implementation in progress — Josh Sebastian.** The approved design is documented in [the response routing implementation plan](RESPONSE_ROUTING_PLAN.md). This extends the post-disaster welfare-check workflow with automatic multi-stop routing; the existing employee-approved assistance-request workflow remains available. Automatic routing is an explicit demo exception to the manual dispatch guidance elsewhere in this README.

- **Demo scope:** two simulated welfare-check teams and 20 fictional households in one compact Dallas-area neighborhood. Teams start at a local staging point, perform checks without transporting people, and return within a two-hour simulated shift. Each visit initially takes five simulated minutes; playback initially runs at 10x speed.
- **Adjustable rules:** central validated configuration plus a per-run settings snapshot/version. Expose visit duration, shift length, playback speed, urgent response target and replan delay as settings; keep fixture size and neighborhood selectable through configuration. Changes must invalidate affected plans rather than leave stale assignments.
- **Routing:** use Google Compute Routes leg estimates and directions with a deterministic priority-aware heuristic. Prioritize urgent/needs-help households, then maximize unknown households checked within remaining shift time, including service and return travel. Use waiting time to break ties between unknown cases. This is approximate optimization, not a guarantee of a globally optimal route. Keep uncovered households and reasons visible.
- **Person 2 backend changes:** add run/config state, a dedicated welfare-visit queue, versioned team routes, simulated team state and a fenced worker lease. Keep one current visit per team with multiple queued future stops. Unknown households must not require fabricated assistance requests. Enforce mutual exclusion between welfare routes and existing manual request assignments; passenger-capacity checks do not apply to welfare checks. Add authorized views/reducers and regenerate client bindings.
- **Live updates:** integrate with the authoritative post-impact check-in/reply lifecycle, not just a presentation toggle or an earlier pre-impact response. A new safe response immediately cancels pending/queued/en-route welfare visits and invalidates the current destination. Preserve in-progress checks until acknowledged/completed; do not automatically resolve unrelated assistance needs. Reject stale optimizer results using planning/config/route versions. Handle urgent changes immediately and batch ordinary changes over five seconds by default.
- **Worker and simulation:** a persistent server-side Node worker coordinates Google calls and moves both teams along road polylines in the same selected area. It manages visit dwell, pause/resume/reset and configurable speed. Do not call Google on every position tick. Replan from each team's latest position without teleporting or allowing a cancelled stop to reappear.
- **UI boundary:** retain the Leaflet dispatcher map for household states and simulated team locations. Add a response-team `/response` screen with Google Maps, the selected team's ordered stops, ETAs, cancellation notices and playback controls. No live GPS or production team-lead sign-in is required for this scope.
- **Credentials:** use ignored `frontend/.env.local` entries `GOOGLE_MAPS_API_KEY` (server-only, Routes API) and `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` (browser/referrer-restricted, Maps JavaScript API). The default implementation supports a free Maps Demo Key without enabling billing; see the current shared workflow for its Compute Routes adaptation and quota limits. Explicitly load server credentials into the separate worker; never commit secrets. This approach does not require Route Optimization API OAuth.
- **Delivery order:** configurable fixture → transactional queue/cancellation → worker/provider/solver → response-team view → simulation → integrated acceptance. Verify no duplicate dispatch, safe-during-routing cancellation, urgent preemption, stale-result rejection, return-to-staging feasibility, API failure handling and repeatable reset. Preserve the existing shared workflow and nationwide fixtures.

Before implementation, reconcile the detailed plan's file-level references with the current [shared workflow contract](backend/SHARED_WORKFLOW.md), especially fresh post-impact check-ins, the existing simulated clock and request/assignment lifecycle. Reuse that authoritative state rather than introducing a conflicting second scenario clock or customer-response source.

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
| Preparedness actions and safety check-ins | Draft employee-approved simulated notifications before and after impact; record safe, needs-help, and pending/no-response outcomes per check-in | Prior responses remain in history; post-disaster outreach creates a fresh check-in and deadline |
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

**Confirmed stack: Next.js + TypeScript + SpacetimeDB.** The Leaflet/OpenStreetMap dashboard and operational backend are integrated through a shared subscription connection. Browser-local rehearsal remains available at `/demo`; `/` requires database configuration. See [backend setup and contract](backend/README.md) and [map integration handoff](frontend/src/components/map/README.md). Authoritative decision logic and connected scenario controls are implemented; interactive browser acceptance remains pending.

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

Aalvee Ahtav owns Person 1's map and interface work. Josh owns Person 2’s backend work; other role assignments remain pending. Each person owns one workstream and helps with integration.

| Owner | Workstream | Concrete deliverables | Dependencies and handoff |
| --- | --- | --- | --- |
| Person 1 — Aalvee Ahtav | Map and interface | App shell, nationwide pannable/zoomable map, hazard-layer controls, before/after toggle, zone/neighborhood selection, household detail panel, loading/error states | Agree on hazard-layer and geographic contracts with Persons 2 and 3; consume shared data and actions through Person 4's integration |
| Person 2 — Josh | Spacetime backend | Project/module setup, multi-hazard schema, reducers, validation, subscriptions support, seed/reset behavior, activity events, and concurrent updates | Publish initial schema and generate bindings early; coordinate disaster types, status enums, and validation rules with everyone |
| Person 3 — Karthik Bhagavatula | Disaster data and decision logic | Fictional nationwide datasets for tornadoes, earthquakes, hurricanes, wildfires, blizzards, and floods; hazard geometry, household exposure, priority rules/reasons, hazard-specific preparedness suggestions, team capability matching, and approximate ETA logic | Agree on geographic and hazard contracts with Persons 1 and 2; hand tested logic/data to Person 2 for authoritative backend use |
| Person 4 — name TBD | Operational workflow, integration, and demo | Multi-hazard filters, priority queue, outreach/task controls, request/assignment controls, shared client connection, two-session verification, hazard escalation flow, demo script, and documentation | Pair with Persons 1 and 2 to wire UI actions; use Person 3's explanations and recommendations |

Integration ownership does not make Person 4 responsible for fixing every workstream. Each owner must deliver a working vertical slice and resolve issues in their own area. Person 1 owns map/detail components; Person 4 owns queue/action components to reduce editing conflicts.

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

**Current checkpoint: v1.18 — 2026-11-08.** Restored Person 3's authoritative decision integration and connected it to the redesigned main scenario desk. Scores, exposure, overlooked flags, reviewed preparedness, requests, team selection, assistance progress, separate pre/post check-ins and bounded synthetic time skips now persist/share through SpacetimeDB. `/demo` remains local. The local main database has 10,000 households. See [setup, enrollment and verification](backend/SHARED_WORKFLOW.md). Browser acceptance is separate from the passing SDK/build checks.

Use `[ ]` for pending and `[x]` for completed work. Add `(in progress — name)` or `(blocked — reason)` to an unchecked item as needed. Mark work complete only when its stated behavior has been verified. Update this tracker and add a changelog entry in the same contribution.

### Planning — shared

- [x] Read the sponsor challenge screenshots and initial project proposal.
- [x] Document the employee-facing pre-disaster and post-disaster concept.
- [x] Draft MVP, technical approach, data contract, four workstreams, and schedule.
- [x] Confirm Next.js + TypeScript for the application and TypeScript + SpacetimeDB for the core backend.
- [ ] Confirm working name, team role assignments, nationwide geographic scope, six supported disaster types, seeded hotspot areas, and scenario assumptions.
- [ ] Confirm map provider, hazard-layer behavior, schema, status enums, scoring weights, and contact threshold.
- [ ] Confirm official submission deadline and sponsor eligibility requirements.

### Map and interface — Person 1

Browser verification covers the fixture-backed UI. Integrated browser connection checks remain pending.

- [x] Scaffold the Next.js + TypeScript frontend and document how to run it.
- [x] Separate the Next.js app into `frontend/` and reserve `backend/` for SpacetimeDB.
- [x] Verify browser rendering of the fixture-backed dashboard. (verified by user)
- [x] Verify the production build in an environment that permits local worker/server ports. (passes on Node 24.22.1)
- [x] Render a pannable/zoomable nationwide map, hazard-specific layers, and severity legends. (verified by user)
- [x] Allow employees to filter visible hazards and inspect overlapping disaster zones. (verified by user)
- [x] Render selectable household and response-team markers. (verified by user)
- [x] Build before/after views and household/zone detail panels. (verified by user)
- [x] Display source timestamps and simulation/estimate labels. (verified by user)
- [x] Handle loading, connection errors, empty states, and narrower screens. (verified by user)

### Backend — Person 2

- [ ] Implement approved response routing. (in progress — Josh Sebastian; queue, lease, worker, provider, response UI and isolated fixture implemented; automated offline live acceptance passes, full Google/browser acceptance pending)

- [x] Set up and verify the SpacetimeDB module and local development workflow.
- [x] Implement tables, indexes, and generated client bindings. (team-wide contract sign-off pending)
- [x] Add fictional seed data and a controlled demo reset.
- [x] Implement household check-in and outreach/task updates.
- [x] Implement help-request creation and status changes.
- [x] Implement assignment creation, completion, cancellation, and validation.
- [x] Persist activity events alongside operational changes.
- [x] Keep sensitive household data scoped to authorized employee views; keep credentials out of the repository.

See [backend setup/contract](backend/README.md) and [remaining Person 2 integration plan](backend/PLAN.md).

### Data and decision logic — Person 3

- [x] Create fictional nationwide datasets for tornadoes, earthquakes, hurricanes, wildfires, blizzards, and floods, with national context and concentrated high-risk neighborhoods/areas. Karthik Bhagavatula supplied the [portable fixtures and generator](data/scenarios/README.md): Small (60 households), Demo (10,000), Stress (100,000); the larger presets cover 50 states and 56 hotspots. Backend seed/reset now load the Small fixture through a validated adapter. Large-preset database loading and subscription checks now pass; national summaries and viewport rendering are implemented. Scoped server subscriptions remain deferred; interactive browser acceptance is pending.
- [x] Define hazard-specific impact geometry, source labels, and preparedness recommendations. Karthik Bhagavatula supplied schema v3 synthetic layers and 12 sourced employee-review templates; geometry/data validation passes. Explicit footprint persistence and subscribed rendering are implemented; interactive browser acceptance remains pending.
- [x] Determine affected households from the scenario zones. Karthik Bhagavatula implemented coordinate-based exposure against explicit impact layers in [backend/src/exposure.ts](backend/src/exposure.ts), with overlap evidence, unique counts, spatial indexing, and Small/Demo/Stress tests. [Handoff and offline report](backend/EXPOSURE.md); exposure evidence now drives private summaries and authorized selected-household explanations.
- [x] Implement priority scores and readable reasons. Karthik Bhagavatula supplied the [configurable helper, weights, and offline report](backend/PRIORITY.md), with customer-neutral scoring, overlap/need caps, stable ranking, and tests across all presets. Persisted/live scores, itemized explanations and the connected paginated queue are implemented.
- [x] Implement overdue-contact/overlooked-case detection. Karthik Bhagavatula supplied the [configurable helper, transition rules, and offline report](backend/FOLLOW_UP.md), with independent concerns, fresh-contact clearing, customer-neutral behavior, and Small/Demo/Stress tests. Live summaries, scheduled recomputation and overlooked filtering are implemented, including a separate simulated post-impact reply deadline.
- [x] Implement preparedness action suggestions. Restored the pure helper and 17 tests; integrated sourced suggestions, reviewed task approval, run-aware duplicate suppression and task completion.
- [x] Implement capability/capacity-aware team recommendations and approximate distance/ETA. Karthik Bhagavatula supplied the [pure snapshot helper and offline report](backend/TEAM_RECOMMENDATIONS.md), with exact eligibility/exclusion reasons, top-K distance ranking, configurable approximate ETA, all-preset checks, and actual dispatch/release harness tests. Live selected-request recommendations and employee-confirmed assignment controls are integrated; reducers revalidate current state.
- [x] Implement reproducible multi-hazard scenario escalation and reset behavior. Impact layers and decisions update for the selected hazard; reset advances the run, restores the selected fixture, clears exercise rounds and preserves access/history. Harness and live SDK checks pass; browser acceptance pending.

### Workflow, integration, and delivery — Person 4

- [x] Connect the map to SpacetimeDB subscriptions. (adapter datastore/live SDK checks passed; integrated browser verification pending)
- [x] Connect operational action controls to the shared SpacetimeDB connection. (implemented; automated checks pass; browser acceptance pending)
- [x] Build priority queue and overlooked-case filtering. (implemented; automated checks pass; browser acceptance pending)
- [x] Build preparedness/outreach action controls, including employee-approved simulated notifications and separate pre/post-disaster safety check-ins. (implemented; automated checks pass; browser acceptance pending)
- [ ] Connect AI-generated reviews grounded in scenario evidence. (selectable area information icons and explicitly labeled source-based previews are implemented)
- [x] Integrate a persisted/shared simulated scenario clock, impact time skip, follow-up deadline, and shorter follow-up time skip. (connected main desk; two-client SDK verified; `/demo` remains separate)
- [x] Route explicit help requests and overdue unanswered check-ins into persisted employee-reviewed assistance/welfare-check dispatch. (reviewable requests and explicit, revalidated assignment; no automatic dispatch)
- [x] Build help-request and assignment controls. (implemented; automated checks pass; browser acceptance pending)
- [x] Show synchronized assignment progress and activity history. (implemented; automated checks pass; browser acceptance pending)
- [ ] Run the acceptance checks below and record outcomes.
- [x] Write setup instructions with actual commands, environment variables, and versions. See Local setup below and the [backend setup/contract](backend/README.md); production build passes; integrated browser verification remains pending.
- [ ] Prepare the demo script, pitch, screenshots, and submission materials.
- [ ] Verify repository visibility meets the sponsor's public-source requirement.

## Acceptance checks

The full browser acceptance checks below remain pending interactive verification of the connected UI. Backend datastore/live SDK verification is recorded separately in `changelog.md`; it does not mark these browser checks complete.

1. **Shared updates:** Open two sessions on the same database. Change a check-in status in one; the other updates without refreshing.
2. **Preparedness:** Pan/zoom to a forecast/scenario hotspot for any supported disaster type, inspect affected households, and record outreach. Both sessions show its new status and activity event.
3. **Escalation:** Increase the severity of a seeded tornado, earthquake, hurricane, wildfire, blizzard, or flood scenario. Affected-case priorities and displayed reasons update consistently.
4. **Dispatch:** Assign an eligible available team to an open request. The request, assignment, and team all update together.
5. **Conflicting dispatch:** Try assigning the same request or unavailable team from another session. The backend rejects the invalid change without inconsistent state.
6. **Completion:** Resolve a request and complete its assignment. It leaves the unresolved queue, and team availability updates correctly.
7. **No one overlooked:** A seeded overdue household appears in the follow-up queue. Recording contact or resolving the relevant need changes the flag appropriately.
8. **Community assistance:** A non-customer request follows the same assistance workflow and is ranked by need.
9. **Repeatable demo:** Reset and replay the multi-hazard scenario successfully, including the simulated clock, check-ins, and deadlines. Simulated data, approximate travel times, and source timestamps remain clearly labeled.
10. **Area review:** Select a hazard shape or information icon. The review shows its severity, timing, evidence, and labeled AI summary; generation failure leaves structured details available.
11. **Two-stage check-in:** Record a pre-disaster safe response, skip past impact, and send a fresh post-disaster notification. The earlier response remains in history and does not mark the new check-in answered.
12. **Follow-up and dispatch:** Seed safe, needs-help, and unanswered post-disaster check-ins. Skip past the deadline; safe responders are excluded from no-response follow-up, while help requests and overdue unanswered cases are available for employee-reviewed dispatch. An urgent request is actionable before the skip.

## Judge demonstration — target 2–3 minutes

1. Show the simulated pre-disaster map, identify the highest-severity impact shape, and open its information icon for the AI area review and supporting evidence.
2. Review high-to-low outreach priority and approve a simulated preparation notification to affected State Farm customers. Include scenario evacuation guidance where applicable; show safe, needs-help, and awaiting-response examples in a second employee session.
3. Skip the scenario clock past impact and approve a new post-disaster safety check-in. Show that the earlier safe response remains history and the new request awaits a fresh reply.
4. Record safe and needs-help responses, then take the shorter time skip past the response deadline to reveal unanswered check-ins.
5. Review an assistance or welfare-check request, approve a suitable response unit, and show synchronized assignment progress and completion. Explain that urgent requests need not wait for a time skip.
6. Show a community assistance case, then reset the scenario clock and records to demonstrate repeatability.

Pitch: **RiskReach helps State Farm employees prepare before disasters, coordinate assistance afterward, and track unresolved needs so no one is overlooked.**

## Development and change tracking

### Current checkpoint — v1.18

The State Farm themed readiness overview retains the large-dataset map pipeline, geographic membership semantics, and paged record browsing. Summary metrics derive from visible records; the connected desk supplies authoritative priority scores, operational mutations and shared activity history.

Follow [Local scenario inspection](backend/SCENARIOS.md) to generate, build, publish,
seed, verify and switch between separate Small/Demo/Stress databases. The default
build uses modern schema-v3 Small with ten impact layers. The local main page uses
the staged Demo fixture (10,000 households). Exposure and decision summaries now
power the connected operational desk.

Person 3's [exposure](backend/EXPOSURE.md), [priority scoring](backend/PRIORITY.md) and [follow-up detection](backend/FOLLOW_UP.md) helpers remain available as pure calculations and offline reports. Score/flag persistence, scheduled recomputation and connected queue rendering are implemented.

### Local setup

Use Node.js `^22.23.4 || ^24.22.1 || >=26.12.1` for the SpacetimeDB SDK; `.nvmrc` selects the Node.js 24 line (install its latest patch). The initial checks ran with Node.js 26.13.0 and npm 11.20.0. PR #3 review verification used SDK-supported Node.js 24.22.1: 18 backend tests, backend typecheck/build, frontend typecheck/lint, six Python tests, and fixture validation passed. The latest exposure checkpoint additionally records 28 passing backend tests, backend typecheck/build, and nine passing Python tests on SDK-supported Node.js 24.22.1. Lint retains one existing generated-bindings warning. The current frontend production build passes on Node 24.22.1; the earlier CSS worker-port failure did not recur. This starter uses Next.js 16.4.5, React 19.3.0, TypeScript, Tailwind CSS 4, and ESLint.

```sh
# Optional, if you use nvm:
nvm use

# Enter the frontend and install the locked dependencies:
cd frontend
npm ci

# Start the development server:
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the connected RiskReach main dashboard; `/demo` is the browser-local rehearsal. If SpacetimeDB later runs locally on port 3000, use `npm run dev -- --port 3001` for Next.js.

With no connection configuration, `/` reports setup instructions; `/demo` retains fictional UI fixtures. For the connected main workflow, follow [SHARED_WORKFLOW.md](backend/SHARED_WORKFLOW.md), set both `NEXT_PUBLIC_SPACETIMEDB_URI` and `NEXT_PUBLIC_SPACETIMEDB_DATABASE` in `frontend/.env.local`, restart Next.js, and enroll the displayed browser identity using the [backend setup instructions](backend/README.md). Partial configuration shows an error. Internet access is needed for OpenStreetMap tiles; tile failure displays a warning while scenario overlays remain available. Never commit tokens, API keys, or real customer information.

### Available commands

Run these commands from `frontend/`. From the repository root, use `npm --prefix frontend run dev` (or the corresponding script).

| Command | Purpose | Current verification |
| --- | --- | --- |
| `npm run dev` | Start local development | Dashboard browser smoke check passed (user-reported) |
| `npm run lint` | Run ESLint | Passed |
| `npm run typecheck` | Generate route types and check TypeScript | Passed |
| `npm run build` | Create a production build | Connected main and demo routes pass on Node 24.22.1 |
| `npm start` | Serve a successful production build | Build verified; current localhost review uses the development server |

### Repository structure

```text
frontend/
  src/
    app/
      layout.tsx      # Shared layout and project metadata
      page.tsx        # Fixture-backed map dashboard entry
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
