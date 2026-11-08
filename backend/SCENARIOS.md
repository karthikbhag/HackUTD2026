# Local scenario inspection

> Current v1.21 integration: [shared popup workflow](POPUP_WORKFLOW.md). Main `/` and `/demo` now persist/share notifications, replies, clock and response approvals; `/demo/local` is isolated. The current Turbopack production build passes. Historical pending-integration notes below are superseded by this checkpoint; interactive browser acceptance remains separate.

Use the real SpacetimeDB → authorized subscriptions → map path. Small, Demo, and
Stress use separate local databases; generating/building never changes the tracked
Small fixture or an existing database. Run commands from the repository root.

## Requirements

`build:scenario` now compiles its TypeScript runner with the existing esbuild
dependency before executing JavaScript; it no longer requires Node to load `.ts`
files directly. Node 22.13.1 is still below the installed SDK's supported range.
Use supported Node 24.22.1+ in the Node 24 line (or another declared engine range).
In this existing checkout, the downloaded portable runtime can be selected for
the current PowerShell session without restarting VS Code:

```powershell
$env:PATH = (Resolve-Path '.tmp/node-v24.22.1-win-x64').Path + ';' + $env:PATH
$env:PYTHON = (Get-Command python.exe).Source
node --version
npm.cmd --prefix backend run build:scenario -- --preset demo
```

The portable runtime is ignored by Git; teammates should install a supported Node
version themselves. Selecting a runtime in one terminal does not change another
already-open terminal's PATH.

Use CLI/SDK 2.14.1, Python 3.11+, and Node satisfying
`^22.23.4 || ^24.22.1 || >=26.12.1`. Run `nvm use` if available, then check
`node --version` (install a supported patch if necessary).

```sh
npm --prefix backend ci
npm --prefix frontend ci
spacetime --version
```

Start SpacetimeDB in another terminal, unless it is already listening on 3100:

```sh
spacetime start --listen-addr 127.0.0.1:3100
```

## Demo: 10,000 households

```sh
python3 data/scenarios/generate.py --preset demo --seed 2026 --output data/scenarios/generated/demo.json
python3 data/scenarios/validate.py data/scenarios/generated/demo.json
npm --prefix backend run build:scenario -- --preset demo

spacetime publish riskreach-demo-10k --server http://127.0.0.1:3100 --js-path backend/.test-output/demo/bundle.js --delete-data=never --no-config --yes
spacetime call riskreach-demo-10k seed_demo --server http://127.0.0.1:3100 --no-config
npm --prefix backend run verify:scenario -- --preset demo --database riskreach-demo-10k
```

The build validates the fixture and stages a backend project beneath ignored
`backend/.test-output/demo/`. The normal CLI builds that staged module; only this
fixture is bundled. `manifest.json` records the preset, generation seed/version,
fixture and bundle SHA-256, and expected counts. No runtime filesystem reads,
HTTP JSON preview, or new import reducer are involved. Seed insertion is atomic;
a second `seed_demo` refuses to overwrite data.

The verification script compares subscribed rows to the build manifest, exercises
the actual map adapter/hazard filters, checks regional records and safe households
with unresolved needs, and verifies an outsider receives no household/impact rows.
It briefly enrolls a fresh test identity using the publishing CLI identity, then
revokes it in cleanup. It does not modify scenario records. Set `SPACETIMEDB_URI`
for another localhost port; non-local hosts and non-scenario database names are
rejected. Timings describe this one subscription/adaptation run, not browser FPS.

Stop any existing Next.js process for this checkout before starting another one;
changing the port alone does not bypass Next.js's per-project development lock.
Then run:

```sh
NEXT_PUBLIC_SPACETIMEDB_URI=http://127.0.0.1:3100 NEXT_PUBLIC_SPACETIMEDB_DATABASE=riskreach-demo-10k npm --prefix frontend run dev -- --port 3000
```

Open http://localhost:3000. The connection panel shows the database and browser
identity. Enroll that public identity with the same CLI identity used to publish:

```sh
spacetime call riskreach-demo-10k set_employee '"BROWSER_IDENTITY_HEX"' true --server http://127.0.0.1:3100 --no-config
```

Browser tokens are stored separately per endpoint/database. Enrollment is needed
once for each browser identity in each database. Environment values on the command
line override `.env.local`; restart Next.js when switching datasets. Public values
are captured during a production build.

## Stress: 100,000 households

```sh
python3 data/scenarios/generate.py --preset stress --seed 2026 --output data/scenarios/generated/stress.json
python3 data/scenarios/validate.py data/scenarios/generated/stress.json
npm --prefix backend run build:scenario -- --preset stress
spacetime publish riskreach-stress-100k --server http://127.0.0.1:3100 --js-path backend/.test-output/stress/bundle.js --delete-data=never --no-config --yes
spacetime call riskreach-stress-100k seed_demo --server http://127.0.0.1:3100 --no-config
npm --prefix backend run verify:scenario -- --preset stress --database riskreach-stress-100k
```

