# RiskReach — HackUTD 2026

> Working project name. A multi-hazard disaster preparedness and response dashboard for State Farm employees, powered by SpacetimeDB.

## Project overview

RiskReach helps employees answer four questions: **Where could a disaster cause harm? Who may be affected? What should we prepare? What assistance is still needed afterward?**

We are building this for a 24-hour hackathon, combining State Farm's **“The Worst Day, at Scale”** catastrophe-response challenge with Spacetime's main track. The primary user is a State Farm employee coordinating preparedness, outreach, and assistance across an affected region.

The dashboard connects a map of disaster impact with household information, help requests, response teams, and a shared activity history. The project models a hypothetical nationwide catastrophe-response operation for State Farm employees; it does not claim to reproduce confidential State Farm procedures or systems. State Farm customers can receive proactive outreach because the organization already has a contact relationship with them. Non-customers can also request or receive help. Assistance priority should reflect urgency and need; customer status provides outreach context rather than overriding emergency need.

This is a hackathon prototype using synthetic households and simulated response operations. Actual State Farm customer records, internal systems, and operational access are not assumed.

## Before and after a disaster

### Before: prepare and reach people early

- Display forecasted or scenario-based impact areas for tornadoes, earthquakes, hurricanes, wildfires, blizzards, and floods, including severity, source, and update time.
- Identify potentially affected households and customers inside those areas.
- Flag people who may need extra assistance using simulated vulnerability information.
- Recommend hazard-appropriate preparation tasks: contact households, share preparedness information, identify shelter options, and position teams or supplies.
- Track outreach so employees can see who was contacted, who confirmed safety, and who remains unaccounted for.

### After: coordinate assistance and follow through

- Show reported impact, damage, household check-ins, and help requests.
- Rank unresolved needs and flag high-risk households that have not responded.
- Recommend available teams based on urgency, proximity, capacity, and resources.
- Allow an employee to assign a team, update progress, and record assistance.
- Coordinate needs such as food, water, temporary shelter, welfare checks, evacuation assistance, fire/smoke support, winter-weather support, or referrals. Track claims support as a separate follow-up need.
- Keep all employee dashboards synchronized as assignments and statuses change.

### What “prediction” means in this project

We will estimate potential exposure from available forecasts, hazard data, or clearly labeled demonstration scenarios. We are not training a new disaster-prediction model during the hackathon.

The supported disaster types are **tornadoes, earthquakes, hurricanes, wildfires, blizzards, and floods**. These hazards need different data, impact layers, preparedness actions, and response workflows. Earthquake features should use hazard scenarios or post-detection information rather than claim reliable advance prediction. For the MVP, use a **nationwide U.S. multi-hazard scenario** with a national overview and seeded high-risk neighborhoods/areas for all six hazard types. The full preparation-to-response workflow can be demonstrated end-to-end on one selected hotspot while the other hazards remain visible as supported scenario layers.

Every impact layer should show whether it is a forecast, a report, or a simulation. Recommendations support employee decisions and require human review before dispatch or outreach.

## Hackathon scope

### Required MVP

| Feature | Required behavior | Completion evidence |
| --- | --- | --- |
| Disaster map | Display a pannable and zoomable nationwide U.S. map with hazard-specific impact zones, households, and response teams | Selecting a neighborhood/zone shows its disaster type, severity, source, and affected households |
| Before/after views | Switch between preparedness and response information for the same scenario | Each view exposes the relevant needs and actions |
| Household details | Show customer/community status, check-in status, needs, and last contact | An employee can update a household and see the result |
| Prioritization | Rank unresolved cases and explain the contributing factors | Increased risk or a new urgent request changes the queue |
| Preparedness actions | Suggest and track outreach and preparation tasks | An employee can record a completed outreach action |
| Post-disaster assistance | Record help requests and suggest a suitable available team | A request can move from open to assigned to resolved |
| Dispatch | Assign a team and show estimated distance/travel time | The team and request both reflect the assignment |
| Shared live state | Store core operational data and changes in SpacetimeDB | Two browser sessions show the same updates without refresh |
| Overlooked cases | Flag unresolved, high-risk households overdue for contact | A seeded example appears and clears after an appropriate update |
| Demo scenario | Seed/reset fictional multi-hazard data and escalate one or more disaster severities | The complete judging story can be repeated reliably |

### Stretch goals — only after the MVP works

- Live weather or hazard feed ingestion with a documented fallback for each supported disaster type.
- AI-generated summaries of prioritized needs and recommended actions.
- Real road routing, travel times, and road-closure awareness.
- Public help-request form and mobile responder view.
- Shelter/resource inventory, damage photos, and claims follow-up.
- More detailed hazard-specific models, cross-hazard cascading impacts, and additional nationwide scenarios.
- Actual notification integrations; the MVP only records or simulates outreach.

## Technical design

**Confirmed stack: Next.js + TypeScript + SpacetimeDB.** The Leaflet/OpenStreetMap dashboard and operational backend are integrated through an optional read-only subscription connection. Demo mode remains available without configuration. See [backend setup and contract](backend/README.md) and [map integration handoff](frontend/src/components/map/README.md). Operational UI controls and final decision logic remain pending.

