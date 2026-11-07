# Person 2 — backend completion plan

Aligned with main README commit `39893be` (2026-11-07): nationwide multi-hazard MVP with tornado, earthquake, hurricane, wildfire, blizzard, and flood layers. Preserve the national → metro → neighborhood hierarchy; demonstrate the full workflow on one hotspot while retaining all six supported layers.

1. Deliver the shared TypeScript schema, indexes, generated bindings, and employee authorization. Implemented; build/type and authorization checks recorded in the changelog. Coordinate exact enums and geometry with Persons 1, 3, and 4 before they build against it.
2. Provide reproducible fixtures across all six hazards and controlled reset. Implemented as sparse synthetic integration data. Replace/refine geometry and data with Person 3's reviewed fixtures; preserve the reducer/data contract.
3. Implement check-ins, outreach/tasks, help requests, atomic assignment lifecycle, validation, and durable activity history. Implemented. Keep safety separate from assistance resolution and dispatch subject to employee confirmation.
4. Support individual hazard escalation and concurrent operations. Implemented. Verify one hazard's escalation does not change other layers; exercise conflicting dispatch with two live clients.
5. Integrate Person 3's authoritative priority/reason, overlooked-case, exposure, preparedness, and team recommendation logic when supplied. Pending; do not describe those rules as already implemented. Use explicit hazard modifiers and demo thresholds agreed by the team.
6. Pair with Person 4 for the shared connection, identity enrollment, subscription readiness/errors, and UI actions. Generated bindings and local commands are ready; actual browser map/queue/action integration remains pending.
7. Complete the root README's browser acceptance checks with the team. Datastore and live SDK checks support backend behavior but do not establish that the placeholder UI passes them.
8. Before the user commits/pushes, update README checkboxes and the next changelog entry with actual verification and known gaps. No automatic commits or pushes; all work stays on `josh/person-2-spacetime-backend`.
