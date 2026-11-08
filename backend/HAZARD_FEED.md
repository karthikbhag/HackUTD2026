# Circular risk and continuous event updates

The connected map and authoritative decisions share the circular exposure model in
`src/risk-bands.ts`. High/Medium/Low map to critical/high/moderate internally for
compatibility with existing prioritization. Households outside all circles have
risk **None**. Existing geographic membership remains separate from exposure.
Legacy fixtures retain footprint-derived centers and extents; new event updates
use explicit centers and hazard/severity radius profiles. Profiles are modeling
assumptions, not measured hazard forecasts. Circles use 96-segment geodesic polygons;
boundary inclusion follows the existing polygon exposure predicate.

## Feed contract

`ingest_hazard_event` is admin-only. It accepts a typed `update` object for an existing
neighborhood `areaId`. This intentionally updates existing events without reseeding
households or creating a new scenario clock. A feed adapter must map its stable
provider event IDs to these existing area IDs. New event discovery/area creation
and vendor-specific adapters are not supplied by this normalized-feed worker.

Example update (all field names are camelCase):

```json
{
  "areaId": "9",
  "version": 1,
  "hazard": "tornado",
  "severity": "high",
  "longitude": -96.8,
  "latitude": 32.78,
  "observedAt": "2026-11-08T12:00:00Z",
  "expiresAt": "2026-11-08T14:00:00Z",
  "source": "Local deterministic replay",
  "dataKind": "simulation",
  "status": "active",
  "radiiMeters": [1000, 3000, 6000]
}
```

Supported hazards match the existing six types; severity is moderate/high/critical.
`radiiMeters` is optional and overrides the hazard/severity profile. Values must
increase from High to Medium to Low. `dataKind` is simulation/forecast/report.
Use increasing positive integer versions; duplicates and older versions are ignored.
Use a newer version with `status: cancelled` to cancel. Expired/cancelled layers
are excluded from exposure and connected map subscriptions; tombstones retain the
version. The existing minute decision refresh drives expiration visibility.
Feed wall-clock validity never advances the synthetic workflow clock. The existing
before/after check-in workflow remains an employee-controlled simulation even when
an event is sourced from a real feed.

## Worker

Use supported Node 22+/24+ and set server-side environment variables:
`SPACETIMEDB_URI`, `SPACETIMEDB_DATABASE`, `HAZARD_WORKER_TOKEN` (an existing
administrator identity), and `HAZARD_FEED_URL` (a normalized JSON array endpoint).
`HAZARD_POLL_MS` defaults to 30000 and must be at least 1000.

Run `npm --prefix backend run ingest:hazards` to poll, or
`npm --prefix backend run ingest:hazards -- /absolute/path/replay.json` to process
one local JSON array. HTTP failures preserve current state and retry next interval;
existing events expire according to their supplied validity. Credentials never
enter browser bundles. No live provider endpoint or worker has been activated.

## Reviewed outreach

The popup previews and edits three messages. Approval snapshots each customer's
risk band, approved text, and source layer version. None recipients are excluded.
Overlapping events retain separate memberships and selected-event risk counts.
Approval rejects an event version changed since the rendered review. Existing
single-message callers remain compatible. Approved records never change when
geometry, severity, or expiry changes; updates do not automatically send messages.
The existing one-notice-per-area/phase policy remains. New update-driven outreach
rounds and real SMS/email delivery are separate work.

## Deploy and validate

Regenerate bindings and build the module before upgrading an existing database.
Use additive, data-preserving publishing with the correct selected fixture; do not
reset or reseed the operational database. Recipient snapshot fields have defaults
for existing rows. Historical notifications therefore retain their legacy text;
legacy rows have no reconstructed exposure history.

Tests: `npm --prefix backend test`, `npm --prefix backend run typecheck`,
`npm --prefix frontend run test:scenario`, and frontend TypeScript/build checks.

## Current cloud compatibility

The checked-in frontend recipient and reply wire contracts currently match the
existing `statewatch` cloud deployment (legacy recipient fields, no reply area
argument). The upgraded backend source has not been published there. The popup
uses the legacy single-message review for this contract; its risk-specific editor
is enabled only when regenerated recipient bindings contain risk snapshots.
Do not regenerate frontend bindings from upgraded local source while pointing the
browser at the legacy cloud module. Deploy the matching backend first, then
regenerate and release the client together. This compatibility repair does not
mutate, reset, or reseed cloud data.
