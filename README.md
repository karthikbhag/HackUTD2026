# StateWatch — HackUTD 2026

> A multi-hazard disaster preparedness and response dashboard for State Farm employees, powered by SpacetimeDB.

## Project overview

StateWatch helps employees answer four questions: **Where could a disaster cause harm? Who may be affected? What should we prepare? What assistance is still needed afterward?**

We are building this for a 24-hour hackathon, combining State Farm's **“The Worst Day, at Scale”** catastrophe-response challenge with Spacetime's main track. The primary user is a State Farm employee coordinating preparedness, outreach, and assistance across an affected region.

The dashboard connects a map of disaster impact with household information, help requests, response teams, and a shared activity history. The project models a hypothetical nationwide catastrophe-response operation for State Farm employees; it does not claim to reproduce confidential State Farm procedures or systems. State Farm customers can receive proactive outreach because the organization already has a contact relationship with them. Non-customers can also request or receive help. Assistance priority should reflect urgency and need; customer status provides outreach context rather than overriding emergency need.

This is a hackathon prototype using synthetic households and simulated response operations. Actual State Farm customer records, internal systems, and operational access are not assumed.

## Before and after a disaster

The main `/` dashboard uses shared SpacetimeDB records when `DATA_SOURCE=database`. `/demo` and `/demo/local` always use bundled dummy data with browser-local state. Both flows support reviewed risk-specific notifications, simulated safe/need-help replies, impact and follow-up time skips, automatic response-unit assignment for explicit help replies, and rescue completion.

On the connected main page, notices, recipient snapshots, replies, assignments and completion history persist across reloads and synchronize between enrolled employees. The separate **Shared operational map** and **Outreach & response** panels below the map have been removed; area alerts and **Take action** still open the notification workflow. The older `/outreach` route and the `/response` routing workspace remain available separately. See [shared popup policy](backend/POPUP_WORKFLOW.md) and [backend setup](backend/README.md).

Area reviews and follow-up questions use Gemini only when requested. All scenario records and unit movements are simulated; actual notification delivery and real-world dispatch are not implemented.

### Before: identify risk, explain it, and check on customers

1. **Receive a simulated hazard scenario.** Supply the disaster type, location, severity, expected impact time, and geographic footprint. Use fictional weather/hazard data so the demonstration can reliably show tornadoes and other disasters without waiting for real events.
2. **Show impact shapes on the map.** Use hazard-specific shapes for different impact areas, with severity labels and a legend identifying the most affected area. Keep geographic context boundaries distinct from hazard footprints; overlapping hazards remain individually inspectable.
3. **Open an area review.** An employee selects a shape or its information icon to see the underlying scenario data and an AI-generated summary of what is happening or expected to happen. Ground the summary in the supplied severity, timing, location, and exposure evidence; label it as a simulation and distinguish expected conditions from reported impact.
4. **Prioritize outreach from high to low.** Identify State Farm customers inside the impact footprint and explain outreach priority using hazard severity, household exposure, known assistance needs, time until impact, and contact history. Use transparent scoring; AI summarizes the evidence and drafts messages for employee review.
5. **Approve a preparation notification.** Recommend relevant hazard information and protective actions for employee approval. For a high-risk scenario with an evacuation instruction, include the affected area, timing, and evacuation guidance from the scenario's emergency-authority advisory. Severity alone must not invent an evacuation order. MVP notifications are simulated and recorded; actual delivery is a separate integration.
6. **Record customer responses.** Before impact, customers only confirm **safe**; unanswered check-ins remain **No reply**, with no simulated response recorded. The **need help** option becomes available in the fresh post-disaster check-in. Show the latest response, its time, and the outreach attempt so employees can see who still needs follow-up.

### Simulated time: advance the scenario deliberately

Use the explicit scenario controls to advance time. **Skip 2 hours → After impact** moves every area into response, even if it was never reviewed or notified; Disaster prep stays disabled until reset. **Skip 30 min → Check responses** advances pending follow-up deadlines. **Skip 30 min → Complete rescues** finishes active dashboard rescues and releases units. The shared clock applies to every area, while each second notification starts its own 30-minute reply window. Changing a view or hazard filter does not advance time.

