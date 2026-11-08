# Household preparedness suggestions

`src/preparedness.ts` is the restored pure, SDK-independent helper. It selects
reviewable suggestions using actual exposure, disaster phase, recorded support
flags, linked sourced templates and explicit task history. It supports all six
hazards. Geographic membership alone does not establish eligibility; customer
status does not affect selection. Response-phase layers do not produce new
preparation suggestions.

The helper retains source text, public guidance URL/catalog review date, supporting
layer/disaster IDs and readable reasons. Rules distinguish smoke/isolation
components and support-specific recommendations. Guidance is catalog content,
not fresh AI output, official warnings or an evacuation order.

Suggestions are deduplicated by scenario run + household + recommendation.
Pending, in-progress and completed tasks suppress approval in the current run.
Older-run tasks do not block a replay. The backend `approve_preparedness` reducer
rechecks eligibility, current history and expected run before inserting a pending
task. Generic legacy tasks have empty recommendation IDs, so they are not falsely
treated as named approvals. Completing preparation does not resolve assistance.

The [connected main workflow](SHARED_WORKFLOW.md) exposes suggestions through an
employee-authorized selected-household view and includes explicit approval/task
completion controls. Reset advances the run and stale approvals fail. No message
is delivered automatically.

Offline report, from the repository root:

```sh
npm --prefix backend run preparedness -- src/default-scenario.json .test-output/small-preparedness.json --summary-only --run review-1
```

Input/output paths are relative to `backend/`. Generate Demo/Stress first before
using their JSON. Optional `--history PATH` reads explicit run-scoped task history;
reports never create operational tasks. Seventeen restored pure-helper tests cover
selection, provenance, support/component rules, overlap, mixed phases, history,
replay, bigint IDs, invalid inputs and all three fixture sizes. Additional harness
and live checks exercise actual approved task creation and duplicate rejection.
