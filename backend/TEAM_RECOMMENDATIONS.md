# Team recommendation handoff

Person 3 task 7 is implemented in `src/team-recommendations.ts`. It is an
SDK-independent advisory helper: it reads a supplied snapshot and never assigns,
reserves, contacts, or changes a team. Employee approval and the existing
transactional `assignTeam` reducer remain mandatory for dispatch.

## Eligibility contract

A request must be `open` with no active assignment. Assigned, in-progress, and
resolved requests are blocked. An active assignment also blocks a request whose
status incorrectly still says open; blocked requests do not assess teams.

An eligible team must satisfy every existing backend rule:

- Status is `available`.
- No `assigned` or `in_progress` assignment uses that team, even when spare
  capacity remains or team status incorrectly says available.
- Capabilities include the exact request need type.
- Capacity in **people per assignment** is at least the request's party size.

One active assignment per team is allowed. Capacity is not a shared pool and is
not reduced by subtracting people from existing assignments. Completed/cancelled
assignments do not block a team, but an unavailable/assigned/responding status
still does. Customer status, household check-in status, home zone, state, and
disaster type do not override eligibility.

Supported need strings are `food`, `water`, `shelter`, `welfare_check`,
`evacuation`, `claims_support`, `fire_smoke_support`, and `winter_weather_support`.
Missing capabilities and insufficient capacity are exclusions, not fuzzy matches.

## Distance, ETA, and explanations

Eligible teams rank by raw Haversine straight-line kilometers, using Earth radius
6,371 km to match the dispatch reducer. Exact distance ties sort by ascending ID,
without locale comparisons. IDs may be strings or bigints and are never coerced
through Number. Rounding for display must not change the eligibility/rank order.

Approximate ETA is `distanceKm / assumedSpeedKmh * 60`. Default speed is **30
km/h**, matching the reducer. A caller may supply a positive finite speed up to
300 km/h as a labeled demo assumption. The current reducer still records 30 km/h;
changing recommendation speed does not change its behavior. Zero distance yields
zero approximate ETA; this excludes preparation/loading time.

These are not road routes, verified travel times, safe access assessments, or
evidence that water/roads/bridges are passable. No routing, traffic, road closure,
vehicle-mode, or mobilization data is used. Distant teams remain candidates if
eligible; no unstated service-area limit is imposed.

Each recommendation includes matching capability/capacity explanations, raw
distance, approximate ETA, and `requiresHumanApproval: true`. Exclusion codes are
`unavailable`, `active_assignment`, `missing_capability`, and
`insufficient_capacity`. Optional detail includes every applicable reason and
active assignment IDs per excluded team. A team may have multiple reasons, so do
not sum reason counts to obtain the unique excluded-team total.

## API and snapshot lifecycle

```ts
const recommender = createTeamRecommender(households, requests, teams, assignments);
const report = recommender.recommend(requestId, {
  limit: 5,
  includeExcludedTeams: true,
});
```

Normalize validated backend string statuses to the helper's status unions at the
caller boundary. Only coordinates/IDs are needed from households. Requests need
party size; no silent party-size default is applied by the core helper. Duplicate
IDs, broken references, invalid coordinates/resources/statuses/options fail
validation. Even terminal assignment references must exist in this snapshot.

The constructor validates and copies inputs once; reuse it for many requests.
Rebuild after request, team, location, assignment, or speed changes. Previously
returned recommendations are never reservations: another employee may assign a
team before dispatch, and the reducer must reject that conflict transactionally.

Results distinguish request blockers, evaluated teams, eligible/excluded counts,
exclusion counts, recommendations, and omitted eligible teams. Default limit is
five, configurable from 1 to 100. Eligible teams beyond top-K are **omitted**, not
excluded. Detailed exclusions default off. Blocked requests assess zero teams;
zero counts then do not mean every team was checked and found unsuitable.

The calculation scans teams per request but retains only top-K candidates.
Process reports individually rather than keeping an all-requests/all-teams result
matrix. The tests evaluate all 20,000 Stress requests against 1,970 teams without
retaining such a matrix. This is synthetic correctness coverage, not a database,
subscription, browser, or operational throughput guarantee.

## Fixture adapter and report

`src/team-recommendations-scenario.ts` uses the shared `scenarioNeed` mapping
already used by the backend converter. Source IDs remain strings. Generic
`supply_delivery` becomes `water`; other conversions are unchanged. Source
fixtures omit party sizes, so this adapter explicitly defaults each to **one
person** and reuses source household-case capacity numerically, matching the
existing seed's demo assumption. Initial assignments are empty. This is not a
claim that household-case and people capacity are interchangeable in real data.

The adapter validates only dispatch-relevant inputs through the recommender;
it does not import display geometry or require team region metadata. In
particular, generated Small v3 lacks the team region metadata required by the
full display converter. The display converter's existing validation is unchanged.
Validate generated fixture geometry separately when needed.

From the repository root:

```sh
python data/scenarios/generate.py --preset stress --output data/scenarios/generated/stress.json
npm --prefix backend run recommend-teams -- ../data/scenarios/generated/stress.json ../data/scenarios/generated/stress-teams.json tornado-request-000001 --include-excluded --limit 5 --speed 30
```

Use `tornado-request-1` with the legacy Small fixture. Paths passed through npm
are relative to `backend/`; output directories must exist. Reports are ignored
by Git. CLI request selection uses source IDs; report IDs remain source strings.
Programmatic module use can pass existing bigint database IDs directly.

For the default Stress fixture's first tornado request, 138 teams are eligible
and 1,832 excluded; the report shows five nearest teams. The nearest distance is
approximately 0.542 km, with a 1.084-minute constant-speed ETA. These figures
describe synthetic coordinates and a one-person request, not real travel advice.

## Verification and integration limits

Eighteen tests cover capability/capacity, all unavailable statuses, active and
terminal assignment behavior, blocked requests, stable ties/top-K, Haversine
edge cases, custom speed, immutable snapshots, customer neutrality, bigint IDs,
empty results, invalid inputs, all requests in Small/Demo/Stress, and actual
dispatch/cancellation/completion through the module test harness. Reducer
distance/ETA values agree with recommendations at the default speed.

[Live integration](DECISIONS.md) now provides authorized selected-request recommendation views and explicit team selection in the connected UI. The assignment reducer revalidates current state transactionally; recommendations never reserve teams. Two-client competing dispatch is checked against disposable local databases. Interactive browser acceptance remains pending.
