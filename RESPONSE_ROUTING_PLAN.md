# After-disaster response routing implementation plan

## Approved scope

Build a configurable demonstration of two simulated welfare-check teams serving 20 fictional households in one compact affected neighborhood. Automatically plan and update routes. Show Google road routes only on the response-team screen; retain the existing Leaflet dispatcher map for household status and team positions. Teams do not transport people. Notification delivery and customer check-in entry are outside this work; integrate with the existing status update.

Deliver a practical, priority-aware heuristic, not a claim of globally optimal routing. Use Google Routes API for road travel estimates and directions, not Route Optimization API. No OAuth setup is needed for this chosen API-key approach.

## Findings in the current codebase

- `backend/src/schema.ts` already stores household coordinates/status, response-team coordinates/capabilities, requests and assignments. Assignments require a help-request ID; unknown households need not have requests.
- `backend/src/index.ts`: `assignTeam` permits only one active assignment per team and applies a people-capacity check. `updateCheckIn` changes status without cancelling dispatch. `updateAssignment` cancellation reopens the request. These semantics cannot directly represent a multi-stop welfare-check queue.
- `backend/src/team-recommendations.ts` supplies advisory straight-line recommendations, not road routing. Preserve it for existing manual request workflows.
- `backend/src/priority.ts` provides configurable priority explanations. Reuse appropriate reason labels, but do not substitute its weighted score for the new urgent-first routing policy.
- `frontend/src/components/map/connected-dashboard.tsx` owns the authenticated connection and transaction-batched subscriptions. Extend/reuse its connection lifecycle rather than introducing duplicate browser identities.
- `frontend/src/lib/map/backend-data.ts` currently derives team destination grouping from active request assignments. It must also understand the current welfare-check visit.
- `frontend/src/app/page.tsx` is the current dashboard entry; there is no response-team route screen yet.
- Read `frontend/AGENTS.md` and the installed Next.js guides before implementation. Regenerate module bindings; never edit generated files manually.

## 1. Configuration and credentials

Create a shared, pure configuration module, proposed `shared/response-routing-config.ts`, consumed by the backend module, routing worker, tests and frontend adapters. Verify cross-package compilation in the first slice; avoid SDK or Node imports in this shared module.

Defaults:

```ts
{
  householdCount: 20,
  teamCount: 2,
  shiftMinutes: 120,
  visitMinutes: 5,
  returnToStaging: true,
  priorityPolicy: 'urgent-first',
  urgentTargetMinutes: 30,
  ordinaryReplanDebounceMs: 5000,
  travelRefreshSeconds: 120,
  simulationTickMs: 1000,
  simulationSpeed: 10,
  solverTimeBudgetMs: 250,
  maxProviderRetries: 2
}
```

The 30-minute urgent target and 10x playback are proposed initial defaults, not response guarantees. Store staging coordinates and selected neighborhood in a fixture, never as nationwide constants. Validate positive durations, bounds, supported policies and fixture size. Keep all time units explicit.

Persist a per-demo-run config snapshot and version. Add a small admin settings panel for visit length, shift length, playback speed, response target and ordinary replan delay. Other values remain editable in the config module. Saving operational settings invalidates the plan. Changing household/team count restarts the isolated demo rather than silently changing a running scenario. Active visit duration remains fixed at its start; new durations apply to subsequent visits. Pause/speed changes preserve the simulated clock.

Use `frontend/.env.local` for the Next.js server's `GOOGLE_MAPS_API_KEY`. Add `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` for the response screen's Maps JavaScript API. Use separate restricted keys: server key restricted to Routes API, browser key restricted to Maps JavaScript API and approved HTTP referrers. Enable billing and both APIs. Do not commit values or print them. Document quota settings and an API-call budget.

The separately running Node worker does not automatically load Next.js `.env.local`. Give it an explicit documented environment-loading step using the same file, or its own ignored env file. Its SpacetimeDB service identity/token must also be supplied server-side and enrolled for routing operations. No Google account credentials need to be shared in chat.

## 2. Add a dedicated welfare-check queue

Extend `backend/src/schema.ts` with:

