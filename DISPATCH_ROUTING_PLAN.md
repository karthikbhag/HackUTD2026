# Plan: location-aware teams and live dispatch routing

## Intended behavior

An employee opens an existing disaster's **After disaster response** section and adds a response team with its current location. The team is associated with that disaster and a signed-in dispatcher. When an employee marks a household or area dispatchable, approved work enters a shared queue. The routing worker assigns each stop to one eligible team and publishes an updated route. That team's signed-in dispatcher sees the route, ordered stops, and ETAs update without refreshing.

Planning assumption: an employee approves work and manages teams; a dispatcher operates a team. A person may have both roles. For the first version, each dispatcher has one active team and each team has one assigned dispatcher. Location relevance uses the team's stored location, not the employee's browser location.

This document is a plan only. No application changes, remote updates, or merges have been performed.

## Existing implementation and gaps

- `backend/src/schema.ts` already defines teams, response runs, welfare visits, team routes, and team state. There is no dispatcher-to-team association or explicit dispatch approval record.
- `backend/src/response-routing.ts` automatically creates welfare visits from urgent/help replies and overdue check-ins. Runs require exactly two teams, a compact neighborhood, and shared scenario/exercise state.
- `backend/src/index.ts` validates worker leases, planning epochs, route versions, and team position versions when publishing plans. Keep these protections. Manual assistance assignments currently reserve an entire team and remain separate from welfare routing.
- `routing-worker/src/main.ts` already replans and publishes routes, but also advances simulated team movement and exposes route geometry through a loopback endpoint.
- `use-operational-connection.ts` already subscribes to route changes. `response-dashboard.tsx` selects a team through URL parameters rather than signed-in team membership. Existing routing views authorize employees and workers, not a separate dispatcher role.

## 1. Integrate main and confirm the shared data contract

Before implementation, preserve the current uncommitted work, fetch main, and merge it into the feature branch. Inspect the merged schema, predefined teams, disaster boundaries, authentication, and deployment settings before finalizing names or migrations.

Use the shared database as the source of truth. Do not reseed, reset, or replace predefined records. Prefer additive tables and backward-compatible defaults; test migration against a local copy of representative data. Regenerate frontend/worker bindings after schema changes.

## 2. Add team registration and dispatcher membership

Add **Add team** to the selected disaster's after-response section. Collect name, location, capabilities, capacity, availability, and assigned dispatcher. Support map placement or coordinates; device geolocation is optional. Also allow employees to associate an existing predefined team instead of creating a duplicate.

Add records for dispatcher membership and disaster deployment. Store team/disaster IDs, dispatcher identity, deployment status, service radius, location timestamp, and position version. Keep the existing team row as the authoritative current coordinates. Reserve a team for only one active deployment in this version.

Proposed initial policy: a team must be inside an affected-zone polygon or within 25 km of its boundary to deploy. Each candidate stop must also be within the team's configured 25 km service radius. Make the radius configurable, validate it on the server, and show the distance/reason in the form. Use polygon geometry rather than assuming a disaster has a single center point. Missing boundaries require an explicit employee-selected staging point; never silently use the Dallas fixture.

Only authorized employees can create teams or assign dispatcher membership. Dispatchers can update only their own team's location and availability. Derive the caller from authenticated identity. Reuse existing sign-in if main provides it; a browser-local connection token alone is not an account sign-in flow.

## 3. Make dispatch approval explicit

Add an auditable dispatch approval record: disaster, household, work type, optional request reference, priority, status, approving employee, and timestamps.

- **Household:** mark a specific welfare check dispatchable, with confirmation of the destination and priority.
- **Area:** preview eligible households and approve the listed set as individual household stops. Exclude safe households and completed/active duplicates. Store the approved set; newly eligible households require subsequent approval.
- Keep `pending`, `queued`, `in_progress`, `completed`, and `cancelled` visit states. Approval creates eligible pending work; it does not guarantee immediate assignment.
- Make repeated/concurrent approval idempotent with one active work item per disaster, household, and work type. Preserve a deliberate reopening path after completion.
- Withdraw approval by cancelling pending/queued work and requesting replanning. For work already in progress, keep the active stop and show an employee cancellation/escalation notice.

Change operational welfare synchronization so an urgent reply or missed deadline suggests work for employee review but cannot bypass approval. A safe reply cancels queued welfare work and invalidates the route; an in-progress visit gets a notice. Completing a welfare visit must not automatically resolve a separate assistance request.

