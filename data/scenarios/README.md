# Repeatable nationwide scenario datasets

Person 3's portable source data supports the map and future Spacetime seed reducer. It is not yet connected to the app or loaded into a database. Python 3.11+ is needed only for generation and validation, with no dependencies.

## Presets

| Preset | Hotspots | Households | Teams | Open requests | Purpose |
| --- | ---: | ---: | ---: | ---: | --- |
| Small | 6 | 60 | 12 | 12 | Original quick fixture, schema v1 |
| Demo | 56 | 10,000 | 220 | 2,000 | Recommended national demonstration, schema v2 |
| Stress | 56 | 100,000 | 1,970 | 20,000 | Performance experiments, schema v2 |

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

Large JSON outputs live in ignored `generated/`; regenerate locally rather than adding them to Git. `--output` writes UTF-8 directly, avoiding shell redirection differences. Without it, JSON goes to standard output. The default is `--preset small`, which preserves the original fixture and does not use the seed. Validate the original with `python data/scenarios/validate.py`.

Same generator version, preset, seed, and Python runtime produce identical data. Changing the seed retains IDs but varies coordinates, later contacts, customer flags, vulnerabilities, and team capacities. Changing presets changes record counts. Do not mix fixtures in one database without a controlled seed/reset implementation.

## Contract and handoff

- Schema v2 adds `generation`, `hotspots`, and regional `zone_id` on teams. The fixture version is independent of the changelog version. Existing collection field conventions remain intact.
- IDs are stable strings unique within each collection. `disaster_id`, `parent_zone_id`, `zone_id`, and `household_id` are foreign keys. Infer a zone's hazard through its disaster. The selected narrative hotspot remains `tornado-neighborhood`.
- V2 hotspots identify state, disaster, neighborhood, dense-demo flag, and household/request/team totals. These summaries describe the initial fixture, not live operational counts; recompute them from authoritative tables after changes.
- Boundaries are GeoJSON Polygon geometry in **longitude, latitude** order. Household/team coordinates are explicit fields. Rectangles are placeholders for task 2's hazard-specific geometry. The validator's rectangular containment check is not runtime exposure logic.
- Fixed UTC ISO 8601 times are relative to `2026-11-07T12:00:00Z`. Convert to backend timestamps during import. A future reset should shift times together relative to its scenario clock. Null contact time means never contacted.
- Phase starts at `preparedness`; requests represent pre-existing exercise needs. Each hotspot retains an urgent non-customer request, a safe household with an unresolved supply request, vulnerable/never-contacted/older-contact examples, and available/unavailable teams. Customer status must not determine assistance priority.
- Team capacity means maximum simultaneous household cases. Teams number `max(2, households // 50)` per hotspot, with capacities between 2 and 8 and no initial assignments. Request volume intentionally exceeds immediate team capacity in dense hotspots. Capability matching and remaining capacity still require backend logic.
- Capabilities/needs are `shelter_support`, `welfare_check`, `evacuation_assistance`, `smoke_support`, `winter_weather_support`, and `supply_delivery`. Vulnerability flags are `limited_mobility` and `transport_needed`. These conventions and IDs require reconciliation with Person 2's final module schema and Person 1's temporary frontend fixtures.

All events, households, teams, needs, and geometry are synthetic. Simultaneous events are not historical claims, observations, or forecasts. Earthquake exercises do not imply advance prediction. Coordinates are not geocoded residents or safe dispatch routes.

## Scale integration

Use hotspot summaries or clusters nationally, and load individual households for the selected area or viewport. Scope Spacetime subscriptions to needed data and index the relevant zone/location fields. Seed in controlled batches appropriate to the eventual module. These are integration plans: map clustering, scoped subscriptions, and batched seeding are not implemented here.

The presets verify fixture generation and integrity only. Backend throughput, subscription volume, browser rendering, and memory behavior require separate measurements after integration; generating 100,000 rows does not prove application performance. Priority, exposure, preparedness suggestions, recommendations, escalation, and database reset remain subsequent work.
