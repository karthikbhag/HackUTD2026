# Repeatable nationwide scenario datasets

Person 3's portable source data supports the map and future Spacetime seed reducer. The Small fixture is connected to backend seed/reset through a validated adapter; the larger presets remain offline generation/conversion fixtures. Python 3.11+ is needed only for generation and validation, with no dependencies.

## Presets

| Preset | Hotspots | Households | Teams | Open requests | Purpose |
| --- | ---: | ---: | ---: | ---: | --- |
| Small | 6 | 60 | 12 | 12 | Quick development fixture, schema v3 |
| Demo | 56 | 10,000 | 220 | 2,000 | Recommended national demonstration, schema v3 |
| Stress | 56 | 100,000 | 1,970 | 20,000 | Performance experiments, schema v3 |

Demo includes one context hotspot per state, including Alaska and Hawaii, plus six denser narrative hotspots. Each narrative hotspot has 1,000 households; each state context hotspot has 80. Stress increases those counts to 6,000 and 1,280 respectively. Each hotspot has a region and a high-risk neighborhood; 80% of households are inside the neighborhood and 20% are outside it but inside the region.

The six narrative hotspots cover tornadoes in Central Oklahoma, earthquakes in Southern California, hurricanes in Gulf Coast Florida, wildfires in Northern California, blizzards in the Upper Midwest, and floods in Southeast Texas. State context hazards are exercise choices, not hazard frequency estimates. Anchors and offsets are approximate authored coordinates, not verified land parcels, state boundaries, or population samples. National bounds provide map framing only.

## Generate and verify

Run from the repository root:

```sh
python data/scenarios/generate.py --preset demo --seed 2026 --output data/scenarios/generated/demo.json
python data/scenarios/validate.py data/scenarios/generated/demo.json
python data/scenarios/generate.py --preset stress --seed 2026 --output data/scenarios/generated/stress.json
python data/scenarios/validate.py data/scenarios/generated/stress.json
python -m unittest discover -s data/scenarios -p "test_*.py" -v
```

Large JSON outputs live in ignored `generated/`; regenerate locally rather than adding them to Git. `--output` writes UTF-8 directly, avoiding shell redirection differences. Without it, JSON goes to standard output. The default is `--preset small`, which retains the original households and adds schema v3 impacts; it does not use the seed. The tracked legacy `nationwide-v1.json` remains unchanged; validate it with `python data/scenarios/validate.py`. Regenerate existing local Demo/Stress files to get v3.

Same generator version, preset, seed, and Python runtime produce identical data. Changing the seed retains IDs but varies coordinates, later contacts, customer flags, vulnerabilities, and team capacities. Changing presets changes record counts. Do not mix fixtures in one database without a controlled seed/reset implementation.

## Contract and handoff

- Schema v2 adds `generation`, `hotspots`, and regional `zone_id` on teams. The fixture version is independent of the changelog version. Existing collection field conventions remain intact.
- Schema v3 adds `impact_layers`, `preparedness_recommendations`, and `boundary_role: geographic_context` on zones. Generator version is now 3. Small retains its six-hotspot layout and does not add the v2 national hotspot summaries. Validation accepts legacy v1/v2 and current v3.
- IDs are stable strings unique within each collection. `disaster_id`, `parent_zone_id`, `zone_id`, and `household_id` are foreign keys. Infer a zone's hazard through its disaster. The selected narrative hotspot remains `tornado-neighborhood`.
- V2 hotspots identify state, disaster, neighborhood, dense-demo flag, and household/request/team totals. These summaries describe the initial fixture, not live operational counts; recompute them from authoritative tables after changes.
- Boundaries are GeoJSON Polygon geometry in **longitude, latitude** order. Household/team coordinates are explicit fields. Zone rectangles now mean geographic context only; use `impact_layers[].geometry` to render actual synthetic hazard footprints. Household coordinates/memberships are preserved. The 80% neighborhood count is geographic membership, not an affected-household count.
- Fixed UTC ISO 8601 times are relative to `2026-11-07T12:00:00Z`. Convert to backend timestamps during import. A future reset should shift times together relative to its scenario clock. Null contact time means never contacted.
- Phase starts at `preparedness`; requests represent pre-existing exercise needs. Each hotspot retains an urgent non-customer request, a safe household with an unresolved supply request, vulnerable/never-contacted/older-contact examples, and available/unavailable teams. Customer status must not determine assistance priority.
- Team capacity means maximum simultaneous household cases. Teams number `max(2, households // 50)` per hotspot, with capacities between 2 and 8 and no initial assignments. Request volume intentionally exceeds immediate team capacity in dense hotspots. Capability matching and remaining capacity still require backend logic.
- Capabilities/needs are `shelter_support`, `welfare_check`, `evacuation_assistance`, `smoke_support`, `winter_weather_support`, and `supply_delivery`. Vulnerability flags are `limited_mobility` and `transport_needed`. These conventions and IDs require reconciliation with Person 2's final module schema and Person 1's temporary frontend fixtures.

