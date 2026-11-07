# RiskReach SpacetimeDB backend

Person 2 owns this TypeScript module. It implements the operational backend for the nationwide **six-hazard MVP** in the root README. The integration fixture covers flood, tornado, earthquake, hurricane, wildfire, and blizzard hotspots; all data and operations are synthetic.

## Requirements and local setup

Use SpacetimeDB CLI **2.14.1** and SDK **2.14.1**. The SDK requires Node `^22.23.4 || ^24.22.1 || >=26.12.1`; the root `.nvmrc` selects the Node 24 line, so install its latest patch. Verification here used Node 24.20.0, which npm warns is below the supported patch range; repeat checks on a supported patch before deployment.

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

No cloud deployment or external API keys are required. `spacetime.json` points at `backend/` and defaults to local; commands explicitly use port 3100 to avoid Next.js on 3000. Start Next.js with `npm --prefix frontend run dev`. The UI remains a placeholder until Persons 1 and 4 integrate it.

## Contract and client handoff

Generated bindings are committed under `frontend/src/module_bindings/`; regenerate after changing the schema or reducer arguments. The frontend SDK is pinned to match. Person 4 owns the shared browser connection and UI subscription lifecycle.

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

The schema includes all eight README entities plus a private employee allowlist. Zones carry `disasterId`, `level` (`national`, `metro`, `neighborhood`), optional `parentZoneId`, and `boundary` as a GeoJSON Polygon JSON string with `[longitude, latitude]` coordinates. Each hazard has its own hierarchy. Household `zoneId` identifies its neighborhood; follow zone → disaster for hazard filters. The current contract assigns one zone per household; shared-household cross-hazard exposure needs a future relation agreed with Person 3.

Status values follow the root README. Risk and urgency are demo scales of 1–5. Requests add `people` (positive integer); team `capacity` is the maximum people supported by one assignment. One team can have only one active assignment, even when that assignment uses less than its capacity. All teams initially have `available` status.

Supported request needs: `food`, `water`, `shelter`, `welfare_check`, `evacuation`, `claims_support`, `fire_smoke_support`, `winter_weather_support`. Capabilities match these exact strings. Seeded teams cover their hotspot's needs; unsupported teams are rejected. Customer status never affects eligibility.

Supported task actions: `outreach`, `preparedness_information`, `shelter_options`, `position_supplies`, `shelter_in_place`, `infrastructure_check`, `evacuation_preparation`, `smoke_protection`, `winter_preparation`, `flood_preparation`. Hazard-specific fixture tasks are placeholders for Person 3's reviewed recommendations.

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
- `resetDemo({ confirmation: 'RESET SYNTHETIC DEMO' })`: administrator-only; replaces operational fixture data, preserves memberships and durable activity history, and records the reset.
- `setEmployee({ identity, enabled })`: administrator-only membership grant/revoke; cannot alter the administrator.

All operational changes persist an activity event transactionally. Assignment distances are straight-line kilometers using Haversine; ETA is minutes at an assumed 30 km/h. These are approximations, not verified road routes or safe travel advice. No automatic dispatch, messages, or network calls occur in reducers.

## Repeatable verification

Eight datastore-harness tests cover authorization/revocation, task transitions, check-in independence, request validation, dispatch conflicts, completion, cancellation/reassignment, all six seeded hazard types, isolated escalation, and repeatable reset. Harness tests do not verify subscriptions; use the live check for that.

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

The live test creates three temporary client identities, authorizes two through the CLI publisher, verifies synchronization and competing dispatch, completes assistance, checks revocation and outsider rejection, and revokes test memberships on exit. It mutates this disposable fixture. Override `SPACETIMEDB_URI` and `SPACETIMEDB_DATABASE` if needed; the script restricts the host to localhost/127.0.0.1.

## Remaining integration

See [Person 2 plan](PLAN.md). Person 3 still owns final datasets, hazard geometry/exposure, transparent priority scores/reasons, overdue-contact rules, and suitable-team recommendations. The fixture has one hotspot per hazard, 18 context/metro/neighborhood zones, 12 fictional households/requests/tasks, and six teams; it is not a real hazard feed. Persons 1 and 4 own map/UI implementation and browser acceptance checks. OIDC login UX, production deployment, and team-wide contract sign-off remain pending.