| Layer | Proposed approach | Responsibility |
| --- | --- | --- |
| Employee interface | Next.js + TypeScript | Map, preparedness/response views, household panel, priority queue, assignments |
| Map | Leaflet 1.9.4 + OpenStreetMap raster tiles (initial UI implementation) | Nationwide overview, pan/zoom navigation, hazard-specific polygons, neighborhood/household/team markers, selection, assignment lines |
| Core backend | SpacetimeDB module written in TypeScript | Tables, validated changes, assignments, prioritization, activity history |
| Live synchronization | Generated client bindings and SpacetimeDB subscriptions | Share operational updates between employee sessions |
| Scenario data | Seeded fictional households, teams, and hazard zones distributed across the U.S., with concentrated high-risk neighborhoods for all six disaster types | Repeatable demo independent of outside feeds |
| Optional external services | Forecast/hazard providers, routing provider, or AI provider | Integrate only after the core workflow is stable |

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

- Household check-in: `unknown`, `safe`, `needs_help`, `urgent`.
- Request: `open`, `assigned`, `in_progress`, `resolved`.
- Team: `available`, `assigned`, `responding`, `unavailable`.
- Assignment: `assigned`, `in_progress`, `completed`, `cancelled`.
- Preparedness task: `pending`, `in_progress`, `completed`.

### Prioritization and recommendations

Start with a transparent rules-based ranking. Consider disaster type, explicit urgency, zone severity, vulnerability flags, and time without contact. Display the reasons next to each case. Agree on weights and an overdue-contact threshold, and label them as demo assumptions. Keep hazard-specific modifiers explainable—for example, wildfire smoke exposure, hurricane evacuation need, earthquake infrastructure disruption, tornado shelter need, blizzard isolation, or flood depth.

Recommend teams from those with suitable capabilities and remaining capacity, then compare proximity. For the initial demo, straight-line distance and an assumed speed can produce an **approximate** travel time; label it clearly. Do not present that line as a verified safe road route. Prevent duplicate active assignments and reject attempts to assign an unavailable team. Assignment completion or cancellation must update team availability consistently.

An optional AI feature can summarize structured evidence and suggest next steps for employee review. The MVP ranking does not require an LLM, and a rules-based score should not be described as a trained predictive model.

## Four-person work split

Aalvee Ahtav owns Person 1's map and interface work. Josh owns Person 2’s backend work; other role assignments remain pending. Each person owns one workstream and helps with integration.

| Owner | Workstream | Concrete deliverables | Dependencies and handoff |
| --- | --- | --- | --- |
| Person 1 — Aalvee Ahtav | Map and interface | App shell, nationwide pannable/zoomable map, hazard-layer controls, before/after toggle, zone/neighborhood selection, household detail panel, loading/error states | Agree on hazard-layer and geographic contracts with Persons 2 and 3; consume shared data and actions through Person 4's integration |
| Person 2 — Josh | Spacetime backend | Project/module setup, multi-hazard schema, reducers, validation, subscriptions support, seed/reset behavior, activity events, and concurrent updates | Publish initial schema and generate bindings early; coordinate disaster types, status enums, and validation rules with everyone |
| Person 3 — name TBD | Disaster data and decision logic | Fictional nationwide datasets for tornadoes, earthquakes, hurricanes, wildfires, blizzards, and floods; hazard geometry, household exposure, priority rules/reasons, hazard-specific preparedness suggestions, team capability matching, and approximate ETA logic | Agree on geographic and hazard contracts with Persons 1 and 2; hand tested logic/data to Person 2 for authoritative backend use |
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

**Current checkpoint: v1.7 — 2026-11-07.** Integrated main’s map dashboard with the SpacetimeDB backend, preserving fixture mode and adding an optional read-only subscribed map. Prior fixture-backed browser verification remains recorded below; integrated browser acceptance checks and operational controls remain pending. Seed/reset now use Person 3’s checked-in dataset (60 households, 12 teams, 12 requests); source metadata and simulation labels remain intact. See the changelog for current verification.

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
- [ ] Verify the production build in an environment that permits local worker/server ports. (blocked in agent environment — Turbopack worker-port restriction)
- [x] Render a pannable/zoomable nationwide map, hazard-specific layers, and severity legends. (verified by user)
- [x] Allow employees to filter visible hazards and inspect overlapping disaster zones. (verified by user)
- [x] Render selectable household and response-team markers. (verified by user)
- [x] Build before/after views and household/zone detail panels. (verified by user)
- [x] Display source timestamps and simulation/estimate labels. (verified by user)
- [x] Handle loading, connection errors, empty states, and narrower screens. (verified by user)

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

### Data and decision logic — Person 3

