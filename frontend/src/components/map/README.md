# Map integration handoff

Person 1: Aalvee Ahtav. This dashboard is a local UI prototype; it does not connect to SpacetimeDB or perform operational mutations.

## Components

- `MapDashboard`: owns hazard visibility, selection, and before/after display state.
- `DisasterMap`: browser-only Leaflet map, independently selectable polygons, household circles, and team markers.
- `DetailPanel`: zone guidance, household and team details, source/time labels, and accessible record selection.
- `src/lib/map/types.ts`: frontend view models, separate from generated database bindings.
- `src/lib/map/demo-data.ts`: disposable fictional UI fixtures for six continental U.S. hotspots. These are not Person 3's authoritative dataset or exposure calculations.

## Person 4: connect the shared client

From a client integration component, adapt subscription rows to `MapData`, then pass:

```tsx
<MapDashboard
  data={mapData}
  status={connectionStatus}
  errorMessage={connectionError}
  workflowPanel={<OperationalWorkflow />}
/>
```

`status` accepts `demo`, `loading`, `connected`, or `error`. Use `connected` only after the real shared connection is established. Only the fixture-backed starter page should use `demo`. Keep operational reducers, priority queues, and dispatch controls in Person 4's components. `workflowPanel` provides a composition point for those controls.

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
