# Map integration handoff

Person 1: Aalvee Ahtav. The dashboard supports local UI fixtures and an shared SpacetimeDB connection. `ConnectedWorkspace` now provides authoritative decisions and employee-reviewed mutations in the main scenario desk; `/demo` remains local. The scenario desk rehearses notification approval, check-in replies, time skips, and welfare-check assignments in fixture demo mode using browser-local state only.

## Current presentation — v1.20

The frontend is branded StateWatch. **Disaster watch** appears above a red count of visible area alerts with unresolved, unassigned households; this is a loaded-data count, not a priority score. Overview, Households, Teams, and Preparedness navigation sits at the top of the review panel rather than in the app header. `layout.tsx` loads Noto Sans through `next/font/google` with normal and italic variable styles; global controls, notification textareas, map labels, and markers share the font token. The first uncached build needs access to Google Fonts.

Person 1 owns this presentation and the browser-local popup rehearsal. Person 4 coordinates the remaining authoritative operational wiring with Person 2, using Person 3's tested helpers; local demo controls do not complete shared-state integration.

## Dashboard popup preview

- Keep **Disaster prep** and **After disaster respond**. The response view unlocks when the explicit dashboard time skip reaches impact; preparation then becomes a history view.
- An alert opens `AreaReviewDialog`; **Take action** opens `NotificationDialog` in place, without navigating. Review/edit the initial notice, approve it, and simulate safe replies. Close the popup to skip time on the dashboard.
- Safe confirmations remove households from repeat outreach, the map, and the response queue, including when an older need is recorded. Response-unit approval also rejects confirmed-safe households. The After tab carries forward unconfirmed households and community cases that still need assistance. Original need records are retained. Carried-forward safety is a demo queue policy, not a fresh post-impact observation.
- Reopen the alert and send a second notification only to unconfirmed customers. **safe** and **need help** replies become available. Help requests are reviewable immediately; unanswered second notices become eligible after their own 30-minute deadline.
- `dashboard-scenario.ts` validates recipients and replies, maintains rounds per area and a shared fictional clock, matches local available teams by capability and positive capacity, and prevents duplicate assignments/team reuse. `MapDashboard` projects this state onto fixture markers, counts, and team availability. No subscribed records are changed.
- Closing popups and switching areas/tabs preserve state. Reloading, leaving the dashboard, or resetting clears it. Connected area previews remain read-only; the shared scenario desk supplies authoritative decisions, outreach and employee-reviewed dispatch.
- TypeScript, all 16 scenario tests, and the Webpack build passed; `/demo` returned HTTP 200. Browser visual, keyboard, and responsive verification remain pending.

For the isolated 10,000/100,000-household flow, use the [local scenario runbook](../../../../backend/SCENARIOS.md).

## Run against the backend

Set both variables in `frontend/.env.local`, then restart Next.js (public environment values are captured at build time for production):

```dotenv
NEXT_PUBLIC_SPACETIMEDB_URI=http://127.0.0.1:3100
NEXT_PUBLIC_SPACETIMEDB_DATABASE=riskreach-local
```

With neither value set, the homepage retains its labeled fixture demo. A partial configuration reports an error. Follow `backend/README.md` to publish, seed, and enroll the public browser identity displayed below the map. An unapproved identity and an unseeded database both return empty views; the UI does not claim it can distinguish them. Tokens remain in browser local storage, scoped to endpoint and database; do not share them.

`ConnectedDashboard` owns one connection and subscribes to all eight views used by the adapter. It waits for subscription application, batches row changes after each transaction, clears displayed records on connection errors, and removes listeners/subscriptions on unmount. Reconnect replays subscriptions before data becomes ready again. Revocation removes records through the private views.

`src/lib/map/backend-data.ts` uses indexed joins and retains all households. Actual
`zoneId` stays intact; `hotspotId` groups each region/neighborhood pair for filtering
and inspection. Regional membership is explicit. Active teams retain their resolved
destination grouping, including regional destinations; missing destinations are
omitted. Only unassigned teams use nearest-centroid display grouping. No dispatch
or exposure recommendation is inferred.

