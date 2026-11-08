# RiskReach SpacetimeDB backend

> Current v1.21 integration: [shared popup workflow](POPUP_WORKFLOW.md). Main `/` and `/demo` now persist/share notifications, replies, clock and response approvals; `/demo/local` is isolated. The current Turbopack production build passes. Historical pending-integration notes below are superseded by this checkpoint; interactive browser acceptance remains separate.

Person 2 owns this TypeScript module. It implements the operational backend for the nationwide **six-hazard MVP** in the root README. The default Person 3 dataset covers flood, tornado, earthquake, hurricane, wildfire, and blizzard hotspots; all data and operations are synthetic.

## Large fixture inspection

See [the local scenario runbook](SCENARIOS.md) for isolated Small/Demo/Stress builds, atomic seeding, startup, enrollment, count verification and browser checks. v3 impact layers now persist and subscribe separately from geographic context. Normal builds use modern schema-v3 Small with ten impacts. The [connected main workflow](SHARED_WORKFLOW.md) uses a separate persistent local Demo database with authoritative summaries and workflow controls.

## Requirements and local setup

Use SpacetimeDB CLI **2.14.1** and SDK **2.14.1**. The SDK requires Node `^22.23.4 || ^24.22.1 || >=26.12.1`; the root `.nvmrc` selects the Node 24 line, so install its latest patch. Current verification uses supported Node 24.22.1 and Python 3.12.

From the repository root:

```sh
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run build
npm --prefix backend run generate
```

Start the database in a separate terminal:

```sh
spacetime start --listen-addr 127.0.0.1:3100
```

Publish to your local database, then seed it using the same CLI identity:

```sh
spacetime publish riskreach-local --server http://127.0.0.1:3100 --module-path backend --yes
spacetime call riskreach-local seed_demo --server http://127.0.0.1:3100
```

No cloud deployment or external API keys are required. `spacetime.json` points at `backend/` and defaults to local; commands explicitly use port 3100 to avoid Next.js on 3000. Start Next.js with `npm --prefix frontend run dev`. The map supports shared subscriptions: set `NEXT_PUBLIC_SPACETIMEDB_URI=http://127.0.0.1:3100` and `NEXT_PUBLIC_SPACETIMEDB_DATABASE=riskreach-local` in `frontend/.env.local`, restart Next.js, then enroll the browser identity displayed below the map. With neither variable set the main page reports setup instructions; `/demo` remains the browser-local rehearsal. See the [map handoff](../frontend/src/components/map/README.md). Connected workflow controls are implemented; see [current setup and enrollment](SHARED_WORKFLOW.md).

## Seed another local database

Publish the module once to the target database, then seed it using the publisher's CLI identity:

```sh
spacetime publish riskreach-other-local --server http://127.0.0.1:3100 --module-path backend --yes
npm --prefix backend run seed -- --database riskreach-other-local
```

To replace that database's operational data with its bundled fixture:

```sh
npm --prefix backend run reseed -- --database riskreach-other-local
```

Reseeding preserves memberships and durable activity history. Both commands require an explicit database name, default to port 3100, and accept `--server http://127.0.0.1:PORT` for another local instance. They use the fixture bundled in the published module (Small by default); they do not copy live data from another database. Publish a selected scenario build first for Demo/Stress fixtures as described in [SCENARIOS.md](SCENARIOS.md).

## Contract and client handoff

Generated bindings are committed under `frontend/src/module_bindings/`; regenerate after changing the schema or reducer arguments. The frontend SDK is pinned to match. `ConnectedDashboard` owns the shared browser connection and subscription lifecycle; `ConnectedWorkspace` reuses it for authoritative decisions and operational actions.

- Import `DbConnection` and `tables` from `@/module_bindings`.
- Connect with `.withUri('http://127.0.0.1:3100').withDatabaseName('riskreach-local')`. Persist each browser's returned identity token locally; never commit or share it.
- Subscribe explicitly to `tables.disasters`, `tables.zones`, `tables.households`, `tables.requests`, `tables.teams`, `tables.assignments`, `tables.tasks`, and `tables.activities` as needed. Wait for subscription application before rendering data as ready.
- Reads come from subscriptions. Reducers report success/failure, not row results. Handle rejected reducer promises in the UI.
- All tables are private. An unapproved identity sees empty views and cannot mutate data. The initial publisher becomes administrator in `init`. The administrator enrolls each employee identity with `set_employee`; clients cannot enroll themselves. Revocation removes subscribed rows.

Authorize a browser identity (hex identity is public; its token is secret):

```sh
spacetime call riskreach-local set_employee '"EMPLOYEE_IDENTITY_HEX"' true --server http://127.0.0.1:3100
```

Wire/SQL names use snake_case; generated TypeScript uses camelCase. IDs are `u64`/`bigint`. Never assume auto-generated request, task, assignment, or event IDs are sequential or repeat after reset. Timestamps are SDK `Timestamp` values, not ISO strings. Optional fields use `undefined`.

The schema includes all eight README entities plus a private employee allowlist. Zones carry `disasterId`, `level` (`national`, `metro`, `neighborhood`), optional `parentZoneId`, and `boundary` as a GeoJSON Polygon JSON string with `[longitude, latitude]` coordinates. The imported fixture has metro → neighborhood hierarchies; national framing stays source metadata rather than an impact polygon. Household `zoneId` identifies its neighborhood or metro; follow zone → disaster for hazard filters. The current contract assigns one zone per household; cross-hazard exposure is retained separately as layer IDs in decision summaries and full evidence in authorized selected-household views.

