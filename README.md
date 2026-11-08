<div align="center">

# StateWatch

### Prepare before disaster. Coordinate after impact.

A multi-hazard preparedness and response dashboard for State Farm employees.
Built for **HackUTD 2026**, powered by **SpacetimeDB**.

**Next.js · TypeScript · SpacetimeDB · Leaflet · Gemini**

[Our story](#inspiration) · [Quick start](#quick-start) · [Demo walkthrough](#demo-walkthrough) · [Documentation](#documentation) · [Project guide](PROJECT_GUIDE.md)

</div>

---

## Inspiration

When a disaster hits, responders need to understand where the danger is, who may need help, and which resources are available. Inspired by State Farm’s **“The Worst Day, at Scale”** challenge, we built StateWatch to bring that information together. We wanted to help employees prepare before an emergency and keep vulnerable households from being overlooked afterward.

## What it does

StateWatch is a disaster preparedness and response dashboard covering **tornadoes, earthquakes, hurricanes, wildfires, blizzards, and floods**.

Users can explore an interactive U.S. map, filter disaster layers, and inspect affected households, assistance needs, and response teams. Preparedness and response views connect the situation before a disaster with the work needed afterward.

Our backend supports household check-ins, outreach tracking, help requests, and team assignments. We also developed explainable prioritization, overdue-contact detection, and team-matching logic. The prototype uses synthetic households and simulated disaster scenarios.

### Before, during, and after impact

- **Prepare:** Inspect an area’s severity and exposure evidence, request an AI review, and approve risk-specific preparation notifications. Before impact, households can confirm they are safe; unanswered notices remain visible.
- **Check in again:** Advance the simulated clock to after impact and approve a fresh follow-up notification. Households can report safe or need help, and each area gets its own 30-minute reply window. Earlier safe responders are excluded from repeat outreach under the demo policy.
- **Coordinate help:** Explicit help replies automatically reserve compatible available units. If no unit matches, the request stays queued. Overdue unanswered follow-ups require employee approval for a response unit.
- **Close the loop:** Complete active rescues, retain their history, and release units for waiting requests. Shared database records persist across reloads and synchronize between enrolled employees.

Assistance is prioritized by **urgency and need**. Customer status supplies proactive outreach context; non-customers can also receive assistance. Silence means unknown safety, not confirmed injury.

> [!NOTE]
> **Hackathon prototype.** Households, hazard scenarios, notifications, and response operations are synthetic or simulated. The app does not deliver real messages or dispatch real units. It does not use actual State Farm customer records or internal systems.

## How we built it

We built the frontend with **Next.js, React, and TypeScript**, using **Leaflet and OpenStreetMap** for the interactive map.

**SpacetimeDB** powers our backend, storing disaster zones, households, requests, teams, assignments, and activity history. Server-side reducers validate operational changes, while subscriptions keep connected dashboards updated.

We created repeatable scenario datasets across all six disaster types and developed rules that consider urgency, vulnerability, hazard severity, and time since contact. Team recommendations account for capabilities, capacity, availability, and distance.

**Gemini** supports on-demand area reviews, follow-up questions, and a map-wide assistant using compact scenario snapshots. The assistant explains supplied evidence; it cannot send notifications, dispatch teams, change records, or set priority scores. Deterministic decision logic remains independent of AI generation.

## Challenges we ran into

One challenge was turning six different disaster types into a consistent interface without losing the details that make each hazard different. We also had to distinguish geographic context from actual impact areas so the map would communicate exposure clearly.

Keeping operational data consistent was another major challenge. Assigning a team needs to update the request, team availability, and assignment together while preventing conflicting dispatches.

As our datasets grew, we worked on clustering, viewport filtering, and paginated lists to keep the map usable. Coordinating shared schemas and connecting separately developed frontend and backend components also required careful integration.

## Accomplishments that we’re proud of

We’re proud of building a shared foundation for both preparedness and response, with six disaster types represented in one dashboard.

Our backend validates assignments, enforces employee access, and records operational changes in an activity history. We also built repeatable scenarios and automated checks for authorization, workflow transitions, exposure calculations, and recommendation logic.

We made our decision logic explainable: priority scores include contributing reasons, and team recommendations show eligibility factors and clearly labeled travel estimates.

## What we learned

We learned that disaster coordination depends on carefully defined states. A household reporting that it is safe does not necessarily mean its assistance needs are resolved, and an available team may still lack the right capabilities.

We also gained experience with SpacetimeDB subscriptions, transactional backend logic, geographic data, and map performance. Building together reinforced the value of agreeing on data contracts early and testing integration throughout development.

## What’s next for StateWatch

Our next step is completing browser validation and refining the dashboard controls for prioritization, outreach, and dispatch so employees can reliably manage the full workflow from the interface. This includes two-session synchronization, keyboard access, responsive layouts, and the separate Google Maps routing workspace.

From there, we want to integrate live hazard feeds, expand road-aware routing, add shelter and supply information, and support opt-in notification delivery. We also want to validate our prioritization assumptions with emergency-response professionals and expand testing across larger scenarios.

---

## Quick start

### 1. Install and run

Use Node.js `^22.23.4 || ^24.22.1 || >=26.12.1`. The repository's `.nvmrc` selects the Node 24 line.

From the repository root:

```sh
# Optional, if you use nvm
nvm use

npm --prefix frontend ci
npm --prefix frontend run dev
```

> [!TIP]
> If CSS compilation reports `require() of ES Module ... magic-string`, check `node -v`. Stop the dev server, run `nvm use` from the repository root, then restart it. Older Node versions such as 20.11 cannot load the installed Tailwind dependencies.

Open **[localhost:3000/demo](http://localhost:3000/demo)** for the browser-local demo. No database or API key is required; map tiles need internet access. Demo actions reset on reload.

### 2. Choose your workspace

- **`/` — Main dashboard.** Uses SpacetimeDB when `DATA_SOURCE=database`; otherwise uses local dummy data.
- **`/demo` or `/demo/local` — Local rehearsal.** Always uses bundled dummy data and browser-local state.
- **`/outreach` — Outreach workspace.** Uses the configured data source; `?mode=demo` selects fixtures.
- **`/response` — Response routing workspace.** Requires database mode and connection settings. Full Google/browser acceptance remains pending.

### 3. Enable shared state (optional)

Create `frontend/.env.local` using [the environment example](frontend/.env.example). For the existing Maincloud database:

```dotenv
DATA_SOURCE=database
NEXT_PUBLIC_SPACETIMEDB_URI=https://maincloud.spacetimedb.com/
NEXT_PUBLIC_SPACETIMEDB_DATABASE=statewatch
```

Restart Next.js after changing environment variables. Connected mode requires an enrolled employee identity; a CLI login or new browser identity does not grant application access. Follow the [backend setup and enrollment instructions](backend/README.md) to use a separate local database.

Set `DATA_SOURCE=local` to keep the main dashboard on fixtures. The demo routes stay local in either mode.

<details>
<summary><strong>Optional AI configuration</strong></summary>

Add a server-only Gemini key to `frontend/.env.local` and restart the development server:

```dotenv
GEMINI_API_KEY=your_key_here
# Optional; current default:
GEMINI_MODEL=gemini-3.6-flash
```

Without a key, the dashboard still works and AI review reports that it is not configured. For development without Gemini calls or quota use:

```dotenv
GEMINI_MOCK=1
```

Mock answers are labeled and are ignored in production builds. Budget limits, caching, follow-up limits, and development error simulation are documented in [the environment example](frontend/.env.example) and [the project guide](PROJECT_GUIDE.md#local-setup).

Never prefix Gemini credentials with `NEXT_PUBLIC_`, commit secrets, or send real customer information. Free-tier Gemini prompts may be used by Google to improve its products; use only synthetic scenario data.

</details>

## Demo walkthrough

**Target: 2–3 minutes.** Start at `/demo` in **Disaster prep**.

1. **Inspect an area.** Select an area alert, review its evidence, and choose **Take action**.
2. **Send a preparation check-in.** Review the High/Medium/Low messages and approve the initial notification. Simulate one **safe** confirmation; leave another household unanswered.
3. **Advance to impact.** Select **Skip 2 hours → After impact**, reopen the area, and approve the second notification. Earlier safe responders are excluded from repeat outreach.
4. **Respond to help.** Simulate **need help** to reserve an available compatible unit automatically. If none is available, the request remains queued.
5. **Follow up on silence.** Select **Skip 30 min → Check responses**, then approve a response unit for an unanswered household after its area's reply deadline.
6. **Complete and replay.** Select **Skip 30 min → Complete rescues**. Completed households leave the unresolved queue; freed units can serve queued help requests. Newly assigned rescues finish on a later completion skip. Use **Reset demo** to rehearse again.

Use `/` with database mode to demonstrate persisted shared records. Each second notification starts its own 30-minute reply window; switching views or hazard filters does not advance time.

## Technology

- **Interface:** Next.js 16.4.5, React 19.3.0, TypeScript, and Tailwind CSS 4.
- **Mapping:** Leaflet and OpenStreetMap for the operational dashboard; a separate Google Maps response-routing workspace.
- **Backend:** A TypeScript SpacetimeDB module with validated transactional reducers, authorized employee views, and generated client bindings.
- **Live state:** SpacetimeDB subscriptions synchronize committed operational changes.
- **Decision logic:** Explainable rules for exposure, priority, overdue contact, and compatible-team recommendations.
- **AI:** Server-side Gemini routes consume compact scenario snapshots; deterministic prioritization stays independent of the model.
- **Scenarios:** Reproducible Small (60 households), Demo (10,000), and Stress (100,000) fixtures.

<details>
<summary><strong>Repository layout</strong></summary>

```text
frontend/           Next.js application, map UI, and AI API routes
  src/app/          Main, demo, outreach, and response pages
  src/components/   Dashboard, dialogs, and map components
  src/lib/          View models, scenario logic, and AI helpers
  src/module_bindings/  Generated SpacetimeDB client bindings
backend/            SpacetimeDB schema, reducers, scripts, and tests
routing-worker/     Server-side routing worker and simulation
data/scenarios/    Synthetic fixtures, generator, and data documentation
PROJECT_GUIDE.md    Detailed scope, ownership, plans, and acceptance tracker
changelog.md        Versioned changes and recorded verification
```

Backend schema or reducer changes require regenerated client bindings. Keep SpacetimeDB authoritative for shared operations.

</details>

## Development

Run these from the repository root:

```sh
# Frontend checks
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run test:scenario
npm --prefix frontend run build

# Backend dependencies and checks
npm --prefix backend ci
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run build

# Regenerate bindings after backend contract changes
npm --prefix backend run generate
```

The production frontend build uses Webpack. Noto Sans is fetched at build time through `next/font/google`, so the first uncached build needs access to Google Fonts.

### Recorded checkpoint · v1.32

The [v1.32 changelog](changelog.md#version-132--2026-11-08) records passing backend and frontend tests, TypeScript checks, the staged Demo build, and the Webpack production build. **Interactive acceptance of the latest shared workflow remains pending**, including responsive/keyboard checks and two-browser verification. These are recorded results, not checks rerun for this documentation update.

> [!IMPORTANT]
> The deployed `statewatch` backend uses the Demo fixture: **10,000 households, 56 disaster areas, and 220 teams**. Normal source builds use Small. Follow the [fixture publication guidance](backend/POPUP_WORKFLOW.md) before rebuilding or publishing to preserve the intended shared reset dataset.

## Team

- **Aalvee Ahtav** — Map, interface, and frontend demo.
- **Josh Sebastian** — SpacetimeDB backend and response routing.
- **Karthik Bhagavatula** — Disaster data and decision logic.
- **Tien Phan** — Shared workflow, AI, integration, and delivery.

Detailed handoffs, delivered work, and remaining tasks live in the [project guide](PROJECT_GUIDE.md#four-person-work-split).

## Documentation

- [Project guide](PROJECT_GUIDE.md) — Full scope, workflow details, team handoffs, progress tracker, schedule, and acceptance checks.
- [Backend setup and contract](backend/README.md) — Local database setup, enrollment, tables, reducers, and client integration.
- [Shared workflow](backend/SHARED_WORKFLOW.md) · [Popup workflow](backend/POPUP_WORKFLOW.md) — Connected state and notification/response behavior.
- [Scenario data](data/scenarios/README.md) · [Scenario runbook](backend/SCENARIOS.md) — Fixture generation, loading, counts, and verification.
- [Map integration](frontend/src/components/map/README.md) — Frontend map handoff.
- [Response routing plan](RESPONSE_ROUTING_PLAN.md) — Routing architecture, simulation, and acceptance scope.
- [Changelog](changelog.md) — Chronological implementation and verification history.

---

<div align="center">

**Prepare before disasters. Coordinate assistance afterward. Keep unresolved needs visible.**

</div>