Dataset totals, neighborhood/regional membership, and hazard-filter matches are
separate. Leaflet MarkerCluster indexes all filtered household locations, merges
crowded circles with exact location counts, and splits them as users zoom in.
Cluster clicks fit their member bounds; coincident locations spiderfy at maximum
zoom. Individual circles use the same hazard colors as the filters and clusters, retaining selection and tooltips. Team
markers remain visible at zoom 9+. Details use the complete filtered model and household lists page 50 rows.
Context outlines and explicit synthetic hazard footprints are separate layers;
footprint details retain overlapping components, provenance and severity basis.
Default Small now includes ten explicit footprints; the legacy fixture remains unchanged for compatibility tests. Counts are never labeled as affected.

## Components

- `MapDashboard`: State Farm themed readiness overview; owns hazard visibility, selection, before/after display state, and household/team/guidance browsing. Summary counts derive from visible records. The default household review list includes non-safe check-ins or reported needs, ordered by urgent/needs-help/unknown/safe status; this is not the pending backend priority score. Quick actions and review-panel navigation switch the household/team/guidance views. Fixture mode also owns the local popup rehearsal; connected map browsing stays read-only while the workflow panel supplies operational actions. Household and team browsing pages 50 records at a time; changing hotspots resets the keyed detail panel. Dataset totals and filtered membership counts remain distinct from hazard exposure.
- `DashboardIcon`: shared code-native outline icons for summary metrics and workspace navigation.
- `DisasterMap`: browser-only Leaflet map, independently selectable polygons, household circles, and team markers.
- `AreaReviewDialog` / `AreaBrief`: centered area review with a scoped map and paged evidence. `AiAreaReview` (Person 4) renders the review section: scenario guidance plus an on-demand **Generate AI Review** button that posts a small snapshot to `/api/area-review`; it stays mounted while the evidence view is open. Demo dashboard Take action opens `NotificationDialog`; connected/older outreach contexts retain navigation. Final viewport-fit and keyboard/browser acceptance remain pending.
- `NotificationDialog` / `src/lib/map/dashboard-scenario.ts`: same-dashboard notification review, reply simulation, and response-unit approval with dashboard-owned state.
- `OutreachDashboard` / `OutreachRoute`: selected-area outreach page without a map; preserves demo versus connected mode and handles unavailable areas.
- `ScenarioWorkspace` / `src/lib/map/scenario-demo.ts`: browser-local time skips, phase-specific replies, attention filtering, and welfare-check rehearsal; never mutates subscribed data.
- `DetailPanel`: selected-record inspector within the review panel; zone guidance, household and team details, source/time labels, and accessible record selection.
- `src/lib/map/types.ts`: frontend view models, separate from generated database bindings.
- `src/lib/map/demo-data.ts`: disposable fictional UI fixtures for six continental U.S. hotspots. These are not Person 3's authoritative dataset or exposure calculations.

## Person 4: extend the shared client

The shared connection is implemented in `connected-dashboard.tsx`. `ConnectedWorkspace` reuses it for operational controls through the `renderWorkspace` composition point; no second connection/identity is created. The map still supports the existing `workflowPanel` composition point:

```tsx
<MapDashboard
  data={mapData}
  status={connectionStatus}
  errorMessage={connectionError}
  workflowPanel={<OperationalWorkflow />}
/>
```

`workflowPanel` may also be a function `({ selection, onSelect }) => ReactNode`. The dashboard still owns selection state; Person 4's priority queue uses this to highlight a household on the map. Passing a plain node still works.

`status` accepts `demo`, `loading`, `connected`, or `error`. Use `connected` only after subscriptions are applied. Only fixture mode should use `demo`. Keep operational reducers, priority queues, and dispatch controls in Person 4's components. `workflowPanel` provides a composition point for those controls. The before/after toggle still changes presentation only; it does not mutate backend phase or escalate hazards.

## Persons 2 and 3: data assumptions to reconcile

- IDs are stable strings in these view models; convert generated numeric IDs in the adapter if necessary. IDs may overlap across entity types; selection matches both kind and ID.
- `boundary` is a single polygon ring in **[latitude, longitude]** order. GeoJSON uses the reverse order; convert explicitly. MultiPolygons and holes require extending the renderer.
- Households retain actual `zoneId`; `hotspotId` supplies geographic display grouping. Exposure is not calculated in this UI. Team grouping is not a dispatch recommendation.
- Timestamps are valid ISO strings or null for unknown last contact. Display uses America/Chicago with an explicit time-zone label.
- Context boundaries are dashed and unfilled; explicit impact footprints are filled in the hazard color with qualitative severity. Selected context outlines become heavier.
- Both phases display the supplied scenario geometry. The phase toggle changes guidance without advancing time or inventing post-disaster observations. Demo views additionally filter the household queue according to recorded rehearsal replies and exclude confirmed-safe households from response-unit review even with older needs; changing phase clears selection.
- Fixtures use synthetic household names and a fixed source timestamp. The earthquake layer is a scenario, not an advance prediction.