Restart Next.js with `NEXT_PUBLIC_SPACETIMEDB_DATABASE=riskreach-stress-100k` and
enroll its identity in that database. Both seeded databases remain available;
switching back requires only restarting Next.js with the other database name.

## Small: 60 households

`npm --prefix backend run build:scenario -- --preset small` stages the tracked
modern schema-v3 `backend/src/default-scenario.json` fixture. Publish `.test-output/small/bundle.js` to `riskreach-small-60`,
seed it, and run `verify:scenario -- --preset small --database riskreach-small-60`.
It has ten explicit impact layers and 12 reviewed templates; context remains separate.
The ordinary backend build/seed also still uses this Small fixture.

## Repeat runs and expected counts

Once seeded, reuse a database without calling seed again. For a clean fixture,
use a fresh name such as `riskreach-demo-10k-run2` in publish, seed, verification,
and frontend startup. Nothing in this flow deletes an existing database. Avoid
publishing these fixture-specific bundles to `riskreach-local`.

Demo seed 2026: 10,000 households (8,000 neighborhood / 2,000 regional), 56
hotspots/disasters, 112 context zones, 220 teams, 2,000 requests, 2,597 outreach
tasks, 93 impact layers, zero assignments.

Stress seed 2026: 100,000 households (80,000 neighborhood / 20,000 regional), 56
hotspots/disasters, 112 zones, 1,970 teams, 20,000 requests, 24,931 outreach tasks,
93 impact layers, zero assignments. Small: 60 households (48/12), six hotspots,
12 zones, 12 teams, 12 requests, 18 outreach tasks, ten impact layers and zero assignments.
Task counts are calculated from never-contacted source rows and can change with
another seed; use the manifest as the fixture-specific authority.

For a CLI count, aggregate expressions need aliases:

```sh
spacetime sql riskreach-demo-10k 'SELECT COUNT(*) AS households FROM household' --server http://127.0.0.1:3100 --no-config
```

## Browser acceptance

- Confirm database identity, total and neighborhood/regional counts. Dataset totals
  stay fixed when filters or viewport change; matching rows and drawn markers are
  reported separately. An unauthorized identity can have an applied empty subscription.
- National circles summarize hotspot household membership. Alaska/Hawaii are in
  overview framing and the list. Select a hotspot to zoom to regional context.
- At zoom 9+, household Canvas markers and team markers are limited to a viewport
  with 10% padding. The drawn count describes those instantiated household markers.
  Pan/zoom refreshes on settled moves; zooming out returns to summaries.
- Toggle hazards, including all off. Hidden hazards must leave no orphan records
  or details. Dataset totals must not change. Reset restores national framing.
- Select neighborhood and regional households from markers and from the membership
  selector/list. Inspect check-in, last contact, vulnerabilities and unresolved needs.
  A safe check-in does not resolve a request. Household lists show 50 rows per page;
  selected-record details remain available independently of page/viewport.
- Dashed outlines are geographic context. Filled, separately labeled layers are
  synthetic hazard footprints. Overlapping components are retained and their source,
  timestamp, severity basis and limitations appear in the detail panel. Geographic
  membership and hotspot counts are not affected-household counts.
- Repeatedly select, pan, zoom, filter and page without layer accumulation or
  sustained interaction stalls. Selection restyles existing geometry; only viewport
  records are recreated when navigation changes.

## Verification status and boundaries

On 2026-11-07, Node 24.22.2 / CLI+SDK 2.14.1 built, published, seeded and verified
both Demo and Stress through actual local SDK subscriptions. Demo subscription /
adaptation were approximately 142 / 17 ms; Stress 1,341 / 155 ms in single local
runs. Development `riskreach-local` retained 60 households. No batch importer was
needed for either atomic seed. All 31 backend tests, backend/frontend typechecks,
and lint passed (lint has one existing generated-bindings warning). All nine Python
generator/geometry tests passed.

Interactive browser acceptance remains pending: the computer-use browser host was
unavailable, and a second dev process was refused because this checkout already
had a running Next.js server. Production build encounters the existing Turbopack
CSS worker-port `Operation not permitted` error, including an elevated retry.
These limits do not establish browser responsiveness or production-build success.

Full authorized subscriptions are retained for now. Only observed Stress browser
problems justify scoped server views/summaries, a viewport spatial index, clustering,
or worker adaptation. No live-update simulation, dispatch UI, or benchmarking
framework was added. The pure exposure helper remains available through `npm run
exposure`; exposure relations/counts are not persisted or displayed by this path.
