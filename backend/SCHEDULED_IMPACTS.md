# Scheduled simulation impacts

Each hazard in a broad US region (Northeast, Midwest, South, West) has one
shared impact time. The same hazard in different regions has independent times.
`src/event-schedule.ts` maps fixture state codes and narrative area names into
these regions and allocates distinct 15-minute schedule slots to hazard/region
pairs. These are rehearsal timings, not real forecast timestamps.
The adapters expose `MapZone.impactMinute` and `MapZone.impactRegion`.
The upcoming list groups hotspots by hazard/region and expands into local areas.
Renumbering an event or adding another hotspot in its region does not shift times.


The Prep and After buttons filter one map. Both remain accessible. An impacted
event leaves Prep; pending events still support preparation notices and safe
replies. Notification phase and response authorization are checked against the
selected event on the server. Overlapping households may appear under both
filters when exposed to different events; notice rounds stay scoped by event.

The impact skip jumps to the next scheduled impact. Notification deadline and
rescue skips advance 30 minutes, also transitioning any events due in that window.
All skips process overdue follow-ups. Reset restores the clock to T−120.

## Shared deployment

The changed `dashboard_state` view includes `scheduled_impacts`; regenerate client
bindings together with the backend. Older backends cannot safely serve this UI.
Publish the matching Demo bundle to keep resets at 10,000 households:

```sh
npm --prefix backend run build:scenario -- --preset demo
spacetime publish statewatch --server maincloud --js-path backend/.test-output/demo/bundle.js --delete-data=never --no-config --yes
```

Publishing changes the shared module for everyone. Do not seed or reset the live
database as part of publication. Existing records, memberships and notice history
are retained. Review the current shared clock before resuming: existing runs use
the new schedule at their current minute, rather than replaying past notices.