- `response_run`: selected disaster/neighborhood, staging location, config snapshot/version, lifecycle status, simulated clock anchor, playback speed, planning epoch and current plan version.
- `welfare_visit`: run/household IDs, priority class, eligible-since time, state (`pending`, `queued`, `en_route`, `in_progress`, `completed`, `cancelled`), assigned team, sequence, estimated arrival, service duration and outcome. Enforce one nonterminal visit per household per run in reducers.
- `team_route`: run/team IDs, version, generation status/time, ordered visit IDs, return ETA, stale/error indicator and provider provenance. Keep Google content only as permitted; do not make durable polyline history.
- `response_team_state`: run/team IDs, position timestamp/version, mode, current visit, current leg progress and availability. Continue updating `response_team.latitude/longitude` so the existing map receives movement.
- Worker lease/owner and expiry, either on `response_run` or a dedicated table. Restrict lease acquisition and plan publication to authorized routing identities.

Use a dedicated visit queue instead of fabricating help requests for unknown households. Welfare checks use capability `welfare_check`; passenger capacity is irrelevant. A team serving an existing manual request assignment is unavailable for the new queue. Manual dispatch must reject a team with an active welfare route, so the two workflows cannot double-book it.

Status adapter: `urgent` and `needs_help` become the urgent routing class; `unknown` becomes the unknown class; `safe` is excluded. Keep the original status in the UI. A completed check has an explicit outcome and does not automatically mark the household safe. An unresolved outcome stays visible for dispatcher follow-up without creating an immediate endless revisit loop.

## 3. Atomic lifecycle reducers and views

Implement helpers in `backend/src/response-routing.ts` and export reducers/views from `backend/src/index.ts`:

1. `startResponseDemo`: create the isolated run, selected fixture, two capable teams and initial visits.
2. `updateResponseSettings`: validate, version and invalidate the plan as appropriate.
3. `claimRoutingLease` / `renewRoutingLease`: one worker owns a run; use an increasing fencing token so an expired owner cannot publish.
4. `publishResponsePlan`: check lease token, input planning epoch and config version; validate household eligibility, unique stops, team eligibility and shift bounds; atomically replace future queues and increment route versions.
5. `advanceResponseSimulation`: accept only monotonic sequence/position updates from the owning worker. Check route version before movement, arrival or completion. Start and finish visits with the simulated clock.
6. `pauseResponseDemo`, `resumeResponseDemo`, `setResponseSpeed`, `resetResponseDemo`: preserve memberships and unrelated nationwide scenarios. Reset only this run and its fixture records; bump run generation to reject late work.

Extend `updateCheckIn` in the same transaction: safe cancels all pending/queued/en-route welfare visits, clears cancelled current destinations and increments the planning epoch. An in-progress check remains active with a visible cancellation/safe-report notice until acknowledged or completed. Keep unrelated food/claims/etc. requests intact. Reopening to unknown/urgent creates or reactivates eligibility once, idempotently, under the run policy.

Every relevant change invalidates the planning epoch. GPS/simulation ticks update position versions separately so constant movement does not starve plan publication. Bind each proposed route to an origin position version; before committing a moving team's new first leg, refresh it from the latest position and briefly hold that team's simulated movement until the version-checked publication completes. Future real GPS would need an analogous origin reconciliation policy.

Add authorized views for run/config, visits and routes. For the demo, reuse employee enrollment and a team selector; label it as a demo role view rather than claiming production team-lead access control. If team-specific accounts are introduced later, add an identity-to-team mapping and filter views accordingly.

## 4. Google adapter and priority-aware solver

Add a long-running Node process under `routing-worker/`, with its own package scripts, Google adapter, pure solver, coordinator and simulator. A persistent worker is necessary; do not depend on a browser tab or a long-running Next.js request to keep simulation alive.

Implement `TravelProvider` with `matrix(points, departureTime)` and `directions(origin, orderedStops, staging)`. Production-demo adapter calls Google Routes API over HTTPS with narrow field masks, timeouts, bounded retries and matrix element error handling. A deterministic fixture adapter is for tests and an explicitly labelled offline demonstration only.

