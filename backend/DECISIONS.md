# Authoritative decisions and operational workflow

Person 3's eight data/decision tasks are implemented. The pure exposure, priority,
follow-up, preparedness and team helpers now run against authoritative database
rows. The connected operational panel reuses the map's SDK connection. All data,
outreach and escalation are synthetic; scoring weights and ETA are demo assumptions.

## Stored state and subscriptions

`src/decisions.ts` stores one compact summary per household: current run, score,
highest urgency/severity, matched layer IDs, contact timestamp and follow-up flags.
Only changed decision/ranking values cause summary writes. Full explanations and
preparedness evidence are derived for the selected household, avoiding a detailed
JSON copy for all 100,000 cases.

All backing tables remain private. Employee-authorized views expose:

- `decisions` and `scenario_info`: queue summaries and the evaluation clock/run.
- `household_decisions(household_id)`: itemized score, exposure, contact/concern
  explanations, requests, sourced suggestions and task suppression.
- `team_recommendations(request_id)`: five nearest eligible teams, approximate
  straight-line distance/ETA, and eligibility/exclusion reasons.

Outsiders see empty views; revocation removes subscribed rows and details. SDK
bindings were regenerated. Parameterized subscriptions are removed on selection
changes. IDs and timestamps preserve bigint precision; JSON detail IDs are strings.

Relevant contact/check-in/request/assignment changes refresh affected households
in the same transaction. Escalation and explicit refresh recompute all cases.
A private scheduled reducer refreshes every minute using database time, including
contact age crossing a threshold without an employee action. Direct employee
calls to that scheduled reducer are rejected. The scenario clock advances even
when no summary values change.

## Review, escalation and replay

Preparedness suggestions require exposure, a preparedness-phase disaster and the
template's support/component conditions. Approval rechecks eligibility and the
expected run, then creates one pending task per household/recommendation/run.
Pending, in-progress and completed tasks suppress repeat approval in that run.
Generic tasks do not falsely suppress named recommendations. No message is sent.

Only the publisher administrator may escalate or reset. Escalation affects only
the selected simulated disaster: phase becomes response, zone severity caps at 5,
and matching impact severity progresses moderate → high → critical (capped).
Critical exposure contributes 45 default points; older custom configurations that
omit its optional weight retain their high weight. Maximum default score is 190.
Other hazards retain their phase/severity; preparedness suggestions for those
hazards remain eligible.

Reset requires `RESET SYNTHETIC DEMO`, restores the fixture bundled in that
database, increments the run, and shifts source times together to reset time.
Operational records are replaced, request/task/assignment IDs are freshly
allocated, and employee access plus durable activity history survive. Old-run
approvals fail. Membership IDs and source geography IDs are not replay tokens.

Ordinary builds now use `src/default-scenario.json`: schema-v3 Small with 60
households, ten impact layers and 12 reviewed templates. Staged Demo/Stress builds
use their selected fixture. Generator version 4 adds Small team regions; schema
remains 3, validation also accepts existing generator-v3 fixtures, and the legacy
v1 fixture remains unchanged for compatibility tests.

## Start, upgrade and review

Use CLI/SDK 2.14.1, supported Node 24.22.1 or later in the declared engine range,
and Python 3.11+. See [SCENARIOS.md](SCENARIOS.md) for fixture build/publish/seed,
browser environment variables and employee enrollment. Generated large fixtures,
staged bundles and local server data remain ignored by Git. Windows staging uses
a directory junction for dependencies, avoiding privileged symlink creation.

For an existing database, publish with `--delete-data=never`; do not reset it just
to upgrade. New task run/recommendation fields and impact recommendation links
have defaults. An authorized call to `refresh_decision_snapshot` initializes
missing decision state/catalog/timer and links existing impact layers without
replacing operational rows. A legacy database with no explicit impact layers
stays without exposure; refreshing does not invent geometry. Choose a fresh
schema-v3 fixture database for the complete demonstration.

```sh
spacetime call riskreach-local refresh_decision_snapshot --server http://127.0.0.1:3100 --no-config
```

Employee browsers get queue, review and assistance controls. Scenario controls
are shown only when the connected identity is administrator. The publishing CLI
can also perform admin operations:

```sh
spacetime call riskreach-local escalate_scenario 1 --server http://127.0.0.1:3100 --no-config
spacetime call riskreach-local reset_demo '"RESET SYNTHETIC DEMO"' --server http://127.0.0.1:3100 --no-config
```

The operational panel includes search, 25-row priority pages, overlooked filtering,
score reasons, exposure evidence, recorded contact/check-ins, reviewed preparation
tasks, request creation/resolution, team recommendations, explicit assignment,
start/complete/cancel controls, and recent activity. Assignment is revalidated
transactionally; neither recommendations nor UI snapshots reserve teams.

## Repeatable local checks

The mutating decision verifier is restricted to loopback and exact disposable
names `riskreach-person3-small-check`, `riskreach-person3-demo-check`, and
`riskreach-person3-stress-check`. Publish and seed the matching preset bundle on
a separate local server (the verification run used port 3123):

```sh
npm --prefix backend run build:scenario -- --preset small
spacetime publish riskreach-person3-small-check --server http://127.0.0.1:3123 --js-path backend/.test-output/small/bundle.js --delete-data=never --no-config --yes
spacetime call riskreach-person3-small-check seed_demo --server http://127.0.0.1:3123 --no-config
```

PowerShell:

```powershell
$env:PYTHON = (Get-Command python.exe).Source # Python 3.11+ if python3 is older
$env:SPACETIMEDB_URI = 'http://127.0.0.1:3123'
$env:SPACETIMEDB_DATABASE = 'riskreach-person3-small-check'
npm.cmd --prefix backend run test:decisions:live
npm.cmd --prefix backend run verify:scenario -- --preset small --database riskreach-person3-small-check
```

For Demo/Stress, generate the JSON per SCENARIOS.md, build the corresponding
preset, publish/seed its matching disposable name, and change both command
arguments/environment variables. Start from a seeded baseline; the decision
verifier returns it to baseline on success and revokes temporary memberships.
It exercises two-client decisions, contact without false resolution, approved
task suppression/completion, new requests, competing assignment (one winner),
completion/team release, escalation, the real scheduled clock, replay, stale-run
rejection and live revocation. It also tests an unauthorized third client.

The datastore suite covers all six hazards individually and Small/Demo/Stress
seed → mutate → reset, including preserved access/history and relative times.
The manifest verifier independently checks subscribed counts, the map adapter,
all hazard filters, regional households, unresolved safe cases and isolation.

All 106 backend tests across nine files and all nine Python tests pass, along
with backend/frontend typechecking, module builds, frontend lint and production
build. Two-client live lifecycle and manifest/map-adapter verification passed
for Small (60), Demo (10,000), and Stress (100,000). Temporary verification
memberships were removed from all three databases, leaving their administrators.

Interactive browser
acceptance remains pending: Computer Use ended because it could not determine
Brave's current URL confidently enough to enforce policy. Automated SDK and map
adapter checks do not establish browser layout, interaction quality or frame rate.
Full-table subscriptions remain, so these synthetic checks are not a production
throughput guarantee. No cloud deployment, commit or push is part of this work.
