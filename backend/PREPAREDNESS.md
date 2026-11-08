# Household preparedness suggestion handoff

Person 3 task 6 is implemented by `suggestPreparedness` in
`src/preparedness.ts`. It is a pure TypeScript helper using existing sourced
catalog text, actual household exposure, recorded support needs, disaster phase,
and explicit task history. It creates **reviewable suggestions**, not tasks,
messages, dispatches, or post-disaster assistance instructions.

## Selection and reasons

Suggestions require a matching exposure layer linked to a catalog recommendation
and a disaster in `preparedness` phase. Response-phase layers are ignored even
when the same household also matches preparedness-phase disasters. Geographic
membership alone never establishes eligibility. Customer status is not read.

Default demo policy:

| Recommendation | Additional condition beyond exposure |
| --- | --- |
| Tornado shelter plan | None |
| Tornado accessible shelter | Mobility or transport support flag |
| Earthquake readiness / falling-object review | None |
| Hurricane evacuation information | None |
| Hurricane transport planning | Mobility or transport support flag |
| Wildfire cleaner-air planning | Matching smoke component specifically |
| Wildfire local alerts | Any matching wildfire component |
| Blizzard supplies | Any matching blizzard component |
| Blizzard isolation check | Isolation component or a support flag |
| Flood preparedness | None |
| Flood access planning | Mobility or transport support flag |

Support flags default to `limited_mobility` and `transport_needed`; duplicates
are removed. Unknown flags do not invent support-specific advice. General
recommendations remain available based on exposure. Policy rules, support flags,
and the assumption label are configurable; every supplied template needs an
explicit recognized eligibility rule.

Each suggestion preserves the catalog title, description, guidance URL/review
date, and source label. It adds supporting layer/disaster IDs, relevant recorded
support flags, and readable selection reasons. `requiresHumanReview` is always
true. Templates without that requirement fail validation. The helper reuses the
12 existing templates; it does not claim fresh verification of their guidance or
agency endorsement of the synthetic scenario.

## Deduplication and task history

There is at most one suggestion for each **scenario run + household +
recommendation ID**. Multiple qualifying layers or same-hazard disasters combine
their evidence into that suggestion. Different hazard recommendations remain
distinct; similar wording is not sufficient to merge safety guidance.

Supply task history as:

```ts
{
  id: 'task-1',
  householdId: 'tornado-household-000001',
  scenarioRunId: 'exercise-run-2026-11-07-a',
  recommendationId: 'tornado-shelter_plan',
  status: 'completed', // also pending or in_progress
}
```

A matching pending, in-progress, or completed task suppresses a candidate in
the current run. The result records its task IDs/statuses in `suppressed`, making
the omission explainable. Task history for another household/recommendation does
not suppress this one. Old-run history does not block a new run. Current-run
references and duplicate task IDs are validated. No expiry or automatic repeat
after severity escalation is assumed within a run.

Use a unique, durable run ID for each real demonstration/replay. A fixture's
stable `scenario_id` is not a unique replay ID. The offline adapter defaults to
that fixture ID only for reproducible local reports; pass a run explicitly when
using task history across resets. Backend tasks now store `scenarioRunId` and `recommendationId`; migration defaults retain generic legacy tasks without falsely treating them as approved recommendations. The approval reducer validates the expected current run and rechecks eligibility before inserting a pending task. Reset advances the run ID.

## Inputs, results, and integration

`suggestPreparedness` accepts the run ID, households, disasters, layers,
one exposure record per household, templates, optional history, and optional
policy. Record IDs may be source strings or backend bigints; recommendation/run
IDs are strings. Keep all record IDs in one source/backend convention.

The helper validates joins between exposure, layer, disaster, and template,
including hazard/component consistency. Missing exposure coverage fails rather
than silently producing no advice. It never recomputes exposure from context
rectangles. Use `calculateExposure` first, or an equivalent authoritative snapshot.

Output includes every input household, its suggestions and suppressed candidates,
unique household count with suggestions, total suggestions/suppressions, run ID,
and a copy of the policy. Rows and recommendation/evidence IDs are sorted
deterministically. Unexposed or response-only households have no suggestions.
Counts of suggestions are not counts of unique households.

Recompute after exposure, phase, support flags, catalog, policy, or history
changes. No clock or I/O is used. `src/preparedness-scenario.ts` provides the pure
schema-v3 fixture adapter. [Live integration](DECISIONS.md) now includes stored run/recommendation identity, authorized selected-household views, approved task creation, current-history recomputation, and connected task controls. Interactive browser acceptance remains pending. Recommendations do not resolve existing assistance.

## Offline report

From the repository root:

```sh
python data/scenarios/generate.py --preset demo --output data/scenarios/generated/demo.json
python data/scenarios/validate.py data/scenarios/generated/demo.json
npm --prefix backend run preparedness -- ../data/scenarios/generated/demo.json ../data/scenarios/generated/demo-preparedness.json --summary-only --run review-1
```

Add `--history TASKS.json` to read an array in the history format above. Paths
passed through npm are relative to `backend/`; output directories must exist.
Without `--summary-only`, reports contain all households. Summary mode evaluates
everyone and writes the first 25 households with suggestions, plus complete
counts/policy. Ordering is by household ID, not operational urgency. Reports are
ignored by Git and never create operational tasks or perform outreach.

## Verification

Seventeen tests cover exposure-only selection, sourced content/review flags,
support eligibility, smoke/isolation rules, overlapping layers/disasters/hazards,
mixed phases, task suppression and replay, household/run isolation, customer
neutrality, stable output, bigint IDs, empty data, invalid joins/policies/history,
and all six hazards across Small, Demo, and Stress.

The default synthetic Stress report generates 150,940 suggestions for 82,184 of
100,000 households. CLI checks suppress two completed recommendations in the
same run and restore them in a new run. These are authored scenario results,
not real-world hazard findings or database/browser performance measurements.