### After: check again, follow up, and dispatch help

1. **Follow up with unconfirmed households.** After impact, approve an area's second notification. Review separate High/Medium/Low messages and their recipient counts before sending. Earlier explicit safe confirmations remain in history and exclude those households from repeat outreach and response-unit approval; this is a simulation policy rather than a new post-impact safety observation.
2. **Automatically assign help replies.** **Simulate: need help** records the reply and automatically reserves an available compatible unit. The shared backend chooses the nearest compatible free unit using approximate straight-line distance, checks capacity and capabilities, and excludes units busy with another assignment or reserved for routing. A missing match leaves the help reply and request queued rather than fabricating an assignment.
3. **Review unanswered follow-ups.** After **Skip 30 min → Check responses**, households with an unanswered second notice become eligible for **Approve response unit**. Each area's deadline runs from its own send time. Silence means unknown safety, not confirmed injury; explicit help replies use automatic assignment instead of this approval step.
4. **Complete rescues and reuse units.** **Skip 30 min → Complete rescues** completes dashboard rescues active at the start of the skip, resolves their linked requests, releases units, and removes completed households from the unresolved map queue. Freed matching units automatically serve queued explicit help replies; these new rescues remain active until a later completion skip. Unanswered households still require approval. The shared action leaves unrelated manual assignments and routing visits active.
5. **Keep shared history or replay locally.** The main database-backed page persists completion and assignment history. `/demo` and `/demo/local` reset on reload. **Reset shared dataset** is available to enrolled employees and administrators and restores the fixture bundled in the published backend; **Reset demo** only clears browser-local state.

Non-customers can also request or receive assistance. Rank response needs by urgency and need; State Farm customer status determines proactive outreach context rather than emergency assistance priority.

### Response routing — Person 2 handoff

**Status: implementation in progress — Josh Sebastian.** The approved design is documented in [the response routing implementation plan](RESPONSE_ROUTING_PLAN.md). This extends the post-disaster welfare-check workflow with automatic multi-stop routing; the existing employee-approved assistance-request workflow remains available. This routing workflow is separate from the dashboard’s automatic assignment for explicit help replies and employee-approved dispatch for overdue silence.

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

Every impact layer should show whether it is a forecast, a report, or a simulation. Outreach messages and unanswered-household dispatch require employee approval. An explicit simulated help reply automatically assigns a compatible available unit; AI reviews do not initiate actions.

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

**Confirmed stack: Next.js + TypeScript + SpacetimeDB.** The Leaflet/OpenStreetMap dashboard and operational backend are integrated through a shared subscription connection. The main and demo routes use configured operational data; an explicit local rehearsal is available at `/demo/local`. See [backend setup and contract](backend/README.md) and [map integration handoff](frontend/src/components/map/README.md). The connected operational panel now includes a live priority queue and persisted Mark contacted; notification/response approval and shared clock controls are now connected. Browser acceptance, actual notification delivery and broader operational controls remain pending.

| Layer | Proposed approach | Responsibility |
| --- | --- | --- |
| Employee interface | Next.js + TypeScript | Map, preparedness/response views, household panel, priority queue, assignments |
| Map | Leaflet 1.9.4 + OpenStreetMap raster tiles (initial UI implementation) | Nationwide overview, pan/zoom navigation, hazard-specific polygons, neighborhood/household/team markers, selection, assignment lines |
| Core backend | SpacetimeDB module written in TypeScript | Tables, validated changes, assignments, prioritization, activity history |
| Live synchronization | Generated client bindings and SpacetimeDB subscriptions | Share operational updates between employee sessions |
| Scenario data | Seeded fictional households, teams, and hazard zones distributed across the U.S., with concentrated high-risk neighborhoods for all six disaster types | Repeatable demo independent of outside feeds |
| AI area review | Gemini Flash (free tier) through the server routes `POST /api/area-review` and `POST /api/area-chat` (follow-ups), consuming a small structured snapshot | Summarize selected impact areas and draft outreach for employee approval; keep deterministic ranking independent of the provider |
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