- [x] Create fictional nationwide datasets for tornadoes, earthquakes, hurricanes, wildfires, blizzards, and floods, with national context and concentrated high-risk neighborhoods/areas. Karthik Bhagavatula supplied the [portable fixtures and generator](data/scenarios/README.md): Small (60 households), Demo (10,000), Stress (100,000); the larger presets cover 50 states and 56 hotspots. Backend seed/reset now load the Small fixture through a validated adapter. Large-preset database loading, aggregation, scoped subscriptions, and performance measurements remain pending.
- [ ] Define hazard-specific impact geometry, source labels, and preparedness recommendations.
- [ ] Determine affected households from the scenario zones.
- [ ] Implement priority scores and readable reasons.
- [ ] Implement overdue-contact/overlooked-case detection.
- [ ] Implement preparedness action suggestions.
- [ ] Implement capability/capacity-aware team recommendations and approximate distance/ETA.
- [ ] Implement reproducible multi-hazard scenario escalation and reset behavior.

### Workflow, integration, and delivery — Person 4

- [x] Connect the map to optional read-only SpacetimeDB subscriptions. (adapter datastore/live SDK checks passed; integrated browser verification pending)
- [ ] Connect operational action controls to the shared SpacetimeDB connection.
- [ ] Build priority queue and overlooked-case filtering.
- [ ] Build preparedness/outreach action controls.
- [ ] Build help-request and assignment controls.
- [ ] Show synchronized assignment progress and activity history.
- [ ] Run the acceptance checks below and record outcomes.
- [ ] Write setup instructions with actual commands, environment variables, and versions.
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
9. **Repeatable demo:** Reset and replay the multi-hazard scenario successfully. Simulated data, approximate travel times, and source timestamps remain clearly labeled.

## Judge demonstration — target 2–3 minutes

1. Show the nationwide pre-disaster map, filter to a supported disaster type, pan/zoom into a high-risk hotspot, and review potentially affected households and hazard-specific preparation tasks.
2. Record proactive outreach and show the change in a second employee session.
3. Escalate one hazard scenario and switch to post-disaster response.
4. Inspect an urgent case, explain its priority, and assign a suitable team.
5. Show live assignment progress, record assistance, and resolve the request.
6. Show an overdue household and a community assistance case to demonstrate follow-through.

Pitch: **RiskReach helps State Farm employees prepare before disasters, coordinate assistance afterward, and track unresolved needs so no one is overlooked.**

## Development and change tracking

### Current checkpoint — v1.7

The dashboard supports fixture mode and an optional employee-authorized SpacetimeDB subscription connection. The adapter converts IDs, GeoJSON coordinates, timestamps, risk levels, requests, tasks, and assignment-aware team display grouping. Backend workflows exist; operational UI controls, final decision rules, and integrated browser acceptance checks remain pending. See [changelog v1.7](changelog.md#version-17--2026-11-07).

### Local setup

Use Node.js `^22.23.4 || ^24.22.1 || >=26.12.1` for the SpacetimeDB SDK; `.nvmrc` selects the Node.js 24 line (install its latest patch). The initial checks ran with Node.js 26.13.0 and npm 11.20.0. This starter uses Next.js 16.4.5, React 19.3.0, TypeScript, Tailwind CSS 4, and ESLint.

```sh
# Optional, if you use nvm:
nvm use

# Enter the frontend and install the locked dependencies:
cd frontend
npm ci

# Start the development server:
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the RiskReach simulation dashboard. If SpacetimeDB later runs locally on port 3000, use `npm run dev -- --port 3001` for Next.js.

With no connection configuration, the page uses fictional UI fixtures. For subscribed operational data, set both `NEXT_PUBLIC_SPACETIMEDB_URI` and `NEXT_PUBLIC_SPACETIMEDB_DATABASE` in `frontend/.env.local`, restart Next.js, and enroll the displayed browser identity using the [backend setup instructions](backend/README.md). Partial configuration shows an error. Internet access is needed for OpenStreetMap tiles; tile failure displays a warning while scenario overlays remain available. Never commit tokens, API keys, or real customer information.

### Available commands

Run these commands from `frontend/`. From the repository root, use `npm --prefix frontend run dev` (or the corresponding script).

| Command | Purpose | Current verification |
| --- | --- | --- |
| `npm run dev` | Start local development | Dashboard browser smoke check passed (user-reported) |
| `npm run lint` | Run ESLint | Passed |
| `npm run typecheck` | Generate route types and check TypeScript | Passed |
| `npm run build` | Create a production build | Starter passed on contributor machine; new dashboard blocked here by Turbopack worker ports |
| `npm start` | Serve a successful production build | Pending production build |

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

`seed_demo` and `reset_demo` import `data/scenarios/nationwide-v1.json` via `backend/src/scenario.ts`, using the existing schema and generated bindings. See the [mapping and limitations](data/scenarios/README.md#backend-integration). Source IDs map to bigint IDs; baseline times shift together to the reducer clock. Source `supply_delivery` becomes demo water assistance, and missing party sizes default to one person. Team capacity retains its numeric limit under the backend’s single-active-assignment rule; source household-case capacity is not a verified people count. No shared database was deployed.

The map remains neighborhood-only: 48 of the 60 imported households are visible; 12 regional households stay available in backend views. Unconfigured UI fixture mode remains separate. Larger presets pass conversion tests but are not a measured database/browser scale claim.
