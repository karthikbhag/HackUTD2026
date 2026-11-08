# Household exposure handoff

Person 3 task 3 is implemented in `src/exposure.ts`. It is a pure TypeScript
helper suitable for module code: it uses no SDK, clocks, filesystem, network,
randomness, or global caches. It does not publish new tables/views or change
existing reducers. Import from this helper file, not the module entry point.

## Inputs and results

`calculateExposure(households, impactLayers)` accepts household IDs and
latitude/longitude, plus explicit hazard impact layers. It accepts string source
IDs or bigint backend IDs through its generic type. Source fixture fields are
snake_case; result fields use camelCase. Additional household fields are ignored:
zone membership, customer status, and check-in status do not determine exposure.

Every household has a result, including `affected: false`, no highest severity,
and an empty evidence array when outside all supplied layers. Each match records
layer/disaster ID, hazard, component, qualitative severity, simulation/forecast/
report kind, simulation flag, source, timestamp, and label. `highestSeverity`
is the maximum qualitative severity among matches, not a priority score.

All components remain visible: a household can match both fire and smoke, both
earthquake shaking zones, and hazards from separate disasters. `affectedHouseholds`
counts each input household once; each `byDisaster` and `byHazard` count also
deduplicates within that group. `byLayer` counts households matching that layer.
Do not sum group counts to obtain the overall unique total. IDs must be unique
within each input collection; duplicate IDs are rejected rather than silently merged.
Results are sorted by ID, independent of input order. Distinct IDs representing
the same physical household are still distinct records; deduplication of source
identities must happen before calling this helper.

Geometry is `[longitude, latitude]`, using a planar, boundary-inclusive ray cast.
It supports concave simple polygons, one outer ring, and either winding direction.
Invalid coordinates, open/degenerate/self-intersecting polygons, holes,
MultiPolygons, dateline-spanning shapes, and inconsistent provenance are rejected.
The tolerance is `1e-10` in coordinate-space comparisons, not a specified distance
in meters. This local synthetic model is not geodesic analysis or safe routing.

Polygons are prepared once per calculation and indexed by one-degree grid cells.
A bounding-box precheck precedes the ring test. Broad polygons spanning over
4,096 cells use a fallback list instead of creating a large index. The index
never filters by the household's assigned zone, state, or hazard. `candidateChecks`
is a diagnostic count, not the number of exposed households. Recalculate after
changing household positions or impact geometries/severities; results are snapshots.

## Offline report

From the repository root, after installing the locked backend dependencies:

```sh
python data/scenarios/generate.py --preset demo --seed 2026 --output data/scenarios/generated/demo.json
python data/scenarios/validate.py data/scenarios/generated/demo.json
npm --prefix backend run exposure -- ../data/scenarios/generated/demo.json ../data/scenarios/generated/demo-exposure.json
npm --prefix backend test
npm --prefix backend run typecheck
```

Paths passed through `npm --prefix backend` are relative to `backend/`. The output
directory must already exist. The report is an ignored local artifact, not a
database import. Only schema v3 with explicit `impact_layers` is accepted: legacy
v1/v2 context rectangles must never be silently treated as impact polygons.

## Backend integration boundary

The default seed/reset now use bundled schema-v3 Small with ten impact layers.
The converter now accepts v1/v2/v3, and isolated preset builds persist v3 impact
layers through authorized subscription views; see [SCENARIOS.md](SCENARIOS.md).
The importer reuses this helper with empty household input to validate layer
geometry/provenance. The importer validates geometry; the authoritative decision integration calculates exposure and stores matched layer IDs with each household summary.
The existing converter tests retain explicit v2 coverage alongside new v3 tests.

For fixture-based integration, retain source layer/disaster IDs and map household IDs
using `adaptScenario(...).maps.households` when joining fixture-derived evidence
to backend rows. Alternatively supply already-mapped bigint IDs for households,
layers, and disasters. Do not coerce bigint IDs through JavaScript numbers.
[Live integration](DECISIONS.md) preserves employee authorization and recomputes after mutations and on a private schedule. Selected-household details retain full cross-hazard evidence. Critical severity is supported. Exposure is many-to-many and never overwrites `zoneId`.

## Verification and limits

Tests compare every household against an independent winding-number oracle for
Small, Demo, and Stress. Other cases cover vertices/edges, concavity, ring reversal,
negative coordinates, overlaps, unique totals, bigint IDs, empty data, invalid
inputs, grid boundaries, and broad-layer fallback.

For seed 2026, Stress finds 82,184 unique exposed households among 100,000 using
187,353 grid candidates, versus 9,300,000 possible household-layer pairs. A local
Node 24.22.1 run measured approximately 134 ms for the helper, excluding JSON
generation/parsing, writing, database work, and browser rendering. This is one
local synthetic measurement, not a backend throughput guarantee. Dense overlapping
or broad polygons can increase candidate counts substantially.