## Map provider

Leaflet 1.9.4 with OpenStreetMap standard raster tiles and visible attribution. No API key is needed. Browsers need internet access to load the basemap. Tile failure displays a connection warning; polygons and the hotspot list still work. Review the provider's usage policy before public deployment: https://operations.osmfoundation.org/policies/tiles/.

The initial/reset views include Alaska and Hawaii; the large presets supply hotspots there. The minimum zoom is the US fit zoom for the current canvas dimensions and overlay padding; maxBounds is recalculated for the viewport and zoom to keep its center within the US extent without shifting padded region fits. Sidebars are outside the canvas, so their widths are not subtracted again. Status and tile-warning overlays reserve bottom padding. Resizing refits the last selected region, cluster, or overview until the user navigates. Geometry and the cluster index remain mounted across selection changes. Browser acceptance and production build limitations are recorded in the scenario runbook.

## Older area popup and outreach page

The following describes the retained standalone `/outreach` route. The `/demo` dashboard now uses the popup preview above instead of navigating to this route.

Open `/outreach?area=dallas&mode=demo` directly for the older fixture rehearsal. Its **Review area details** button opens the area-review popup. The retained popup component opens an area-review modal with a map focused on the selected area, severity, evidence, and scenario guidance with an on-demand AI review. The compact popup uses a side-by-side layout on wider screens and a smaller map on narrow screens; its actions remain separate from the content. Evidence replaces the summary and pages through shapes instead of expanding the popup. Final visual fit verification remains pending. Escape, the close button, or the backdrop dismisses the modal and restores focus. Choose **Take action** to navigate to `/outreach?area=<id>&mode=demo` (or `mode=connected` for subscribed data). The outreach page focuses on preparation controls and households needing attention, without a map. Use Back to national map for geographic context; the attention filter can be disabled to review safe replies. In fixture mode, approve a preparation notice, simulate safety confirmations (unanswered customers remain No reply), skip two hours to impact, approve a fresh check-in, and skip 30 minutes to reveal unanswered cases. Help requests can receive an employee-approved simulated welfare-check unit immediately; unanswered cases require the deadline. A safe pre-impact reply remains history and does not answer the post-impact check-in. Matching uses an available local welfare-check team with positive capacity; duplicate local assignments are prevented. Resetting, leaving the outreach page, or switching areas clears the rehearsal. Connected outreach uses the existing authorized subscription connection, lists unresolved household records, and leaves operational mutations disabled. Unknown or inaccessible area IDs show an unavailable state.

AI area reviews are generated by Gemini only when an employee clicks **Generate AI Review**, are labeled AI-generated (and Simulation where applicable), and are text suggestions only. Fixture impact bands are invented and do not establish measured household exposure. The connected outreach route shows evidence and read-only details without enabling rehearsal actions. Nothing is delivered, dispatched, persisted, or synchronized by this local demo. The connected main desk provides shared decisions and employee-reviewed mutations on the existing connection.

Run `npm run test:scenario` from `frontend/` for all 16 tests: nine dashboard-popup flow regressions and seven retained standalone-outreach regressions. TypeScript and all 16 tests passed. The Webpack production build passed after the Noto Sans integration. A local `/demo` request returned HTTP 200 earlier in this contribution; full interactive browser and connected-backend checks remain pending.

## Connected main desk — v1.18

`MapDashboard.renderWorkspace` composes `ConnectedWorkspace` for the selected hotspot using the same SDK connection. It supplies a paged priority queue, selected-case evidence, reviewed tasks and dispatch, and a persisted/shared scenario clock with separate reply rounds. Subscriptions are cleaned up when selection changes. The `/demo` dashboard uses the browser-local popup rehearsal. See [setup and verification](../../../../backend/SHARED_WORKFLOW.md).