## Hazard layers and recommendation catalog

| Hazard | Synthetic components | Preparedness topics |
| --- | --- | --- |
| Tornado | Narrow diagonal damage corridor | Shelter planning and accessible shelter needs |
| Earthquake | Nested moderate/high shaking footprints | Readiness drills and falling-object hazards |
| Hurricane | Broad wind ellipse and separate surge footprint | Official evacuation information and transport planning |
| Wildfire | Irregular fire perimeter and offset smoke plume | Cleaner-air options and local alerts |
| Blizzard | Broad snow/wind footprint and isolation pocket | Supplies, heat/power disruption, and check-ins |
| Flood | Irregular concave inundation corridor | Flood planning and transport barriers |

Small has 10 impact layers; Demo/Stress each have 93. All presets include the
same 12 reusable recommendation templates (two per hazard), linked by
`recommendation_ids`. Recommendations are employee-review content, not persisted
tasks or automatic household-specific suggestions; Person 3 task 6 remains pending.

Each impact layer identifies its disaster, context region, hazard, component,
qualitative severity/basis, label, authored source, simulation kind, timestamp,
limitations, and recommendation references. Severity is an exercise assumption,
not MMI, EF rating, wind speed, water depth, or AQI. Different components can
overlap; preserve their IDs rather than replacing one with another. Later exposure
logic handles overlaps without counting one household twice in aggregate totals;
see the [TypeScript exposure helper and offline report](../../backend/EXPOSURE.md).

Geometries are simple one-ring polygons without holes or dateline crossings.
Sizes and orientation are illustrative coordinate offsets, not physical models.
In particular, surge shapes are not fitted to real coastlines; fire/smoke shapes
do not use wind or terrain; shaking zones do not use fault or soil models.
Geometry QA checks closure, coordinates, nonzero area, unique vertices,
self-intersections, contextual bounds, and nested shaking footprints.

Recommendation sources were checked on 2026-11-07:

