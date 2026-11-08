# Shared dashboard popups

Both `/` and `/demo` now use the configured SpacetimeDB backend. The unchanged
browser-local rehearsal is available at `/demo/local`. The legacy `/outreach`
route retains its separate behavior; the new dashboard's Take action button opens
the connected notification popup directly.

## Local setup and current database

The ignored `frontend/.env.local` currently selects:

```env
NEXT_PUBLIC_SPACETIMEDB_URI=http://127.0.0.1:3100
NEXT_PUBLIC_SPACETIMEDB_DATABASE=riskreach-person3-demo
```

SpacetimeDB runs persistently on loopback port 3100, using the ignored
`.tmp/riskreach-local-server` directory. Next.js runs at http://localhost:3000.
Reuse the running processes. After a restart, from the repository root:

```powershell
spacetime start --listen-addr 127.0.0.1:3100 --data-dir .tmp/riskreach-local-server --non-interactive
```

In another terminal, with supported Node (verified with 24.22.1):

```powershell
npm.cmd --prefix frontend run dev -- --hostname localhost --port 3000
```

Open http://localhost:3000/demo. The previously enrolled browser keeps access
because endpoint, database and browser token storage are unchanged. For another
browser/private session, enroll its displayed **public employee identity** using
the publisher CLI; do not copy its token:

```powershell
spacetime call riskreach-person3-demo set_employee '"PUBLIC_IDENTITY_HEX"' true --server http://127.0.0.1:3100 --no-config
```

The main database has 10,000 households, 56 hotspots, 220 teams and 2,000 initial
help requests. The upgrade used `--delete-data=never`, added four tables and their
authorized views, and preserved the original records and both memberships. It did
not reseed or reset the user's dataset. Earlier decision and exercise schemas
were restored in source to match the already deployed module and avoid dropping
existing tables or fields during upgrade.

When publishing future updates to this Demo database, build its selected fixture:

```powershell
$env:PYTHON = (Get-Command python.exe).Source # Python 3.11+
npm.cmd --prefix backend run build:scenario -- --preset demo
spacetime publish riskreach-person3-demo --server http://127.0.0.1:3100 --js-path backend/.test-output/demo/bundle.js --delete-data=never --no-config --yes
```

Do not publish an ordinary Small bundle to the Demo database and later reset it
unless switching the selected fixture is intended. Staged fixture files remain
ignored; regenerate them per SCENARIOS.md on a fresh checkout.

## Shared state and employee actions

Four new private tables hold the global dashboard clock/run, approved per-area
notices, recipient/reply snapshots and links to actual assignments. Only enrolled
employees can read their views or submit dashboard actions. The browser's
`ConnectionLink` reuses the existing SDK connection/identity. `shared-dashboard.ts`
joins subscribed rows into the view model consumed by the existing popup design.
There is no optimistic browser-only copy of shared notices, replies or assignments.

- **Approve notice:** stores the reviewed text, current phase, send minute and
  recipient snapshot atomically. Notices are limited to 4,000 characters. Notice
  approval is not confirmed contact and delivers no external message.
- **Record simulated reply:** permits safe before impact, and safe/needs-help
  afterward, only for current recipients without an approved response unit.
  Contact and check-in fields update; existing assistance records remain intact.
  An explicit needs-help reply automatically reserves the nearest compatible
  available unit and stores its assignment/dashboard link in the same transaction.
  Routing-reserved or busy units are excluded. Without a matching unit, the reply
  and open help request remain queued; no assignment is fabricated.
- **Advance to impact:** advances the one shared clock from T−120 to T+0 across
  all areas, including those without an initial notice. The clock determines the
  active preparation/response phase.
- **Advance response time:** each second notice has its own complete 30-minute
  response window, measured from that notice's send minute. The shared clock
  advances in 30-minute steps only while a deadline is pending. Due unanswered
  cases receive reviewable welfare requests; no unit is automatically assigned.