**Implementation (Person 4, v1.23).** The area popup's review section has a **Generate AI Review** button; nothing is generated automatically. The browser builds a small snapshot of the selected area (`frontend/src/lib/ai/area-review.ts`): hazard, severity, source, timestamps, simulation flags, impact-layer labels/basis/limitations/data kind, household counts by check-in, top recorded needs and vulnerability flags, team counts by status, and the scenario guidance. It contains no household names, IDs, or coordinates. `POST /api/area-review` (`frontend/src/app/api/area-review/route.ts`) validates the snapshot, applies a same-origin check, a 16 KB body limit and the review budget below, then calls Gemini with the server-only client and structured JSON output. Token use is budgeted in `frontend/src/lib/ai/review-budget.ts` (v1.24): reviews for unchanged evidence are reused from a 30-minute server cache with no new tokens, identical concurrent requests share one call, thinking is set to minimal, output is capped at 1,024 tokens, and defaults allow 5 reviews per minute, 50 per day and 100,000 tokens per day (Pacific-time days). All limits are environment variables (0 = off) so a paid plan only changes `.env.local`. The reply is validated: required fields, length caps, and no numbers that are absent from the snapshot. The popup shows it with an **AI-generated** label, model name, **Simulation** label when applicable, and snapshot/generation times, separating expected conditions from reported impacts. A response is shown only for the area and phase it was requested for; changing selection cancels the request, and a notice appears if area data changes after the snapshot. Loading, retry, not-configured, rate-limit, timeout, and upstream errors keep the structured area details visible. The route only returns text: it cannot send notifications, dispatch teams, write to SpacetimeDB, or change priority scores.

**Follow-up questions (Person 4, v1.28).** After a review appears, an **Ask a follow-up** box (`frontend/src/components/map/ai-area-chat.tsx`) offers starter questions and a 300-character question field. `POST /api/area-chat` (`frontend/src/app/api/area-chat/route.ts`) receives the same snapshot, the review (re-validated against the snapshot), the last 3 answered turns and the question; it is stateless apart from counters. Gemini is told to answer only from that evidence, say when something is not in it, keep expected conditions separate from reported impacts, decline unrelated questions and requests to notify, dispatch, change records or rank households, and treat the question as a question rather than new instructions. Answers are plain text capped at 512 output tokens and pass the same no-new-numbers check; an answer that mentions a number absent from the snapshot is withheld with a rephrase message. Follow-ups use the shared review budget (`reserveGeminiCall`) plus a limit of 6 answered follow-ups per review (`GEMINI_CHAT_MAX_TURNS`, 0 = off; failed calls do not count; resets after an hour or when the evidence changes). The chat resets when the area, phase or review changes, cancels its request on close, ignores answers for another area, and turns off when area data changes after the snapshot. Measured live: about 1,100–1,200 tokens and 2–3 s per follow-up.

**Map-wide assistant (Person 4, v1.29).** An **Ask AI** button floats in the bottom-right corner of the dashboard and opens **Ask StateWatch AI** (`frontend/src/components/map/ai-assistant.tsx`). It answers questions across the areas shown on the map, such as which areas have the most urgent check-ins or no available teams. `POST /api/overview-chat` receives a compact overview (`frontend/src/lib/ai/overview-chat.ts`): totals for all shown areas and per-area counts for up to 12 areas, with no household names, IDs or coordinates. Gemini returns structured JSON with the answer and up to 3 related area IDs, which appear as **Review <area> →** buttons that open the area popup. It may compare areas by named counts but never scores, ranks or sets priorities (the priority queue stays authoritative), and it cannot notify, dispatch or change records. Answers pass the same no-new-numbers check, share the review budget, and use the per-conversation question limit, which resets when the map data or filters change. The multi-turn Gemini call is shared with follow-ups in `frontend/src/lib/ai/gemini-chat.ts`. For UI testing without Gemini, set `GEMINI_MOCK=1` (development only; see Local setup).