Build a directional driving-time matrix for the selected households, current team positions and staging. Twenty households + two positions + staging yields at most 23 x 23 = 529 elements, before removing unnecessary pairs. Batch requests according to the selected routing mode's current limits; `TRAFFIC_AWARE_OPTIMAL` has a smaller matrix limit than ordinary driving requests. Never treat a missing/unreachable matrix element as zero or substitute straight-line distance silently.

Solver sequence:

1. Preserve in-progress work and the next en-route stop unless cancelled, unreachable or preempted by a new urgent case. Start the remaining horizon at each team's current position/time, including residual active service time.
2. Collect eligible visits only in this run's affected neighborhood; exclude safe/completed/cancelled visits and teams occupied elsewhere.
3. Insert urgent visits across all feasible team/sequence positions first. Respect residual shift time, five-minute service and required return travel. Prefer earlier urgent arrivals; mark targets that cannot be met.
4. Insert unknown visits by lowest feasible added travel/service time, using eligible-since time as the tie-breaker. Do not insert unknown visits ahead of urgent stops on the same team's route under the default policy. A team with no assigned urgent stops may check unknown households while another team serves urgent cases.
5. Run bounded relocation, swap and 2-opt improvements. Compare whole plans lexicographically: more urgent visits covered, fewer urgent target misses, lower total urgent wait, more unknown visits covered, fewer unnecessary assignment changes, lower travel time. Deterministic ID tie-breaks make playback repeatable.
6. Return unassigned visits with reasons: unreachable, no eligible team, insufficient remaining time, or planning failure. Do not hide them.

This is a heuristic. It protects urgent work and seeks good coverage, but cannot promise maximum coverage. Validate against exact enumeration for very small synthetic cases and a nearest-next baseline, not by claiming every heuristic result is globally optimal.

Call Compute Routes for each selected team sequence with waypoint reordering disabled; Google's stop reordering must not undo our priority policy. Request leg times, distances and polylines. Revalidate the actual route's timing, service times and return feasibility; remove lowest-priority optional stops and recalculate if directions differ materially from matrix estimates. A temporarily infeasible urgent stop remains visible for escalation. Keep the full default route within the current 25-intermediate-waypoint limit.

Google source references: https://developers.google.com/maps/documentation/routes/compute_route_matrix ; https://developers.google.com/maps/documentation/routes/usage-and-billing ; https://developers.google.com/maps/documentation/routes/opt-way . Confirm current quotas and content-storage rules during adapter implementation. Keep provider-derived data short-lived and avoid durable matrix/polyline caches.

## 5. Real-time coordination

The worker subscribes to authorized run/household/visit/team state and coalesces events after each transaction. Use one in-flight solve per run plus a dirty flag; new events supersede old results.

- Safe reports invalidate actionable destinations atomically, independently of Google latency.
- Urgent escalation and cancelled current destinations trigger an immediate solve.
- Ordinary edits debounce for five seconds; periodic travel refresh runs every two minutes of wall time while running. Simulated shift/visit/priority time uses the simulated clock, not wall time.
- Movement alone does not request a new matrix every second. Reuse only allowed short-lived estimates, refresh current-origin legs for relevant replans, and refresh traffic periodically.
- If a solve finishes against an old planning epoch, discard it and solve the newest snapshot. Never publish an old plan that resurrects a safe stop.
- On Google failure, keep valid existing legs and mark ETAs stale. Cancelled legs stay cancelled. If no valid leg remains, hold the simulated team in place while retrying; do not animate toward a cancelled house.
- On lease loss, the old worker stops simulation and publication. Reconnection reads the durable run and resumes once, without duplicate completions.

## 6. Local fixture and simulation

Create `data/scenarios/response-routing-demo.json` with 20 clearly fictional households in a compact Dallas-area neighborhood, two teams, and a nearby staging point. Include safe, urgent and unknown initial states. Select real drivable road-access coordinates for route requests; do not reuse arbitrary nationwide household points or imply that actual residents requested help. Verify endpoints snap reasonably to roads before the presentation.

Seed both teams at staging in the same area; after starting, they follow distinct assigned routes. They must not appear at unrelated national hotspots. Restrict routing to the selected run/area, not whichever rows happen to be loaded on the nationwide map.

Simulator behavior:

