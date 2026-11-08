# Map integration handoff

Person 1: Aalvee Ahtav. The dashboard supports local UI fixtures and an optional read-only SpacetimeDB connection. It does not perform operational mutations.

## Run against the backend

Set both variables in `frontend/.env.local`, then restart Next.js (public environment values are captured at build time for production):

```dotenv
NEXT_PUBLIC_SPACETIMEDB_URI=http://127.0.0.1:3100
NEXT_PUBLIC_SPACETIMEDB_DATABASE=riskreach-local
```

With neither value set, the homepage retains its labeled fixture demo. A partial configuration reports an error. Follow `backend/README.md` to publish, seed, and enroll the public browser identity displayed below the map. An unapproved identity and an unseeded database both return empty views; the UI does not claim it can distinguish them. Tokens remain in browser local storage, scoped to endpoint and database; do not share them.

`ConnectedDashboard` owns one connection and subscribes to all seven views used by the adapter. It waits for subscription application, batches row changes after each transaction, clears displayed records on connection errors, and removes listeners/subscriptions on unmount. Reconnect replays subscriptions before data becomes ready again. Revocation removes records through the private views.

`src/lib/map/backend-data.ts` adapts generated row types. It renders neighborhood zones only, reverses GeoJSON longitude/latitude coordinates, rejects unsupported geometry, preserves bigint IDs as strings, converts timestamps, and maps risk levels 1–2/3–4/5 to moderate/high/critical. Unresolved requests supply household needs; unfinished tasks supply preparation labels. Team destinations are resolved against all backend households. An active assignment (`assigned`/`in_progress`) groups a team under its destination only when that household belongs to a displayed neighborhood. Teams assigned to regional households, or whose active destination is missing from the subscribed rows, are omitted from the neighborhood map (including its team lists and counts). Only teams with no active assignment use the nearest neighborhood centroid; cancellation/completion restores that proximity grouping. Unavailable status is preserved. These groupings are for display only. It is not exposure analysis or dispatch advice. National and metro context rows remain in the database.

## Components

- `MapDashboard`: owns hazard visibility, selection, and before/after display state.
- `DisasterMap`: browser-only Leaflet map, independently selectable polygons, household circles, and team markers.
- `DetailPanel`: zone guidance, household and team details, source/time labels, and accessible record selection.
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

`status` accepts `demo`, `loading`, `connected`, or `error`. Use `connected` only after subscriptions are applied. Only fixture mode should use `demo`. Keep operational reducers, priority queues, and dispatch controls in Person 4's components. `workflowPanel` provides a composition point for those controls. The before/after toggle still changes presentation only; it does not mutate backend phase or escalate hazards.

## Persons 2 and 3: data assumptions to reconcile

- IDs are stable strings in these view models; convert generated numeric IDs in the adapter if necessary. IDs may overlap across entity types; selection matches both kind and ID.
- `boundary` is a single polygon ring in **[latitude, longitude]** order. GeoJSON uses the reverse order; convert explicitly. MultiPolygons and holes require extending the renderer.
- Households and teams are linked to a zone by `zoneId`; household exposure is supplied by the dataset, not calculated in the UI. A team `zoneId` is a UI grouping, not a proposed database requirement.
- Timestamps are valid ISO strings or null for unknown last contact. Display uses America/Chicago with an explicit time-zone label.
- Severity: moderate/high/critical. Polygon color means hazard; dashed/thin/thick outlines mean severity. Selected zones use a heavier outline.
- Both phases display the supplied scenario geometry. The phase toggle changes guidance and preserves selection; it does not escalate a scenario or invent post-disaster observations.
- Fixtures use synthetic household names and a fixed source timestamp. The earthquake layer is a scenario, not an advance prediction.

## Map provider

Leaflet 1.9.4 with OpenStreetMap standard raster tiles and visible attribution. No API key is needed. Browsers need internet access to load the basemap. Tile failure displays a connection warning; polygons and the hotspot list still work. Review the provider's usage policy before public deployment: https://operations.osmfoundation.org/policies/tiles/.

The initial and reset views fit the contiguous United States to the canvas with padding. Resizing refits this overview until a user pans, zooms, or selects a record; subsequent resizes preserve that navigation. Pan and zoom support Alaska and Hawaii; dedicated seeded hotspots there are not included in these temporary fixtures.
