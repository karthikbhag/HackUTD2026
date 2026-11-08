# Map integration handoff

Person 1: Aalvee Ahtav. The dashboard supports local UI fixtures and an optional read-only SpacetimeDB connection. It does not perform operational mutations. The scenario desk rehearses notification approval, check-in replies, time skips, and welfare-check assignments in fixture demo mode using browser-local state only.

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
Legacy Small has no explicit footprints. Counts are never labeled as affected.

## Components

- `MapDashboard`: State Farm themed readiness overview; owns hazard visibility, selection, before/after display state, and household/team/guidance browsing. Summary counts derive from visible records. The default household review list includes non-safe check-ins or reported needs, ordered by urgent/needs-help/unknown/safe status; this is not the pending backend priority score. Quick actions navigate these read-only views. Household and team browsing pages 50 records at a time; changing hotspots resets the keyed detail panel. Dataset totals and filtered membership counts remain distinct from hazard exposure.
- `DashboardIcon`: shared code-native outline icons for summary metrics and workspace navigation.
- `DisasterMap`: browser-only Leaflet map, independently selectable polygons, household circles, and team markers.
- `DetailPanel`: selected-record inspector within the review panel; zone guidance, household and team details, source/time labels, and accessible record selection.
- `src/lib/map/types.ts`: frontend view models, separate from generated database bindings.
- `src/lib/map/demo-data.ts`: disposable fictional UI fixtures for six continental U.S. hotspots. These are not Person 3's authoritative dataset or exposure calculations.

## Person 4: extend the shared client

The read-only connection is implemented in `connected-dashboard.tsx`. Extend that shared connection for operational controls rather than creating a second connection/identity. It adapts subscription rows to `MapData` and passes:

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
- Both phases display the supplied scenario geometry. The phase toggle changes guidance and preserves selection; it does not escalate a scenario or invent post-disaster observations.
- Fixtures use synthetic household names and a fixed source timestamp. The earthquake layer is a scenario, not an advance prediction.

## Map provider

Leaflet 1.9.4 with OpenStreetMap standard raster tiles and visible attribution. No API key is needed. Browsers need internet access to load the basemap. Tile failure displays a connection warning; polygons and the hotspot list still work. Review the provider's usage policy before public deployment: https://operations.osmfoundation.org/policies/tiles/.

The initial/reset views include Alaska and Hawaii; the large presets supply hotspots there. The minimum zoom is the US fit zoom for the current canvas dimensions and overlay padding; maxBounds is recalculated for the viewport and zoom to keep its center within the US extent without shifting padded region fits. Sidebars are outside the canvas, so their widths are not subtracted again. Status and tile-warning overlays reserve bottom padding. Resizing refits the last selected region, cluster, or overview until the user navigates. Geometry and the cluster index remain mounted across selection changes. Browser acceptance and production build limitations are recorded in the scenario runbook.

## Scenario desk rehearsal

Open `/demo` to rehearse independently of any configured database connection. Select an area using its map information icon or the hotspot picker, then open the scenario desk below the map. In fixture mode, approve a preparation notice, simulate customer replies, skip two hours to impact, approve a fresh check-in, and skip 30 minutes to reveal unanswered cases. Help requests can receive an employee-approved simulated welfare-check unit immediately; unanswered cases require the deadline. A safe pre-impact reply remains history and does not answer the post-impact check-in. Matching uses an available local welfare-check team with positive capacity; duplicate local assignments are prevented. Resetting or switching areas clears the rehearsal.

AI area reviews are explicitly labeled source-based previews; no AI provider is connected. Fixture impact bands are invented and do not establish measured household exposure. Connected mode shows evidence and read-only details without enabling rehearsal actions. Nothing is delivered, dispatched, persisted, or synchronized by this local demo.

Run `npm run test:scenario` from `frontend/` to verify round separation, follow-up timing, urgent-help dispatch eligibility, safe-response exclusion, duplicate assignments, and reset behavior.
