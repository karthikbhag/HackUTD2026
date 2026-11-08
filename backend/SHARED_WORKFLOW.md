# Connected main dashboard

`http://localhost:3000/` uses the shared SpacetimeDB scenario desk. `/demo` stays
a separate browser-local rehearsal. The main page reports missing configuration
instead of silently substituting local demo records.

This checkout is configured with ignored `frontend/.env.local` values:

```env
NEXT_PUBLIC_SPACETIMEDB_URI=http://127.0.0.1:3100
NEXT_PUBLIC_SPACETIMEDB_DATABASE=riskreach-person3-demo
```

The main database is a new persistent local Demo dataset: 10,000 households,
56 hotspots, 112 zones, 220 teams, 2,000 initial requests and 93 impact layers.
The application data is synthetic. This contribution does not modify the older
verification databases on port 3123 or deploy anything to a cloud service.

## Start or resume locally

Use CLI/SDK 2.14.1, a supported Node version (`24.22.1` was verified), and Python
3.11+. Run from the repository root. Keep the database and Next.js terminals open.

```powershell
spacetime start --listen-addr 127.0.0.1:3100 --data-dir .tmp/riskreach-local-server --non-interactive
```

That directory is ignored, persistent local database storage. Reuse it after a
restart. Do not add `--in-memory` when you want records to survive server shutdown.
If the server is already running, reuse it instead of starting another process.

For a fresh setup only:

```powershell
npm.cmd --prefix backend ci
npm.cmd --prefix frontend ci
$env:PYTHON = (Get-Command python.exe).Source
python data/scenarios/generate.py --preset demo --seed 2026 --output data/scenarios/generated/demo.json
npm.cmd --prefix backend run build:scenario -- --preset demo
spacetime publish riskreach-person3-demo --server http://127.0.0.1:3100 --js-path backend/.test-output/demo/bundle.js --delete-data=never --no-config --yes
spacetime call riskreach-person3-demo seed_demo --server http://127.0.0.1:3100 --no-config
Copy-Item frontend/.env.example frontend/.env.local
```

Do not seed again when resuming an existing database. Use the same publishing
CLI identity for enrollment. Rebuild the Demo bundle when publishing code updates
to this Demo database; the ordinary module build bundles Small, not Demo.

```powershell
npm.cmd --prefix frontend run dev -- --hostname localhost --port 3000
```