Status values follow the root README. Risk and urgency are demo scales of 1–5. Requests add `people` (positive integer); team `capacity` is the maximum people supported by one assignment. One team can have only one active assignment, even when that assignment uses less than its capacity. Teams retain their source `available`/`unavailable` status.

Supported request needs: `food`, `water`, `shelter`, `welfare_check`, `evacuation`, `claims_support`, `fire_smoke_support`, `winter_weather_support`. Capabilities match these exact strings. Seeded teams cover their hotspot's needs; unsupported teams are rejected. Customer status never affects eligibility.

Supported task actions: `outreach`, `preparedness_information`, `shelter_options`, `position_supplies`, `shelter_in_place`, `infrastructure_check`, `evacuation_preparation`, `smoke_protection`, `winter_preparation`, `flood_preparation`. Approved recommendation tasks store explicit scenario-run/recommendation identity; legacy generic tasks have empty recommendation IDs.

## Reducers and transitions

- `updateCheckIn({ householdId, status })`: changes safety/check-in status only. It does not resolve requests or imply contact.
- `recordOutreach({ householdId })`: records simulated contact and updates `lastContactAt`.
- `createTask({ zoneId, householdId?, actionType })`: validates the household belongs to the selected zone.
- `updateTask({ taskId, status })`: pending → in_progress/completed; in_progress → completed. Completing household outreach also records contact.
- `createRequest({ householdId, needType, urgency, people })`: creates an open request after validation.
- `resolveRequest({ requestId })`: resolves only an open, unassigned request. Assigned requests resolve through assignment completion.
- `assignTeam({ requestId, teamId })`: employee-confirmed dispatch; validates open request, available team, capability, capacity, and absence of conflicting assignments. Creates assignment and updates request/team in one transaction.
- `updateAssignment({ assignmentId, status })`: assigned → in_progress/completed/cancelled; in_progress → completed/cancelled. Completion resolves the request; cancellation reopens it. Both release the team. Terminal assignments cannot change again.
- `escalateScenario({ disasterId })`: administrator-only, changes just that simulated disaster to response and increases its zones' severity up to 5.
- `seedDemo()`: administrator-only; refuses to overwrite an existing scenario.
- `resetDemo({ confirmation: 'RESET SYNTHETIC DEMO' })`: enrolled employees only; replaces operational fixture data, preserves memberships and durable activity history, and records the reset.
- `setEmployee({ identity, enabled })`: administrator-only membership grant/revoke; cannot alter the administrator.

All operational changes persist an activity event transactionally. Assignment distances are straight-line kilometers using Haversine; ETA is minutes at an assumed 30 km/h. These are approximations, not verified road routes or safe travel advice. No automatic dispatch, messages, or network calls occur in reducers.

## Repeatable verification

All 101 backend tests, nine Python tests and six frontend demo-state tests pass. Typechecks, module builds, frontend lint and production build pass; lint retains one generated-bindings warning. A new two-client live verifier covers the complete shared workflow in a separate disposable database. Browser acceptance still requires enrolled browser sessions. See [current commands/results](SHARED_WORKFLOW.md).

For a disposable local database published by your current CLI identity:

```sh
spacetime publish riskreach-josh-backend-check --server http://127.0.0.1:3100 --module-path backend --yes
spacetime call riskreach-josh-backend-check seed_demo --server http://127.0.0.1:3100
npm --prefix backend run test:live
```

Before subsequent live runs:

```sh
spacetime call riskreach-josh-backend-check reset_demo '"RESET SYNTHETIC DEMO"' --server http://127.0.0.1:3100
npm --prefix backend run test:live
```

The live test creates three temporary client identities, authorizes two through the CLI publisher, verifies map adaptation, synchronization and competing dispatch, completes assistance, checks displayed needs/team grouping, revocation and outsider rejection, and revokes test memberships on exit. It mutates this disposable fixture. Override `SPACETIMEDB_URI` and `SPACETIMEDB_DATABASE` if needed; the script restricts the host to localhost/127.0.0.1.

## Current integration

See [SHARED_WORKFLOW.md](SHARED_WORKFLOW.md) for the restored decision integration, connected scenario desk, enrollment commands, bounded employee-controlled synthetic clock, separate reply rounds, welfare-review requests and verification. Actual AI generation, notification delivery, browser acceptance, sponsor submission materials and team-wide contract sign-off remain separate work.

## Person 3 dataset import

`seedDemo` and `resetDemo` share `src/seed.ts`, which selects bundled `src/default-scenario.json` for ordinary Small builds and the selected v3 fixture for staged builds and validates/converts every row through `src/scenario.ts` before inserts. The default is the Small fixture: six disasters, 12 zones, 60 households, 12 teams, 12 open requests, and 18 synthesized outreach tasks for never-contacted households. No filesystem/network access occurs in reducers. The previous sparse fixture is retained only in a test helper to preserve the existing workflow/map regressions.

See the [source mapping contract](../data/scenarios/README.md#backend-integration) for ID, time, enums, party-size/capacity assumptions and retained metadata. Bindings were regenerated for decisions, recommendation/run fields and shared exercise views/reducers. Newly appended fields have migration defaults. Fixture-specific Demo/Stress bundles now load into separate local test databases. The map retains regional households, preserves their real zone IDs, and groups them under geographic hotspots for inspection. Active regional assignments retain their destination; missing active destinations are omitted. Only unassigned teams use proximity grouping. See [commands and verification](SCENARIOS.md).