- [NWS tornado preparedness](https://www.weather.gov/safety/tornado-prepare)
- [OSHA earthquake preparedness](https://www.osha.gov/earthquakes/preparedness)
- [NWS hurricane planning](https://www.weather.gov/safety/hurricane-plan)
- [AirNow smoke readiness](https://www.airnow.gov/wildfires/be-smoke-ready/)
- [NWS winter preparedness](https://www.weather.gov/safety/winter-before)
- [NWS flood preparedness](https://www.weather.gov/safety/flood-before)

Public guidance informs the text only; agencies did not supply or endorse the
synthetic footprints. Human review is required before outreach or dispatch.
All events, households, teams, needs, and geometry are synthetic. Simultaneous
events are not historical claims, observations, or forecasts. Earthquake exercises
do not imply advance prediction. Coordinates are not residents or safe routes.

## Scale integration

Use hotspot summaries or clusters nationally, and load individual households for the selected area or viewport. Scope Spacetime subscriptions to needed data and index the relevant zone/location fields. Seed in controlled batches appropriate to the eventual module. These are integration plans: map clustering, scoped subscriptions, and batched seeding are not implemented here.

The presets verify fixture integrity; the TypeScript exposure, [priority scoring](../../backend/PRIORITY.md), and [follow-up detection](../../backend/FOLLOW_UP.md) helpers are tested against all three sizes. Backend throughput, subscription volume, browser rendering, and memory behavior require separate measurements after integration. Persisted exposure/score/flag integration, household-specific preparedness suggestions, and team recommendations remain subsequent work. Existing legacy Small seed/reset and escalation reducers do not yet use v3 impact layers.

## Backend integration

`backend/src/scenario.ts` adapts the portable source to `backend/src/schema.ts`; `backend/src/seed.ts` is used by both administrator-only `seed_demo` and controlled `reset_demo`. The default bundles the checked-in Small JSON. Source JSON/generator conventions are preserved, including source IDs, simulation labels, vulnerabilities, national framing, v2 hotspot summaries, and optional team regions. The backend stores the fields its current schema supports; it does not add these metadata fields to tables.

- IDs: sorted source IDs receive positive bigint IDs within each collection, independent of row order. Foreign keys use the same maps. This crosswalk is stable within a fixture, not across different presets. Request IDs are actually allocated by SpacetimeDB on insert (`0n`) to avoid reusing historical request IDs across resets; source request IDs are provenance in JSON, not runtime primary keys. Tasks and activities also use database IDs.
- Fields: snake_case becomes camelCase; null optional contacts/parents become `undefined`. Boundary objects become JSON strings without changing GeoJSON `[longitude, latitude]` ordering. Source `region` becomes backend `metro`; no national impact footprint is invented. Regional households retain their region.
- Time: UTC timestamps are parsed to exact microseconds (including up to six fractional digits), validated, then shifted together by reducer time minus `reference_time`. Never-contacted values remain absent; old contact/request intervals survive reset.
- Risk: moderate → 2, high → 4. Urgency: moderate → 3, urgent → 5. Status values retain their backend-compatible meaning; safe never resolves a request and unavailable teams remain unavailable.
- Needs/capabilities: shelter_support → shelter; evacuation_assistance → evacuation; smoke_support → fire_smoke_support; welfare_check and winter_weather_support retain their spelling. Generic supply_delivery → water is an explicit simulation assumption, not inferred real-world need. Unknown values fail validation.
- Missing request party size defaults to one person for the demonstration. Source team capacity counts household cases, whereas backend capacity counts people per assignment. The numeric limit is retained with this one-person-case assumption and the existing single-active-assignment rule. Real party sizes/capacity units require team review before operational use; no multi-case concurrency is introduced.
- The source has no tasks or assignments. Seed creates pending outreach tasks for never-contacted households (18 in Small); it invents no hazard advice or assignment history.

The adapter rejects duplicate/empty IDs, broken references/hierarchy, unsupported enums/geometry, malformed/future timestamps, invalid coordinates, and invalid resources before insertion. Reducer authorization/transaction rules still govern seed/reset. Regression tests exercise actual seeding, dispatch/completion, repeated reset/history/access, map compatibility, damaged copies, and generated Demo/Stress conversion. The existing Python tests retain generator integrity coverage.

Limitations: larger presets are not wired to a selectable/batched database importer and have no database/subscription/browser benchmarks. The current frontend displays neighborhoods only (48/60 Small households); the other 12 are stored in authorized views. Teams with active regional assignments are omitted from neighborhood map markers, lists, and counts; only teams without active assignments use proximity grouping. Assignment destinations are looked up across all backend households. Team region metadata and national framing remain in source rather than schema. The converter/seed still accept legacy v1/v2 only; schema v3 hazard layers and calculated exposure remain outside persisted tables. New impact rendering, decision rules, prioritization, clustering, scoped subscriptions, and browser workflow checks remain future work.
