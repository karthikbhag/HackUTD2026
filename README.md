# StateWatch

**Prepare before disaster. Coordinate after impact. Keep unresolved needs visible.**

StateWatch is a disaster preparedness and response dashboard built for **HackUTD 2026**, inspired by State Farm's "The Worst Day, at Scale" challenge. It helps employees see where hazards overlap households, review who needs contact, and coordinate assistance through a shared operational picture.

The prototype covers **tornadoes, earthquakes, hurricanes, wildfires, blizzards, and floods**. Its national demonstration dataset contains **10,000 synthetic households, 56 disaster areas, and 220 response teams**.

[Quick start](#quick-start) | [Shared database](#use-the-shared-10000-household-database) | [Local database](#run-your-own-local-database) | [Demo walkthrough](#demo-walkthrough) | [Tech stack](#tech-stack) | [Documentation](#documentation)

> **Simulation only.** Households, hazard scenarios, notifications, replies, routing exercises, and rescues are synthetic or simulated. StateWatch does not send real notifications, dispatch emergency responders, predict disasters, or connect to State Farm customer records or internal systems.

## What StateWatch does

- **Map exposure:** Explore nationwide hotspots with clustered household markers, hazard filters, and circular High/Medium/Low risk bands. Geographic membership and hazard exposure are distinct.
- **Prepare by event:** Review an area's evidence and approve risk-specific preparation messages. Simulated safe confirmations remain in the shared history.
- **Follow scheduled impacts:** Upcoming impacts are grouped by hazard and U.S. region. The clock advances to the next scheduled impact; Prep and After views separate pending and impacted events on the same map.
- **Follow up:** Send post-impact check-ins and track each area's own 30-minute response deadline. Silence means unknown safety, not confirmed injury.
- **Coordinate assistance:** Explicit needs-help replies automatically reserve a compatible available unit. Unmatched requests stay queued. Overdue unanswered follow-ups require employee approval for assistance.
- **Complete rescues:** Complete current dashboard rescues, release teams, and retain history. Available units can then serve queued help requests.
- **Explain decisions:** Exposure, priority scores, overdue-contact concerns, and team recommendations use deterministic rules with readable reasons. Customer status does not determine assistance priority.
- **Ask AI:** Generate an area review, ask follow-up questions, or use the map-wide assistant. AI explains supplied evidence; it does not approve outreach, dispatch teams, or change operational records.

Under the dashboard's simulation policy, earlier safe confirmations exclude households from repeat outreach and response approval. This is not a new observation of post-impact safety, and it does not erase older assistance records.

## Tech stack

| Layer | Technology | Role |
| --- | --- | --- |
| Web application | Next.js 16.4.5, React 19.3.0, TypeScript | Dashboard, dialogs, application routes, and server-side AI endpoints |
| Styling | Tailwind CSS 4 and application CSS | Responsive interface and map/workflow presentation |
| Operational map | Leaflet, OpenStreetMap, Leaflet.markercluster | Hazard overlays, household clustering, and team locations |
| Shared backend | SpacetimeDB 2.14.1, TypeScript module | Persistent tables, employee-authorized views, transactional reducers, and live subscriptions |
| AI | Google Gemini through `@google/genai` | On-demand reviews and grounded conversation through server-only API routes |
| Optional routing | Node.js worker, Google Routes, Google Maps JavaScript API | Simulated team routes, travel estimates, stop lists, and playback |
| Scenario tooling | Python 3.11+, JSON fixtures | Repeatable generation and validation of Small, Demo, and Stress datasets |
| Verification | Vitest, Node.js test runner, TypeScript, ESLint, Python unittest | Backend rules, frontend workflows, contracts, and fixture checks |

The browser reads authorized SpacetimeDB views and sends changes through reducers. Reducers validate and commit shared operations; subscriptions update connected clients. Next.js API routes handle Gemini requests separately. A dedicated routing worker handles the optional route-planning simulation.

Generated client bindings must match the deployed backend. Updating source files or pulling a branch does not publish a database update.

## Quick start

### Requirements

- **Node.js:** use a supported Node 24 release, **24.22.1 or newer within the 24.x line**. `.nvmrc` selects Node 24; other versions must satisfy the `engines` range in the package files.
- **npm**, included with Node.js.
- **SpacetimeDB CLI 2.14.1** for publishing, generating bindings, database administration, or running a local server. The bundled web demo does not require it.
- **Python 3.11+** only for scenario generation and validation. There are no third-party Python dependencies.

Run commands from the repository root unless stated otherwise. In Windows PowerShell, use `npm.cmd` if execution policy blocks `npm`.

### Run the web demo

```sh
# If you use nvm:
nvm use

npm --prefix frontend ci
npm --prefix frontend run dev
```

Open **http://localhost:3000/demo**. This always uses the small bundled browser-local rehearsal; no database or API key is required. Map tiles require internet access. Local workflow changes clear on reload.

For first-time configuration, copy `frontend/.env.example` to `frontend/.env.local`. If that file already exists, edit it instead of overwriting existing credentials. Restart Next.js after changing environment settings.

| Route | Purpose | Data source |
| --- | --- | --- |
| `/` | Main preparedness and response dashboard | Shared database when `DATA_SOURCE=database`; bundled local fixtures otherwise |
| `/demo` | Small, repeatable UI demonstration | Always local fixtures |
| `/demo/local` | Explicit local rehearsal | Always local fixtures |
| `/outreach` | Separate outreach workspace | Configured data source; `?mode=demo` selects fixtures |
| `/response` | Response routing and simulation workspace | Requires database mode and connection settings |

## Use the shared 10,000-household database

Set these values in **`frontend/.env.local`**:

```dotenv
DATA_SOURCE=database
NEXT_PUBLIC_SPACETIMEDB_URI=https://maincloud.spacetimedb.com
NEXT_PUBLIC_SPACETIMEDB_DATABASE=statewatch
```

Start or restart the frontend, then open **http://localhost:3000/**. Opening `/demo` still shows the small local rehearsal. `DATA_SOURCE` is required: setting only the database URL and name does not switch this branch out of local mode.

The shared database is hosted on Maincloud. Teammates connecting to it do not need to start a database server on their own machines, copy the dataset, or seed it again.

### Employee enrollment

Connected data and actions require an enrolled browser identity. The publishing identity starts as an administrator; administrators grant or revoke employee access. A CLI login does not automatically enroll a browser.

1. Open `/response` and expand **Connection details** to find the browser's public identity.
2. Ask an existing database administrator to enroll that identity using `set_employee` for the selected database and server.
3. Reload the dashboard. Different browser profiles or cleared site storage may create a new identity that needs enrollment.

For the shared database, an administrator can use:

```sh
# Bash / zsh: replace BROWSER_IDENTITY_HEX with the public identity.
spacetime call statewatch set_employee '"BROWSER_IDENTITY_HEX"' true --server https://maincloud.spacetimedb.com --no-config
```

Windows PowerShell equivalent, preserving the JSON string argument:

```powershell
spacetime --% call statewatch set_employee "\"BROWSER_IDENTITY_HEX\"" true --server https://maincloud.spacetimedb.com --no-config
```

Share only the public identity, never browser tokens, worker token files, or login credentials.

### Reset after a demonstration

**Reset shared dataset** is available to enrolled employees and administrators and requires confirmation. It replaces operational data with the fixture bundled in the published backend, resets the scenario clock, and preserves employee access and durable activity history. It affects everyone using that database.

**Reset demo** affects only the browser-local rehearsal. Restarting the web server or refreshing a connected page does not reset the shared database.

## Run your own local database

Use this path for isolated development or testing. The example creates a separate **10,000-household Demo database** named `statewatch-local`; it does not modify the shared `statewatch` database.

Install backend dependencies and sign in to the CLI:

```sh
npm --prefix backend ci
spacetime login
```

In one terminal, start a persistent local server and leave it running:

```sh
spacetime start --listen-addr 127.0.0.1:3100 --data-dir .tmp/statewatch-local-data --non-interactive
```

In a second terminal, select Python explicitly if you are using Windows:

```powershell
$env:PYTHON = (Get-Command python.exe).Source
```

In your second terminal, generate the dataset, build the matching module, publish, and seed the new database. The commands below use `python`; use `python3` instead if that is your installed command. On other platforms, the build script defaults to `python3`; set `PYTHON` if needed.

```sh
python data/scenarios/generate.py --preset demo --seed 2026 --output data/scenarios/generated/demo.json
npm --prefix backend run build:scenario -- --preset demo
spacetime publish statewatch-local --server http://127.0.0.1:3100 --js-path backend/.test-output/demo/bundle.js --delete-data=never --no-config --yes
npm --prefix backend run seed -- --database statewatch-local --server http://127.0.0.1:3100
```

Set `frontend/.env.local` to:

```dotenv
DATA_SOURCE=database
NEXT_PUBLIC_SPACETIMEDB_URI=http://127.0.0.1:3100
NEXT_PUBLIC_SPACETIMEDB_DATABASE=statewatch-local
```

Restart Next.js, then enroll your browser as described above, replacing the database name with `statewatch-local` and server with `http://127.0.0.1:3100`.

Seeding is for a new, empty database. Reuse the same data directory when restarting the local server. For intentional local resets, the repository provides `npm --prefix backend run reseed -- --database statewatch-local`.

### Dataset sizes and backend updates

| Dataset | Households | Use |
| --- | ---: | --- |
| Bundled frontend demo | 18 | Small UI rehearsal; separate from backend fixtures |
| Small backend fixture | 60 | Fast module development |
| Demo backend fixture | 10,000 | National demonstration |
| Stress backend fixture | 100,000 | Performance experiments |

Ordinary backend builds use **Small**, not Demo. A reset restores the dataset bundled in the deployed module. Build with `--preset demo` when updating a 10,000-household deployment, and do not seed or reset an existing shared database as part of a code update.

After schema, view, or reducer changes, regenerate the frontend bindings together with the matching backend deployment:

```sh
npm --prefix backend run generate
```

See the [scenario runbook](backend/SCENARIOS.md) and [scheduled impact contract](backend/SCHEDULED_IMPACTS.md) before publishing changes to a shared instance.

## Demo walkthrough

Use `/demo` for an isolated rehearsal, or `/` in database mode for persisted shared state.

1. **Review the map.** Inspect High/Medium/Low risk bands, hazard filters, area evidence, and the **Upcoming impacts** list grouped by hazard and region.
2. **Prepare a pending area.** Open its review, select **Take action**, review the risk-specific messages, and approve a preparation notice. Simulate a safe reply for one household.
3. **Advance to the next impact.** Use the clock's next-impact action. Only events whose scheduled time has arrived move to After; other events remain available in Prep. Changing filters does not advance time.
4. **Send a follow-up.** Open an impacted area and approve its second notice. Each area's reply deadline starts when its notice is sent. Earlier safe responders are excluded under the demo policy.
5. **Coordinate help.** Simulate a needs-help reply to reserve a compatible unit automatically. If none is free, the request stays queued. Advance follow-up time and approve assistance for overdue unanswered households.
6. **Complete and replay.** Use the rescue-completion skip to finish active dashboard rescues and release teams. Newly assigned rescues finish on a later skip. Reset locally, or confirm a shared reset when the group is ready to restart.

Impact times are synthetic rehearsal timings. Clock skips can also transition other events due within the advanced time window.

## Optional AI and routing

### Gemini reviews and chat

Add a server-only key to `frontend/.env.local` and restart Next.js:

```dotenv
GEMINI_API_KEY=your_key_here
# Optional model override; the application's default is gemini-3.6-flash.
GEMINI_MODEL=
```

The dashboard works without a key; AI actions report that generation is not configured. For development without external Gemini calls, use `GEMINI_MOCK=1`. Mock mode is labeled and ignored in production builds.

Requests use compact scenario evidence. Cache, request/token budgets, and follow-up limits are configurable in [the environment example](frontend/.env.example). AI output remains a suggestion for employee review. Keep keys server-side and use only synthetic data.

### Response routing workspace

The separate `/response` workspace requires a matching database deployment, an enrolled employee, a running routing worker, and an authorized worker identity.

```sh
npm --prefix routing-worker start
```

The worker loads `frontend/.env.local` and prints its public identity. An administrator authorizes it using `set_routing_worker`; this is separate from browser employee enrollment.

- **Offline planning:** set `ROUTING_PROVIDER=fixture` in `frontend/.env.local` for simulated straight-line travel, without Google Routes calls.
- **Google routing:** configure server-only `GOOGLE_MAPS_API_KEY` and the separately restricted `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` for the browser map. Set `NEXT_PUBLIC_ROUTING_WORKER_URL` if the worker is not on `http://localhost:3201`.

This workspace is a separate simulation, not live GPS tracking or production emergency routing. See [routing setup and enrollment](backend/SHARED_WORKFLOW.md#response-routing-demo) and the [routing implementation plan](RESPONSE_ROUTING_PLAN.md).

## Development and production

```sh
# Frontend verification
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run test:scenario

# Backend verification
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run build

# Scenario validation
python -m unittest discover -s data/scenarios -p "test_*.py"

# Production web application
npm --prefix frontend run build
npm --prefix frontend start
```

The frontend production build uses Webpack. Configure environment values before building, particularly browser-visible `NEXT_PUBLIC_` settings. The first uncached build fetches Noto Sans through `next/font/google` and needs access to Google Fonts. Keep Gemini and routing-worker services configured separately from the browser application.

### Troubleshooting

| Symptom | Check |
| --- | --- |
| Only 18 households | Open `/`, set `DATA_SOURCE=database`, and restart Next.js. `/demo` always stays local. |
| Connected page has no records | Check the endpoint, database name, employee enrollment, and whether a new database has been seeded. |
| Binary decoding `RangeError` | Client bindings and deployed backend disagree. Deploy matching contracts and regenerate bindings, then reload. |
| Reset is unavailable | The browser identity must be enrolled. All enrolled employees and admins have shared-reset access on the current backend. |
| `EADDRINUSE` on port 3000 | A web server is already running. Reuse it, stop it before restarting, or choose another Next.js port. Keep SpacetimeDB on 3100. |
| TypeScript/Node or Tailwind startup errors | Check `node -v` against the supported engine range. Restart the terminal/server after selecting the supported runtime. |
| Python executable not found | Set `PYTHON` to your interpreter before running `build:scenario`. |

## Repository layout

```text
frontend/              Next.js pages, map components, AI routes, and generated bindings
backend/               SpacetimeDB schema, reducers, decision logic, scripts, and tests
routing-worker/        Optional route planning and simulated team playback
shared/                Shared validated routing configuration
data/scenarios/        Synthetic fixtures, generator, validator, and dataset docs
PROJECT_GUIDE.md       Detailed design history, ownership, and acceptance tracker
changelog.md           Versioned implementation and verification history
```

## Team

- **Aalvee Ahtav** - Map, interface, and frontend demo.
- **Josh Sebastian** - SpacetimeDB backend and response routing.
- **Karthik Bhagavatula** - Disaster data and decision logic.
- **Tien Phan** - Shared workflow, AI, integration, and delivery.

## Documentation

- [Project guide](PROJECT_GUIDE.md): design context, team handoffs, and detailed acceptance tracking.
- [Backend setup and contract](backend/README.md): tables, reducers, authorization, and module development.
- [Scheduled impacts](backend/SCHEDULED_IMPACTS.md): regional event timing, clock behavior, and deployment compatibility.
- [Hazard data and risk bands](backend/HAZARD_FEED.md): normalized event updates, modeling assumptions, and simulated feeds.
- [Scenario datasets](data/scenarios/README.md) and [scenario runbook](backend/SCENARIOS.md): generation, loading, and size verification.
- [Shared workflow](backend/SHARED_WORKFLOW.md) and [popup workflow](backend/POPUP_WORKFLOW.md): deeper integration notes; older checkpoint descriptions are historical where they differ from the current routes and schedule above.
- [Changelog](changelog.md): delivered changes and recorded checks.

StateWatch remains a hackathon prototype. Real hazard-provider integration, notification delivery, production identity management, and operational validation are future work. See the project guide and changelog for the distinction between implemented behavior, automated verification, and remaining browser/routing acceptance.
