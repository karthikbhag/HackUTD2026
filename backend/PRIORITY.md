# Priority scoring handoff

Person 3 task 4 is implemented in `src/priority.ts`. `rankHouseholds` is a pure,
SDK-independent TypeScript helper. It scores all supplied households and returns
their ranking, six itemized reasons per household, exposure evidence, unresolved
request/need counts, contact age, and a snapshot of the configuration used.

These are **demo assumptions requiring employee review**, not a trained model,
validated emergency triage system, or automatic dispatch instruction.

## Default weights

| Factor | Points | Rule |
| --- | ---: | --- |
| Strongest active request | 5 / 10 / 20 / 35 / 50 | Urgency 1 / 2 / 3 / 4 / 5; maximum, not sum |
| Distinct unresolved needs | 5 each, at most 15 | At most three distinct need types contribute |
| Check-in | 0 / 0 / 10 / 20 | Unknown / safe / needs_help / urgent |
| Exposure | 0 / 15 / 30 | None / moderate / high; highest matching layer once |
| Vulnerability | 15 per configured flag, at most 30 | `limited_mobility`, `transport_needed` |
| Contact age | 0 / 5 / 15 / 25 | Less than 60 / at least 60 / at least 360 / at least 1,440 whole minutes |
| Never contacted | 30 | Replaces the contact-age contribution |

The score is the sum of the six reason contributions, ranging from 0 to 175 with
the default weights. An illustrative urgent safe household with one unresolved
urgency-5 water request, no exposure/vulnerabilities, and recent contact scores
55 (50 urgency + 5 need). “Safe” does not resolve the request or reduce its score.

`open`, `assigned`, and `in_progress` requests remain active. `resolved` requests
contribute neither urgency nor need breadth. Resolving a request does not clear
check-in, exposure, vulnerability, or contact-age factors; their evidence changes
independently. Duplicated need types contribute once. Duplicate request IDs fail
validation. Duplicate vulnerability flags contribute once; unknown flags receive
zero points and an explicit explanation identifying them for review.

Overlapping layers remain in evidence, but only maximum severity contributes
points. All hazard types are treated equally at equal severity: no undocumented
hazard multiplier, modeled flood depth, or inferred smoke intensity is added.
Customer status is absent from the scoring contract and is never inspected.

Sort order is descending score, descending strongest active urgency, oldest
recorded contact (never-contacted first), then ascending ID. Sorting uses no
locale and preserves bigint IDs. Equal scores do not imply equal real-world need.

## Programmatic API

```ts
import { rankHouseholds, DEFAULT_PRIORITY_CONFIG } from './priority';

const report = rankHouseholds(
  households.map(h => ({
    id: h.id,
    checkInStatus: h.checkInStatus,
    vulnerabilityFlags: h.vulnerabilityFlags,
    lastContactAtMicros: h.lastContactAt?.microsSinceUnixEpoch,
  })),
  requests,
  exposureReport.households,
  ctx.timestamp.microsSinceUnixEpoch,
  DEFAULT_PRIORITY_CONFIG,
);
```

Normalize backend string statuses to the helper's status union at the caller's
validated boundary. Household, request, disaster, and layer IDs must use the same
source/backend ID convention as the exposure input. No conversion through Number
is needed for IDs or timestamps. The explicit clock is a nonnegative i64 UTC
microsecond value; future/invalid contact times are rejected. One exposure result
is required per household, including empty evidence for unexposed households.
Missing evidence must not silently lower a score.

Supply a complete `PriorityConfig`, usually by spreading
`DEFAULT_PRIORITY_CONFIG` and replacing fields, to change weights/caps/contact
tiers. The result includes a copy of that configuration. Weights must be bounded
nonnegative integers; urgency and exposure weights cannot decrease with severity,
and contact tiers must have increasing thresholds and nondecreasing points.

The function scores **all** input households; it does not establish queue
eligibility, overdue/overlooked flags, or suggested actions. Consumers must retain
their workflow-specific filters and should never treat low/zero score as proof
that a household needs no assistance. Recompute after request, check-in, exposure,
contact, vulnerability, clock, or configuration changes. Results are snapshots.

## Offline report

`src/priority-scenario.ts` adapts validated schema-v3 fixtures, mapping source
moderate/urgent requests to urgency 3/5, preserving microsecond timestamps, and
using `reference_time` as the scoring clock. It calls the exposure helper first.
This is separate from the existing legacy v1/v2 seed converter.

From the repository root:

```sh
python data/scenarios/generate.py --preset demo --seed 2026 --output data/scenarios/generated/demo.json
python data/scenarios/validate.py data/scenarios/generated/demo.json
npm --prefix backend run priority -- ../data/scenarios/generated/demo.json ../data/scenarios/generated/demo-priority.json
npm --prefix backend run priority -- ../data/scenarios/generated/stress.json ../data/scenarios/generated/stress-priority.json --summary-only
```

Generate Stress first before its command. Paths passed through npm are relative
to `backend/`; the output directory must exist. Full reports include every row.
`--summary-only` still scores every household, but writes only the top 25 plus
the total count and assumptions. Generated reports are ignored by Git.

## Verification and integration limits

Tests cover score arithmetic/explanations, customer neutrality, safe-but-unresolved
cases, escalation, resolution, assignment independence, caps/deduplication,
contact-tier boundaries, custom configuration, stable ties, invalid inputs,
bigint IDs, and every household in Small/Demo/Stress.

No schema, seed source, reducer, binding, or frontend queue is changed. Existing
seed/reset still use v1, and the current database converter accepts v1/v2 only.
Persisted impact/exposure/scoring relations, authenticated views, live
recomputation, and browser rendering remain integration work. Overdue-contact
flags are now available through the separate [follow-up helper](FOLLOW_UP.md).
Preparedness suggestions are now available through the separate [preparedness helper](PREPAREDNESS.md). Team recommendations remain a subsequent Person 3 task.
