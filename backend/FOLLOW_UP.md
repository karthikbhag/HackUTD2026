# Overdue-contact and overlooked-case handoff

Person 3 task 5 is implemented by `detectFollowUp` in `src/follow-up.ts`. It is a
pure TypeScript helper using the same inputs and explicit microsecond clock as
the priority helper. It performs no SDK calls, persistence, automatic dispatch,
outreach, or system-clock reads. All thresholds are **demo assumptions requiring
employee review**, not validated emergency-response rules.

## Distinct states

| Result | Meaning |
| --- | --- |
| `needsFollowUp` | One or more unresolved concerns exist, regardless of recent contact |
| `contactState` | `never_contacted`, `overdue`, or `recent` under the selected threshold |
| `contactOverdue` | Contact is missing or at least the threshold age, even if no concern exists |
| `overlooked` | Both `needsFollowUp` and `contactOverdue` are true |

Filter the overlooked queue with **`overlooked`**, not `contactOverdue` alone.
A safe household without requests or qualifying exposure concerns is not flagged
overlooked just because its contact history is absent or old. Results retain all
households, including those with no concerns or cleared flags.

## Default eligibility and thresholds

Concerns are independent and have readable explanations plus request/layer IDs:

- `unresolved_requests`: any open, assigned, or in-progress request. A safe
  check-in or a team assignment does not resolve assistance needs.
- `check_in_need`: a `needs_help` or `urgent` check-in, independent of requests.
- `unconfirmed_exposure`: unknown safety and at least one high-severity matching
  impact layer. The minimum severity is configurable.
- `vulnerable_exposure`: unknown safety, some exposure below that minimum, and
  recorded vulnerability flags. This fallback can be disabled. Any nonempty
  recorded flag qualifies conservatively, including a flag with no priority
  weight; the explanation lists it for review. No exposure is inferred from a
  household's geographic membership alone.

Standard contact threshold is **360 minutes (six hours)**. It shortens to
**60 minutes** when check-in is urgent or an active request has urgency **4 or 5**.
Thresholds are inclusive: one microsecond before the boundary is recent; exactly
at the boundary is overdue. Never-contacted means immediately contact-overdue,
without inventing a time since contact. There is no implicit initial grace period.

`FollowUpConfig` controls the two time thresholds, urgent-request cutoff, minimum
exposure severity, vulnerable-exposure fallback, and assumption label. Positive
whole-minute thresholds up to one year are supported; urgent must not exceed
standard. A separate optional `PriorityConfig` controls ranking only. Flagging
does not depend on a numerical priority score. Customer status is not read.

## Flag transitions

| Change | Result after recomputing |
| --- | --- |
| Record contact now | Contact becomes recent and `overlooked` clears; unresolved concerns remain |
| Resolve a request | That request stops contributing; other requests/check-in/exposure concerns remain |
| Mark safe | Check-in/exposure-only concerns clear; unresolved requests remain |
| Assign a team or start work | Request remains unresolved; old contact can still flag the case |
| Advance the explicit clock | Previously recent concerns can become overlooked |
| Remove qualifying exposure | Exposure concern clears; request/check-in concerns remain |

Urgency and the selected contact threshold are recomputed from current inputs.
For example, resolving the only urgent request can restore the standard threshold
if no urgent check-in remains. Recording contact does not certify safety, resolve
requests, or remove the household from all follow-up work.

## Results, counts, and ordering

Each household retains its priority result plus `concerns`, contact explanation,
threshold, and the states above. All matching exposure evidence is preserved.
Households stay in the existing stable priority order; filtering overlooked rows
preserves that ordering. String and bigint IDs are supported without Number
conversion. Unknown/duplicate source IDs, missing exposure coverage, invalid
statuses, invalid config, and future contacts fail validation.

`followUpHouseholds` and `overlookedHouseholds` count unique households.
`byConcern` counts **overlooked households** by each reason. A household with two
concerns contributes to both reason counts, but only once to the unique total;
do not sum reason counts for an overall total. Assumptions for detection and
priority are copied into the report.

## Offline report

The shared `scenarioPriorityInputs` adapter supplies normalized inputs from v3
fixtures. Clock is `reference_time`; no wall-clock dependency is introduced.
From the repository root:

```sh
python data/scenarios/generate.py --preset demo --seed 2026 --output data/scenarios/generated/demo.json
python data/scenarios/validate.py data/scenarios/generated/demo.json
npm --prefix backend run follow-up -- ../data/scenarios/generated/demo.json ../data/scenarios/generated/demo-follow-up.json
python data/scenarios/generate.py --preset stress --seed 2026 --output data/scenarios/generated/stress.json
npm --prefix backend run follow-up -- ../data/scenarios/generated/stress.json ../data/scenarios/generated/stress-follow-up.json --summary-only
```

Paths passed through npm are relative to `backend/`. Output directories must
exist. Full reports contain all evaluated households. Summary mode still
evaluates everyone, but writes only the first 25 overlooked rows plus full counts
and assumptions. Output is ignored by Git.

For the default synthetic Stress fixture, 69,433 of 100,000 households retain
concerns, and 57,997 are overlooked. This reflects authored fixture patterns and
demo thresholds, not actual disaster prevalence or a live operational finding.

## Verification and integration

Seventeen tests cover time boundaries, fresh contact, request resolution,
independent concerns, safe check-ins, assignment, exposure/vulnerability policy,
custom thresholds, priority-weight independence, clock advancement, counts,
customer neutrality, stable ordering, bigint IDs, invalid data, and Small/Demo/
Stress evaluation. Every preset includes a seeded unresolved case that clears its
overlooked flag after contact while retaining its assistance need.

Recompute after contact, check-in, request, exposure, vulnerability, clock, or
configuration changes. The pure helper remains a snapshot calculation. [Live integration](SHARED_WORKFLOW.md) now stores compact summaries, refreshes after mutations and on a private schedule, and exposes selected-case concerns plus queue filtering. A separate explicit synthetic deadline detects unanswered post-impact rounds independently of old contact freshness.