## Four-person work split

Aalvee Ahtav owns Person 1's frontend work, Josh Sebastian owns Person 2's backend work, and Karthik Bhagavatula owns Person 3's data and decision logic. Tien Phan owns Person 4's shared workflow and integration work. The table separates delivered work from remaining integration; a browser-local rehearsal does not complete the shared operational workflow.

| Owner | Workstream | Delivered work | Remaining work and handoff |
| --- | --- | --- | --- |
| Person 1 — Aalvee Ahtav | Map, interface, and frontend demo | StateWatch branding, Noto Sans, Disaster watch heading and red area-alert count; nationwide Leaflet map, six hazard filters, footprints and clustering; household/team details; panel-level Overview/Households/Teams/Preparedness navigation; area-review and notification popups; dashboard clock, two-stage outreach, safe-reply exclusion, automatic simulated help assignment and rescue-completion controls on shared and local dashboards | Verify final popup fit, keyboard behavior, responsive layout and the latest shared workflow in browser sessions. Keep fixture-only state separate from subscribed records. |
| Person 2 — Josh Sebastian | Spacetime backend | Tables/indexes and generated bindings; authorized employee views; seed/reset and escalation reducers; check-ins, requests, atomic assignment lifecycle and activity events; live SDK and large-dataset integration checks recorded in prior changelog entries | Verify deployed shared notification/assignment lifecycles, authorization, fixture-preserving migrations and browser acceptance with Person 4. |
| Person 3 — Karthik Bhagavatula | Disaster data and decision logic | Small/Demo/Stress fixtures for six hazards; synthetic impact geometry and sourced guidance templates; tested exposure, priority, overdue-contact, and capability/capacity recommendation helpers with approximate distance/ETA and offline reports | Integrate helpers into authoritative shared operations and the UI; reconcile preparedness-helper availability and escalation behavior. Local popup matching is a separate demo implementation, not the full recommendation engine. |
| Person 4 — Tien Phan | Shared workflow, integration, and delivery | Typed reducer wrappers and shared feedback on the existing connection; Mark contacted action; live priority queue using Person 3’s exposure, ranking, and follow-up helpers, with score reasons, overlooked/hazard filters, paging and map selection | Complete interactive and two-browser verification of the persisted notification rounds, clock/deadlines, automatic help assignment and completion flow; prepare final demo and submission materials. `/demo` remains browser-local. |

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