First-release scope: automated routes carry welfare checks. Other assistance types retain the existing manual assignment flow and its capability/capacity checks; the UI must clearly identify which work supports routing.

## 4. Generalize routing beyond the demo

Introduce an explicit operational routing mode scoped to a disaster/deployment context. Remove the exactly-two-team, 20-household, scenario-reset, and post-impact-exercise dependencies from this mode. Permit one or more teams, with explicit workload limits and bounded worker batches. Keep the existing demo mode and fixtures isolated.

On approval, cancellation, priority change, team deployment, availability change, or material location change, update the affected planning epoch in the same transaction. The existing worker observes the change, computes road travel externally, and publishes atomically through the existing lease/version checks.

Filter candidate team/stop pairs by active disaster deployment, service radius, fresh location, availability, capability, remaining shift time, and conflicting assignments. Revalidate eligibility when accepting the worker plan. Optimize across eligible teams rather than assigning every stop to the nearest team independently. Assign each stop once, preserve in-progress work, and limit unnecessary reassignment of queued stops.

Proposed timing: debounce ordinary changes for at most 5 seconds; prioritize urgent approvals immediately. Display planning progress and publication time. Proposed stale-location threshold: 5 minutes; exclude stale teams from new work and show a warning until their location is refreshed. These are initial configurable defaults, not guaranteed routing latency.

Operational mode updates positions from dispatcher-submitted coordinates and uses explicit start/complete actions. Disable simulation movement and automatic visit completion in this mode. Plan ETAs against real elapsed time. Out-of-range, unavailable, unreachable, or over-capacity work remains visibly unassigned with a reason.

## 5. Deliver the signed-in dispatcher's live route

Default `/response` to **My team**, resolving team identity from authenticated membership. Employees retain an authorized overview of all teams. A URL parameter may navigate to an authorized route but cannot grant access to another team's data.

Add dispatcher-scoped views/subscriptions for their membership, deployment, route, relevant visits, and required household details. Keep employee and worker access appropriate to their roles. Apply the same authorization to route geometry delivery: the current localhost endpoint is insufficient for shared remote clients. Provide an authenticated geometry service reachable by dispatchers, with geometry tied to the published route version and epoch.

Refresh ordered stops, ETAs, and map geometry from published route versions. Reject late geometry responses and preserve the last published route while clearly showing that an update is pending or failed. Reconnecting should load the latest committed route and location state. Show explicit states for no assigned team, no deployment, no approved work, planning, stale location, unavailable worker, and unassigned work.

## Implementation sequence

1. Merge/reconcile main; confirm shared data and authentication; prepare additive migrations.
2. Implement team registration, deployment, dispatcher membership, and authorized location updates.
3. Implement household/area approval, deduplication, withdrawal, and employee UI.
4. Add operational routing mode, location eligibility, dynamic team counts, and worker triggers.
5. Add My team subscriptions, route UI, authenticated geometry access, and operational visit actions.
6. Verify with existing seeded data in an isolated environment before publishing to the shared database.

## Acceptance checks

- An employee adds a nearby team or deploys an existing predefined team without modifying unrelated seeded records. Invalid coordinates and an out-of-range deployment are rejected.
- Dispatcher A sees team A's route after sign-in; dispatcher B sees team B's route. Changing the URL or directly requesting geometry cannot expose the other route.
- Approving one household updates one eligible team's route without a page reload. A remote or unrelated-disaster team receives no stop.
- Area approval previews and queues the intended households once, including under repeated or concurrent submissions.
- Unapproved urgent/overdue households never enter operational routes. Withdrawal and safe replies remove queued welfare work; in-progress work remains explicit.
- Team movement, stale locations, unavailability, and manual-assignment conflicts trigger correct reassessment without duplicate assignment or stale-plan acceptance.
- Dispatcher reconnects and worker restarts recover current committed state. Worker/provider failure shows pending work and an error rather than a fabricated route.
- Operational teams never move or complete visits through simulation ticks. Existing demo and manual assistance flows still work.

Use targeted reducer/solver tests for authorization, approval idempotency, geographic eligibility, and stale-plan rejection. Verify the complete employee-to-dispatcher flow with separate signed-in browser sessions, including a far-away team, and measure approval-to-route publication latency.