- Decode route leg polylines and interpolate movement by travelled segment length over the corresponding leg duration. Avoid jumping directly between houses.
- Advance position each second at configurable 10x speed. At arrival, transition to in-progress; dwell for five simulated minutes; record the configured demonstration outcome and continue.
- Pause freezes the simulated clock, movement and visit timers. Resume/speed changes use a new clock anchor without jumping backward or skipping completions.
- Current-destination cancellation freezes the cancelled leg, replans from the last committed position and starts the replacement leg without teleporting to the old origin.
- Include deterministic scenario actions: report a queued household safe, cancel a current destination, escalate an unknown household, and make a team unavailable. Do not automatically script real customer notifications.

## 7. UI integration

Dispatcher remains on `/` using Leaflet. Extend the shared connection/subscription layer and `backend-data.ts` so markers show simulated positions and current welfare destination grouping, with the existing assignment grouping as fallback. Show counts of pending urgent/unknown checks, unassigned reasons, route-update status and last location time. Do not put Google road polylines or Google-derived route details on the Leaflet view.

Add `/response` with components under `frontend/src/components/response/`:

- `response-dashboard.tsx`: selected run/team, controls, route status and ordered stops.
- `team-route-map.tsx`: client-only Google Maps view with own household/team markers and selected team's route. Load the Maps JavaScript SDK once; handle missing key/load failure explicitly.
- `team-stop-list.tsx`: priority, visit state, ETA, next destination and cancellation notice.
- `simulation-controls.tsx`: start/pause/reset/speed and scenario actions.
- `routing-settings.tsx`: validated configurable rules and units.

Reuse/extract the current connection setup into a provider/hook shared by the page shells. Use one connection per mounted app shell, keeping the existing endpoint/database-scoped identity. Google keys or SDK failures must not prevent the stop list or safety cancellation messages from rendering.

Pass route geometry only to the Google response screen. Follow Google display/attribution and storage policies. Google Maps page selection is presentation for this simulation, not production authentication.

## 8. Delivery slices and verification

Slice A — configuration and isolated fixture: add validated defaults, per-run clock/config and area-scoped seed/reset. Verify 20 households/two local teams and unchanged nationwide scenarios.

Slice B — backend queue: add schema/lifecycle, mutually exclusive manual dispatch, immediate safe cancellation and version-checked publication. Regenerate bindings and add transactional reducer tests.

Slice C — routing: implement the worker/provider, matrix handling, deterministic solver and route timing validation. First use the fixture adapter, then verify Google with the configured server key. No need for Route Optimization API or service-account OAuth.

Slice D — response screen: Google map, selected team stops, subscriptions, settings and error/loading states. Dispatcher still uses Leaflet.

Slice E — simulation: clock, road-following movement, dwell, playback controls and scripted safety/escalation actions. Add worker start instructions and a single-command development convenience script if useful.

Slice F — acceptance: run meaningful tests for stale optimizer responses, duplicate workers, duplicate household assignment, safe while en-route, safe while in-progress, urgent preemption, return-to-staging feasibility, unreachable routes, team unavailable, pause/resume and reset during a solve. Verify both teams move in the same neighborhood and no movement tick calls Google.

Run existing backend typecheck/tests/build, regenerate bindings, and run frontend typecheck/lint/build. Read the installed Next.js route/environment guides before adding pages or server functionality. Use small exact reference cases to assess solver behavior and a representative two-team fixture to compare urgent wait/coverage/travel against nearest-next routing.

Presentation acceptance: start the demo; show two team routes; mark a future unknown household safe and see immediate cancellation; cancel an active destination and see rerouting from the current position; escalate another household and see urgent prioritization; pause and change visit duration; resume without duplicate work; show unassigned explanations and final visit totals. Clearly label simulated locations and estimated ETAs throughout.

## Inputs still needed to run Google-backed acceptance

- A Routes API-enabled server key in the ignored environment file.
- A Maps JavaScript API-enabled browser key with localhost/demo-domain referrer restrictions.
- An enrolled worker identity and browser identity in the local SpacetimeDB instance (setup can be scripted during implementation).

No live team GPS, team-lead login flow, additional operating-rule decisions or Google Cloud account sharing are required for this scope.