Restart Next.js after changing environment values. Production builds capture
`NEXT_PUBLIC_*` values at build time. Open `/`, then enroll the **public employee
identity** shown below the map (never copy the browser's token):

```powershell
spacetime call riskreach-person3-demo set_employee '"BROWSER_IDENTITY_HEX"' true --server http://127.0.0.1:3100 --no-config
```

Enrollment updates the existing browser subscription. Each browser profile or
private session has its own identity and needs separate enrollment. Revocation
removes its subscribed rows. There is no browser self-enrollment endpoint.

## Decisions and shared scenario workflow

`src/decisions.ts` runs Person 3's exposure, priority, follow-up, preparedness and
team recommendation helpers against authoritative rows. Private summaries keep
scores, exposure IDs and follow-up flags compact. Selected-household/request views
derive detailed explanations, sourced suggestions and team eligibility on demand.
Relevant mutations refresh decisions transactionally; a private one-minute clock
also refreshes elapsed-contact thresholds. Unchanged summaries are not rewritten.

The connected scenario desk follows map/hotspot selection, retains the redesign,
and supplies a 25-row priority queue with search/overlooked filtering, household
explanations, reviewed preparation tasks, assistance requests, team recommendations,
explicit dispatch, assignment transitions and recent shared activity. Community
assistance cases use the same rules as customers. Full subscriptions remain;
these synthetic dataset sizes are not production throughput guarantees.

The shared exercise adds one clock per disaster and separate before/after reply
records. Employee actions work as follows:

1. Review and approve a **simulated preparation notice**. The server records the
   approved text and a round for all households geographically in that area.
   Recording a notice alone does not count as confirmed contact.
2. Record simulated replies, or advance two hours to impact. Enrolled employees
   may advance this bounded synthetic exercise. This escalates only the selected
   disaster and retains all pre-impact replies.
3. Approve a **fresh post-impact safety check-in**. Earlier replies do not confirm
   current safety. Current check-in status becomes unknown while prior replies
   remain in the round history.
4. A needs-help reply creates/reuses an active welfare-review request. Other need
   types and party sizes can be recorded explicitly in the assistance form.
5. Advance 30 minutes to the shared reply deadline. Unanswered post-impact rounds
   become overlooked cases and receive reviewable welfare requests. This concern
   remains independent of recent pre-impact contact. No team is dispatched
   automatically; employee selection is always required.
6. Review capabilities, people capacity, availability, distance and approximate
   ETA. The assignment reducer revalidates current state and rejects conflicts.
   Complete/cancel assistance to release the team. Safety replies never silently
   resolve requests; assistance resolution remains a separate action.

Exercise timestamps and T±minutes are separate from actual database activity time.
The shorter deadline belongs to this explicitly simulated exercise; it does not
change the pure helper's ordinary contact-age thresholds. Clock/run checks reject
stale actions and duplicate notices. Simulation records persist across reloads,
area changes and clients. They do not deliver notifications, call an AI service,
infer evacuation orders or represent actual customer replies.

Preparedness approval rechecks exposure, phase, template conditions and current
run/history. Pending, in-progress or completed recommendation tasks suppress
duplicates within the run. Full dataset reset remains administrator-only and
requires typed confirmation. It restores the bundled fixture, advances the run,
clears exercise rounds, allocates fresh operational IDs and preserves access and
durable activity history. The publishing CLI can reset it:

```powershell
spacetime call riskreach-person3-demo reset_demo '"RESET SYNTHETIC DEMO"' --server http://127.0.0.1:3100 --no-config
```

Direct `escalate_scenario` remains administrator-only; the employee exercise clock
uses its narrower approved-notice, fixed-stage transition. Impact severity caps
at critical. Default critical exposure adds 45 points (maximum default score 190);
older custom scoring configurations without that optional weight use high weight.

## Data, upgrades and verification

Ordinary Small builds now bundle `src/default-scenario.json` with 60 households,
ten explicit impact layers and 12 reviewed templates. Generator version 4 adds
Small team regions; schema stays 3, older generator-v3 fixtures remain supported,
and the legacy v1 fixture remains unchanged. Staging uses Windows junctions for
dependencies. New task run/recommendation fields and impact recommendation links
have migration defaults. `refresh_decision_snapshot` can initialize missing
decision/catalog/timer state on an upgraded database without replacing records.
It does not invent exposure geometry for a legacy database with no impact layers.

The backend suite has 101 passing tests, including 17 restored preparedness tests
and four shared-workflow cases. Nine Python tests and six browser-local demo-state
tests pass. Typechecks, module builds, frontend lint and the production build pass;
lint retains one generated-bindings warning. CommonJS demo tests have a scoped
ESLint configuration allowing their Node `require` imports.

The new live verifier uses only `riskreach-person3-shared-check` on loopback. It
mutates and resets that disposable Small database, never the main Demo database:

```powershell
npm.cmd --prefix backend run build
spacetime publish riskreach-person3-shared-check --server http://127.0.0.1:3100 --js-path backend/dist/bundle.js --delete-data=never --no-config --yes
spacetime call riskreach-person3-shared-check seed_demo --server http://127.0.0.1:3100 --no-config
npm.cmd --prefix backend run test:shared:live
```

The real two-client check passed suggestion approval/duplicate suppression,
separate rounds, employee time skips, fresh post-impact nonresponse detection,
non-customer welfare assistance, competing dispatch (one winner), completion,
scheduled refresh, shared reset/replay, stale-run rejection and live revocation.
Temporary test memberships are revoked in cleanup. Browser acceptance is a
separate check: enroll two browser identities and perform the same workflow in
the main page. SDK and production-build results do not establish visual layout
or browser interaction quality.

## Response routing demo

The dedicated routing queue is the approved automatic-dispatch simulation exception.
Manual assistance keeps its existing semantics; reserved welfare teams cannot be
manually dispatched. Fresh safe reports cancel queued/en-route checks immediately,
retain in-progress checks with a notice, and leave assistance requests intact.

The current ignored environment selects `riskreach-stress-100k` on loopback port
3100, rather than the older Demo name above. Its module was upgraded using the
matching Stress bundle and `--delete-data=never`; existing counts remain 100,000
households, 1,970 teams and 20,000 requests. Shared decision state was initialized
without resetting records. Browser enrollment persists. Use the database selected
in your own environment if it differs from these examples.

### Start the routing worker and response screen

From the repository root on this Mac:

```sh
export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"
npm --prefix routing-worker start
```

The persistent Node worker explicitly loads `frontend/.env.local`, uses the shared
configured database and prints its **public identity**. An administrator enrolls
that identity in a second terminal (never paste the token file):

```sh
spacetime call riskreach-stress-100k set_routing_worker '"WORKER_IDENTITY_HEX"' true --server http://127.0.0.1:3100 --no-config
```

Open `http://localhost:3000/response`. If required, enroll the displayed public
browser identity through `set_employee` using the existing enrollment instructions.
Click **Start Dallas routing fixture**, select a team, then **Resume simulation**.
This adds only 20 fictional households and two local teams alongside nationwide
rows. Both teams begin at staging. Reset removes only this owned fixture after
active checks/manual assistance finish. The fixture starts with a clearly
simulated, explicitly employee-started post-impact round; no messages are sent.
Ordinary `start_response_demo` instead attaches capable teams to an existing
compact neighborhood with a fresh authoritative post-impact round.

A missing map/key never hides the stop list or safety notices. Restart Next.js
if changed environment values are not picked up. The browser accepts either
`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` or the existing
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; the server uses `GOOGLE_MAPS_API_KEY`.

### No-billing Google demo-key mode

Keep Cloud billing **disabled**, as requested. The default worker uses only
**Compute Routes**, supported by Google's Maps Demo Key. The original approved
plan assumed Compute Route Matrix; that method returned `BILLING_DISABLED` with
this key. The implementation now constructs directional travel estimates from
batched Compute Routes legs, deduplicating identical positions and using at most
nine intermediate waypoints per request. It uses traffic-unaware driving estimates
and disables provider waypoint reordering. Larger final routes are split into
bounded requests while preserving stop order. Service and return time are checked
again against actual directions. This remains an approximate priority heuristic.

Live checks with the existing key passed a direct Compute Routes call, a two-point
directional estimate and road polylines (two legs, 31 vertices each, endpoint snaps
about 15–16 meters). The complete 20-household Google demonstration and browser
rendering remain for user acceptance. Demo-key quotas may pause requests until the
next day without charges. No billing settings were changed. Use Google's current
[demo-key documentation](https://developers.google.com/maps/demo-key) for supported
features and quota behavior.

At the default start there are 17 non-safe homes plus staging; shared team/staging
coordinates are deduplicated. The full directional estimate takes about 31 bounded
Compute Routes requests, plus final team directions. Replans and periodic refreshes
consume additional requests. The worker limits itself to 120 HTTP attempts/minute,
retries transient failures at most twice, and waits 15 seconds after a failed solve.
Demo quotas can be lower and are authoritative. Google-derived geometry exists only
in process memory, expires after the refresh interval and is served with `no-store`
on loopback port 3201. It is displayed only on the Google response map. The Leaflet
dispatcher receives simulated team coordinates and welfare destination grouping.

Worker identity tokens persist privately in ignored `.tmp/routing-worker-token`.
Leases last 30 wall-clock seconds, are renewed by a separate heartbeat, and carry
increasing fencing tokens. Planning freezes playback while origin versions are
reconciled; lease/config/epoch/route checks reject late publications and ticks.
Only one worker should be started on the default port. Geometry access is a local,
synthetic-demo endpoint, not a production responder authentication system.

For an explicitly labelled offline rehearsal:

```sh
ROUTING_PROVIDER=fixture npm --prefix routing-worker start
```

This mode uses straight-line fixture travel, never a silent fallback after Google
failure. Stop the first worker before selecting another provider.

### Verification and user acceptance

`npm --prefix backend test` includes routing/provider/reference tests. Worker types
can be checked with `backend/node_modules/.bin/tsc -p routing-worker/tsconfig.json`.
`npm --prefix backend run test:routing:live` mutates only the disposable
`riskreach-response-routing-check` database and runs an explicitly offline worker
on port 3202; publish the current Small bundle there first. Test memberships are
revoked and the worker is stopped afterward. Never point that verifier at the main
Stress database.

On `/response`, verify both team routes/positions, queued-household safe reports,
current-destination cancellation from the latest position, urgent escalation,
pause/settings/resume, team unavailability, uncovered reasons, dwell completion
and return to staging. Confirm the dispatcher continues receiving the same shared
state. Visual/browser acceptance is performed by the user; the automated live
check establishes database/worker behavior, not browser layout quality.
