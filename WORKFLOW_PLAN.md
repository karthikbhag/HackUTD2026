# Plan: connect disaster outreach and response routing

## Goal

Create one StateWatch journey: review an affected area → approve post-impact check-ins → review help replies and overdue households → approve a welfare-routing exercise → follow teams and outcomes → return to the same area. Make `/response` feel like part of the existing dispatcher app.

This is a restarted implementation plan based on the current code. No further application changes are part of this planning pass.

## What already exists

- `/` and `/response` use the same SpacetimeDB endpoint and endpoint-scoped browser identity through `useOperationalConnection`.
- `ConnectedWorkspace` provides shared outreach, exercise time, replies, requests and manual assistance assignments.
- `startResponseDemo` calls `createRun` with an existing zone, two welfare-capable teams and a staging point. It requires a fresh post-impact notice and starts paused.
- Welfare visits already update from check-ins, deadlines and worker progress. Dispatcher map data already includes welfare/team state.
- Team reservations prevent manual assignments and routing from using the same team concurrently.
- The response screen offers the separate Dallas fixture and picks the first non-reset run. The dispatcher links there without area/run context.

## Design decisions

Use the existing area-based routing model for the first integrated version. Employee approval reserves teams for that area's welfare exercise; explain that subsequent eligible welfare checks can enter its queue under the existing rules. Starting a run and resuming simulated movement remain explicit actions.

Keep welfare checks separate from assistance requests. A completed welfare visit records a simulated check outcome; it must not automatically resolve an assistance request or mark a household safe. Assistance assignments keep their capability/capacity checks and existing completion flow. Show both kinds of work together with distinct labels.

Keep `/demo` browser-local. The connected handoff uses current scenario records and never seeds Dallas fixture data. Keep the isolated fixture behind a clearly labeled exercise option.

## Phase 1 — Add an area-to-response handoff

In `ConnectedWorkspace`, add a response section after post-impact outreach:

- Show urgent/help replies, overdue unknown checks, completed visits and active routing state for this area.
- Offer “Set up welfare routing” when no active run exists; otherwise offer “Open area response”.
- Review the area, candidate welfare checks, two eligible teams, staging point and simulation rules before approval.
- Explain blocked states: missing post-impact notice, unsupported area size, insufficient eligible teams, reserved teams or no eligible checks. An empty queue is a valid monitoring state after approval.
- Use the existing `startResponseDemo` reducer. Revalidate eligibility on the server, not only in the form. Handle another employee starting the run first by opening the subscribed existing run.
- Navigate only after the subscription exposes the matching active run, with `/response?run=<id>&team=<id>`.

Retain the current compact-neighborhood, household-count and exactly-two-team limits in this first version. Show limits before submission. Generalizing nationwide routing is a separate change.

Acceptance: an employee can start routing from an existing area without creating fixture households, replacing scenario data or reserving a conflicting team.

## Phase 2 — Preserve context across both screens

Update `ResponseDashboard` and the route entry point to read the requested run/team. Validate IDs against authorized subscribed rows. Never silently substitute the first active run for an invalid link.

Add area/run selection when several runs exist, and retain selected run/team in the URL. Include the area name, scenario identity and a back link that restores the dispatcher area. Add matching URL initialization to the dispatcher so reloads and back links work.

Use the same subscriptions as the source of truth. Extend the response snapshot with authorized area labels as needed; do not duplicate operational state in local storage. Scope all counts, notices, scenario actions and team options to the selected run. The current response screen's first-active-run lookup must be removed.

Acceptance: two active areas stay distinct, deep links survive reload, and switching between dispatcher and response retains the selected area/team.

## Phase 3 — Show one consistent operational story

Expose the existing welfare states in the dispatcher area desk and household/team details: pending, queued, en route, in progress, completed and cancelled. Show route estimate freshness, last team update and the recorded outcome.

Audit the current synchronization paths before adding backend changes:

- Fresh safe replies cancel work that has not started; an in-progress check retains the existing completion policy and displays the safe-report notice.
- Urgent replies, deadlines and team unavailability invalidate/replan affected routes.
- Old worker leases, epochs and route versions cannot restore stale work.
- Idle teams remain reserved to an active routing run. Clearly distinguish idle-within-run from available-for-manual-assignment; reset/release removes that reservation.
- Reset of an existing-area run clears routing state without deleting original households, outreach history or unrelated requests. Fixture reset remains separate.

Add activity entries for routing approval, relevant state changes and release/reset where needed. Keep ordinary simulation ticks out of the human activity feed.

Acceptance: two browser sessions show the same household/team progress without refresh; welfare completion does not falsely close a separate assistance case.

## Phase 4 — Complete the visual integration

Reuse the dispatcher shell and existing CSS tokens: StateWatch wordmark, employee header, utility bar, Noto Sans, red accents, white bordered cards, pill buttons and matching form controls.

Organize `/response` into an area heading, concise status/count summary, team selector, route map with ordered stops, and a secondary controls/settings panel. Keep technical identity/configuration details under disclosures. Make connection, worker failure and stale-route messages visible next to the affected content.

Use readable state labels and badges with text, accessible focus states, associated form labels and clear disabled reasons. Stack panels on narrow screens and keep map/stop content usable when Google Maps is unavailable.

Some styling edits from the earlier pass already exist in the working tree. Review and reuse them; visual consistency is not yet browser-verified.

Acceptance: dispatcher and response share the same visual language at desktop/mobile widths, and the full workflow is keyboard usable.

## Phase 5 — Verify and deliver

1. Backend integration checks: existing-area start, concurrent start, team reservation conflicts, eligibility, safe cancellation, urgent replan, stale-worker rejection and non-destructive existing-area reset.
2. Frontend checks: deep-link selection, multiple runs, invalid/reset run links, run-scoped actions/counts and preserved return context.
3. Two-browser walkthrough: post-impact notice → help/overdue check → employee approval → paused run → resume → route updates → arrival/outcome → return to dispatcher → release teams.
4. Failure walkthrough: no authorization, lost connection, absent worker, invalid Google configuration, no matching teams and stale route estimates.
5. Run frontend typecheck, lint and production build on the project's supported Node version; inspect desktop/mobile rendering and keyboard navigation. Use mocked routing for deterministic checks and a separate Google Maps smoke test.

The earlier pass passed typecheck and lint with one generated-code warning. Its build attempts were blocked by the default Node 20 runtime and then a sandbox port restriction under Node 24. A production build still needs verification; these failures are not evidence that the UI is visually verified.

## Implementation order

Deliver the existing-area handoff and explicit run selection first, then shared progress presentation, then finish visual/interaction review and end-to-end acceptance. Regenerate database bindings only if the backend contract changes. Avoid a schema migration solely to connect screens when existing run/zone/household/team references suffice.

Done means an employee can complete the connected journey using existing scenario data, see matching state in a second browser, and move between consistently styled dispatcher and response screens without losing context.