- **Complete rescues:** advances the shared clock another 30 minutes, completes
  dashboard rescues that were active at the start of the skip, resolves their
  linked requests and releases their units. Freed matching units serve queued
  explicit help replies automatically; new rescues remain active until a later
  completion skip. Unanswered households still require manual approval. Completed
  rescues persist as history and leave the unresolved map queue. Unrelated manual
  assignments and routing visits are not completed by this action. Empty,
  unauthorized and stale-clock completion attempts are rejected.
- **Approve response unit:** requires an unanswered second notice past that area's
  deadline and validates safety exclusion, current capabilities/people capacity, availability and
  assignment conflicts. It selects the highest-urgency open request, calls the
  existing transactional assignment reducer and stores a dashboard link. Other
  unresolved needs remain recorded. The UI's local-area candidate is a suggestion,
  not a verified route; backend distance/ETA remain approximate.
- **Reset:** available to enrolled employees and administrators, with browser confirmation or the publishing CLI.
  Restores the selected fixture, advances the run and clears all dashboard rounds
  and operational assignments while preserving access and durable activity.

All dashboard actions include the run and minute from the **rendered snapshot**.
A different employee's time skip/reset makes stale actions fail with visible
feedback. Failed calls are not automatically retried. Per-area/phase uniqueness
rejects duplicate notices; concurrent assignment approvals have one winner.

## Current dashboard policy

This implementation preserves the newly merged demo's policy: a customer who
confirmed safe during preparation is excluded from repeat outreach and dashboard
response-unit review in After. A safe reply to the second notice has the same
exclusion. Confirmed-safe community records are also excluded. This carry-forward
is a **demo policy, not a new observation of post-impact safety**. It differs from
the older `/outreach` rehearsal's fresh-check-in policy.

Safety exclusions affect the dashboard/map/queue and dashboard response approval;
they never erase or automatically resolve older requests. The underlying general
assistance API keeps its original safety-versus-resolution contract. The connected
queue labels synthetic notification-deadline concerns separately from real contact
age, retains exact score reasons and supports critical exposure (default score
maximum 190). Assignment cancellation releases a unit and permits a new approval;
completion is retained as completed assistance in this dashboard run.

All households, notices, replies and assignments are synthetic. Popup notice/reply
actions trigger no real SMS/email, AI service, evacuation instruction or physical
dispatch. Area reviews separately support explicit on-demand Gemini generation
when configured; they do not run automatically with popup actions.

## Verification

`backend/src/dashboard.test.ts` covers recipient snapshots, authorization, stale
and duplicate operations, safe exclusions without lost needs, independent area
deadlines, real assignment validation/cancellation, confirmed-safe community
exclusion, reset/history/access, and queue deadline/critical-score integration.
`frontend/tests/shared-dashboard.test.cjs` covers subscription joins, bigint IDs,
run/phase separation, assignment transitions and empty/revoked state. Existing
local-rehearsal tests remain in place.

The live verifier uses the **actual frontend action wrappers, subscription adapter
and map model**, with two employee clients and an outsider, in a separate disposable
Small database. It does not mutate or reset the main Demo database:

```powershell
npm.cmd --prefix backend run build
spacetime publish riskreach-popup-live-check --server http://127.0.0.1:3100 --js-path backend/dist/bundle.js --delete-data=never --no-config --yes
spacetime call riskreach-popup-live-check seed_demo --server http://127.0.0.1:3100 --no-config
npm.cmd --prefix backend run test:popup:live
```

It verifies shared notices/replies/clock, carried-safe exclusions, preserved needs,
competing dispatch, completion/team release, reconnect using the same identity,
reset/replay, stale rejection and live revocation. Temporary test memberships are
removed in cleanup. Subsequent verifier runs start from its reset baseline; do not
seed an already seeded database.

Desktop Brave smoke verification also passed with the already enrolled browser:
Connected status, 10,000 dataset households, shared clock, live queue, area review
and the Shared simulation notification popup were visible. No notice or assignment
was submitted in the main database. Some basemap tiles failed to load; scenario
overlays, clustering and popup navigation remained usable. Full two-browser
mutation, keyboard and narrow-layout checks remain pending.
Full-table subscriptions are retained; synthetic scale checks are not production
throughput guarantees.