**Current checkpoint: v1.32 (2026-11-08).** `/` follows `DATA_SOURCE`; `/demo` and `/demo/local` always use dummy data. The connected main page now supports risk-specific notification messages, automatic simulated assignment for explicit help replies, approval for overdue unanswered follow-ups and a shared rescue-completion skip. The backend is deployed to `statewatch` on Maincloud. Gemini area reviews, follow-up chat, the map-wide **Ask AI** assistant and development-only `GEMINI_MOCK=1` remain available. See [changelog v1.32](changelog.md#version-132--2026-11-08) for verification and remaining acceptance checks.

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
- [x] Reverify the historical Turbopack production build. (passed on Node 24.22.1; the current build script uses Webpack)
- [x] Render a pannable/zoomable nationwide map, hazard-specific layers, and severity legends. (verified by user)
- [x] Allow employees to filter visible hazards and inspect overlapping disaster zones. (verified by user)
- [x] Render selectable household and response-team markers. (verified by user)
- [x] Build before/after views and household/zone detail panels. (verified by user)
- [x] Display source timestamps and simulation/estimate labels. (verified by user)
- [x] Handle loading, connection errors, empty states, and narrower screens. (verified by user)
- [x] Apply StateWatch branding, Noto Sans, Disaster watch, the red visible-area alert count, and updated phase labels. (TypeScript and Webpack build passed)
- [x] Move Overview/Households/Teams/Preparedness navigation above the household panel. (TypeScript passed; final responsive/browser acceptance pending)
- [x] Implement same-dashboard notification popups, dashboard time skips, per-area reply rounds, and response-unit approval in fixture mode. (covered by the current scenario regression suite)
- [x] Exclude confirmed-safe households from the queue and dispatch even with an older need; prevent duplicate assignments and unavailable/incompatible team approval. (regression tests pass)
- [ ] Verify the final popup flow, keyboard focus, phase controls, and panel navigation in desktop and narrow browser layouts.

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

### Data and decision logic — Person 3: Karthik Bhagavatula

- [x] Create fictional nationwide datasets for tornadoes, earthquakes, hurricanes, wildfires, blizzards, and floods, with national context and concentrated high-risk neighborhoods/areas. Karthik Bhagavatula supplied the [portable fixtures and generator](data/scenarios/README.md): Small (60 households), Demo (10,000), Stress (100,000); the larger presets cover 50 states and 56 hotspots. Backend seed/reset now load the Small fixture through a validated adapter. Large-preset database loading and subscription checks now pass; national summaries and viewport rendering are implemented. Scoped server subscriptions remain deferred; interactive browser acceptance is pending.
- [x] Define hazard-specific impact geometry, source labels, and preparedness recommendations. Karthik Bhagavatula supplied schema v3 synthetic layers and 12 sourced employee-review templates; geometry/data validation passes. Explicit footprint persistence and subscribed rendering are implemented; interactive browser acceptance remains pending.
- [x] Determine affected households from the scenario zones. Karthik Bhagavatula implemented coordinate-based exposure against explicit impact layers in [backend/src/exposure.ts](backend/src/exposure.ts), with overlap evidence, unique counts, spatial indexing, and Small/Demo/Stress tests. [Handoff and offline report](backend/EXPOSURE.md); exposure evidence now drives private summaries and authorized selected-household explanations.
- [x] Implement priority scores and readable reasons. Karthik Bhagavatula supplied the [configurable helper, weights, and offline report](backend/PRIORITY.md), with customer-neutral scoring, overlap/need caps, stable ranking, and tests across all presets. Persisted/live scores, itemized explanations and the connected paginated queue are implemented.
- [x] Implement overdue-contact/overlooked-case detection. Karthik Bhagavatula supplied the [configurable helper, transition rules, and offline report](backend/FOLLOW_UP.md), with independent concerns, fresh-contact clearing, customer-neutral behavior, and Small/Demo/Stress tests. Live summaries, scheduled recomputation and overlooked filtering are implemented, including a separate simulated post-impact reply deadline.
- [x] Implement preparedness action suggestions. Restored the pure helper and 17 tests; integrated sourced suggestions, reviewed task approval, run-aware duplicate suppression and task completion.
- [x] Implement capability/capacity-aware team recommendations and approximate distance/ETA. Karthik Bhagavatula supplied the [pure snapshot helper and offline report](backend/TEAM_RECOMMENDATIONS.md), with exact eligibility/exclusion reasons, top-K distance ranking, configurable approximate ETA, all-preset checks, and actual dispatch/release harness tests. Live selected-request recommendations and employee-confirmed assignment controls are integrated; reducers revalidate current state.
- [x] Implement reproducible multi-hazard scenario escalation and reset behavior. Impact layers and decisions update for the selected hazard; reset advances the run, restores the selected fixture, clears exercise rounds and preserves access/history. Harness and live SDK checks pass; browser acceptance pending.

### Workflow, integration, and delivery — Person 4: Tien Phan

- [x] Connect the map to SpacetimeDB subscriptions. (adapter datastore/live SDK checks passed; integrated browser verification pending)
- [x] Connect operational action controls to the shared SpacetimeDB connection. (implemented; automated checks pass; browser acceptance pending)
- [x] Build priority queue and overlooked-case filtering. (implemented; automated checks pass; browser acceptance pending)
- [x] Build preparedness/outreach action controls, including employee-approved simulated notifications and separate pre/post-disaster safety check-ins. (implemented; automated checks pass; browser acceptance pending)
- [x] Connect AI-generated reviews grounded in scenario evidence. (Tien Phan: on-demand **Generate AI Review** in the area popup via `POST /api/area-review` and the server-only Gemini client; snapshot/response validation tests and a live route request passed; interactive browser verification pending. Follow-up questions about a review added in v1.28 with offline tests and live route requests; browser verification pending. Map-wide **Ask StateWatch AI** assistant and development-only `GEMINI_MOCK` mode added in v1.29 with offline tests and a production build; browser verification and a live assistant request pending. AI-drafted notifications remain later work)
- [x] Integrate a persisted/shared simulated scenario clock, impact time skip, follow-up deadline, and shorter follow-up time skip. (connected main desk; two-client SDK verified; `/demo` remains separate)
- [x] Automatically assign compatible available units for explicit simulated help replies; retain employee approval for overdue unanswered follow-ups. (shared backend and local demo; regression tests pass)
- [x] Complete active dashboard rescues with a shared 30-minute time skip, preserve completion history, release units and automatically serve queued help requests. (backend lifecycle and shared-state adapter tests pass)
- [x] Build help-request and assignment controls. (implemented; automated checks pass; browser acceptance pending)
- [x] Show synchronized assignment progress and activity history. (implemented; automated checks pass; browser acceptance pending)
- [ ] Run the acceptance checks below and record outcomes.
- [x] Write setup instructions with actual commands, environment variables, and versions. See Local setup below and the [backend setup/contract](backend/README.md); the Webpack production build passed, while integrated browser verification remains pending.
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
10. **Area review:** Click a red information icon. The centered popup shows the selected area map, severity, scenario guidance, and a **Generate AI Review** button (with `GEMINI_API_KEY` or `GEMINI_MOCK=1` set, a labeled AI-generated review appears, followed by an **Ask a follow-up** box; without it, an unavailable message appears and the area details remain); evidence opens in a separate paged view. Verify the compact layout fits the viewport and action buttons remain visible without scrolling. **Take action** opens the notification popup on both the connected main page and local demo, including separate risk-message editors when supported by the deployed contract. Verify Escape/close and focus restoration.
11. **Two-stage check-in:** In Disaster prep, approve the initial notification and verify only safe replies are offered. Confirm one household safe and leave another unanswered. Use the dashboard skip to reach After disaster respond; the earlier safe responder is excluded from repeat outreach and dispatch, while the unanswered household remains. Send the second notification and verify safe/need-help replies and an independent 30-minute area deadline. State-transition tests pass; full browser/shared-state acceptance remains pending.
12. **Follow-up and dispatch:** Simulate a need-help reply and verify immediate automatic assignment, or a queued help message if no compatible unit is free. Before the deadline, unanswered households have no approval button; after their own 30-minute window, verify manual response-unit approval. Safe responders remain excluded.
13. **Rescue completion:** Use **Skip 30 min → Complete rescues**. Verify active rescues complete, their linked requests resolve, units are released, completed households leave the map queue, and queued help receives matching freed units. Verify newly assigned rescues stay active until another completion skip and unrelated assignments are preserved.

## Judge demonstration — target 2–3 minutes

Use `/demo` for a deterministic browser-local rehearsal; `/demo/local` is an alias. Use `/` with `DATA_SOURCE=database` to demonstrate the same core workflow with persisted shared records. Browser acceptance of the latest shared flow remains pending.

1. Open `/demo` in **Disaster prep**, select an area alert, review its evidence and choose **Take action**.
2. Review the High/Medium/Low messages and approve the initial notification. Simulate one safe confirmation and leave another household unanswered.
3. Use **Skip 2 hours → After impact**. All areas move to **After disaster respond**. Open the area again and approve its follow-up notification.
4. Simulate **need help** and show the automatically assigned matching response unit. If no unit is available, the request stays queued.
5. Use **Skip 30 min → Check responses** and approve a response unit for an unanswered household once its area deadline has passed.
6. Use **Skip 30 min → Complete rescues**. Show completed households leaving the unresolved queue and units becoming available or serving queued help requests. Repeat for another rescue, then use **Reset demo**. Explain that shared persistence is available on the connected main page, while no real messages or units are sent.

Pitch: **StateWatch helps State Farm employees prepare before disasters, coordinate assistance afterward, and track unresolved needs so no one is overlooked.**

## Development and change tracking

### Current checkpoint — v1.32

The connected main dashboard and local demo now share the preparation, follow-up, automatic help assignment and rescue-completion flow. The main map retains area popups and shared actions without the separate operational panels below it. Matching backend changes and regenerated bindings are deployed to `statewatch` on Maincloud, including risk-specific notification recipients and messages. Existing scenario data was preserved; the database was not reset during this update.

The deployed backend uses the staged Demo fixture: 10,000 households, 56 disaster areas and 220 teams. Normal source builds use the Small fixture. Rebuild and publish the matching Demo bundle before changing the cloud module so a later shared reset preserves the intended scenario size; see [fixture publication guidance](backend/POPUP_WORKFLOW.md) and [scenario runbook](backend/SCENARIOS.md).

Verified on Node 26.13.0 with SpacetimeDB CLI/SDK 2.14.1: 152 backend tests, 51 frontend scenario/adapter/AI tests, TypeScript checks, the staged Demo build and the Webpack production build pass. Targeted ESLint checks on changed frontend files pass. The weather test now checks returned radii independently of database iteration order. Interactive browser acceptance of the latest shared flow remains pending. See [changelog v1.32](changelog.md#version-132--2026-11-08).

### Local setup

Use Node.js `^22.23.4 || ^24.22.1 || >=26.12.1` for the SpacetimeDB SDK; `.nvmrc` selects the Node 24 line. The latest checks passed on Node 26.13.0 with SpacetimeDB CLI/SDK 2.14.1. This app uses Next.js 16.4.5, React 19.3.0, TypeScript, Tailwind CSS 4 and ESLint. `npm run build` explicitly uses Webpack; see the changelog for historical build results.

```sh
# Optional, if you use nvm:
nvm use

# Enter the frontend and install the locked dependencies:
cd frontend
npm ci

# Start the development server:
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Choose the route and data source for your workflow:

| Route | Data and state |
| --- | --- |
| `/` | Uses the configured database when `DATA_SOURCE=database`; otherwise uses browser-local dummy data. |
| `/demo`, `/demo/local` | Always use bundled dummy data; scenario actions reset on reload. No database is required. |
| `/outreach` | Uses the configured data source for the separate outreach view; `?mode=demo` explicitly selects fixtures. |
| `/response` | Requires database mode and connection settings for the separate routing workspace. |

For the shared Maincloud dashboard, configure `frontend/.env.local` and restart Next.js:

```dotenv
DATA_SOURCE=database
NEXT_PUBLIC_SPACETIMEDB_URI=https://maincloud.spacetimedb.com/
NEXT_PUBLIC_SPACETIMEDB_DATABASE=statewatch
```

Set `DATA_SOURCE=local` to use fixtures on the main page even when database settings are present. `/demo` stays local in either mode. Copy `frontend/.env.example` for other settings; follow [backend setup](backend/README.md) for a separate local database and employee enrollment. A new CLI login or browser identity does not automatically receive application administrator access: **Reset shared dataset** is enabled only for the registered administrator. Internet access is needed for database connections, map tiles and configured AI requests.

The AI area review reads `GEMINI_API_KEY` (and optional `GEMINI_MODEL`, default `gemini-3.6-flash`) on the server only; never give either a `NEXT_PUBLIC_` prefix. Restart `npm run dev` after changing either. Without a key the app still runs and **Generate AI Review** reports that AI review is not configured. Optional budget variables (`GEMINI_REVIEW_MAX_PER_MINUTE`, `GEMINI_REVIEW_MAX_PER_DAY`, `GEMINI_REVIEW_MAX_TOKENS_PER_DAY`, `GEMINI_REVIEW_MAX_OUTPUT_TOKENS`, `GEMINI_REVIEW_CACHE_MINUTES`, `GEMINI_THINKING_LEVEL`, and for follow-ups `GEMINI_CHAT_MAX_TURNS`, `GEMINI_CHAT_MAX_OUTPUT_TOKENS`) are listed in `frontend/.env.example`. For testing error states in development only, set `GEMINI_REVIEW_SIMULATE_ERROR` to `rate_limit`, `api_error`, `timeout`, or `invalid_response` (ignored in production builds). To test the review, follow-ups and **Ask AI** assistant without Gemini (for example after the free-tier quota runs out), set `GEMINI_MOCK=1`: answers are canned text built from the snapshot, labeled "mock (no Gemini call)", with no API key, Gemini call or budget use (development only; ignored in production builds). Free-tier Gemini prompts may be used by Google to improve its products, so send only synthetic scenario data. Never commit tokens, API keys, or real customer information.

Noto Sans is fetched at build time by `next/font/google` and served with the app; the first uncached build needs access to Google Fonts. No browser-time Google Fonts request is required.

### Try the current UI

1. Open [the local demo](http://localhost:3000/demo) for bundled dummy data, or [the main page](http://localhost:3000) for the configured data source. With `DATA_SOURCE=database`, the main page requires an enrolled employee identity.
2. Click a red information icon for a centered area popup containing the local map, severity, summary preview, and evidence. Use **Take action** to open the notification popup on the same dashboard.
3. Review/edit and approve the initial notification. Simulate a **safe** reply for a household with no recorded assistance need; it disappears from the map and queue. Leave another household unanswered, then close the popup.
4. Use **Skip 2 hours → After impact** on the dashboard. The After tab opens with unanswered households retained. Open the area alert again and choose **Take action** to send the second notification; earlier safe responders are excluded.
5. Simulate **need help** to automatically assign an available matching simulated response unit on either dashboard. To review unanswered households, close the popup and use **Skip 30 min → Check responses**, then reopen the area and approve a response unit for overdue silence. Assigned teams become unavailable to other cases; help requests without a matching unit remain visible in the help queue.
6. On the main database-backed dashboard or the local demo, use **Skip 30 min → Complete rescues** to finish active dashboard rescues and release their units. Completed households leave the unresolved queue. Freed units automatically serve waiting matching help requests; otherwise they become available for another assignment. Unanswered cases still require approval after their reply deadline. Repeat the completion skip for later rescues.

The local fixtures contain six fictional areas; the shared Demo fixture contains 56 disaster areas. The clock advances all areas together, and each follow-up notification has its own 30-minute deadline. Local scenarios reset on reload; shared notices, replies, assignments and completion history persist. Safe confirmations and completed rescues leave the unresolved queue, while recorded assistance history is retained. Reset is local in the demo and available to enrolled employees and administrators in shared mode. AI reviews remain on-demand suggestions; neither mode delivers real messages or dispatches real units.

The latest frontend passes TypeScript, the production build and all 51 scenario, subscription-adapter and AI contract/budget tests. Interactive visual, responsive and keyboard acceptance of the latest shared flow remains pending.

### Available commands

Run these commands from `frontend/`. From the repository root, use `npm --prefix frontend run dev` (or the corresponding script).

| Command | Purpose | Current verification |
| --- | --- | --- |
| `npm run dev` | Start local development | Dashboard browser smoke check passed (user-reported) |
| `npm run lint` | Run ESLint | Targeted checks on changed frontend files pass; full lint was not rerun for v1.32 |
| `npm run typecheck` | Generate route types and check TypeScript | Passed |
| `npm run build` | Create a production build with Webpack | Passed; includes main, demo, local demo, outreach, response and AI routes |
| `npm run test:scenario` | Verify local transitions, shared-state adapters, dialogs and AI contracts | All 51 tests pass |
| `npm start` | Serve a successful production build | Runtime smoke check pending |

### Repository structure

```text
frontend/
  src/
    app/
      layout.tsx      # Shared layout and project metadata
      page.tsx        # Connected dashboard; setup instructions without configuration
      demo/page.tsx   # Connected popup dashboard using configured backend
      demo/local/page.tsx # Isolated browser-local rehearsal
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
