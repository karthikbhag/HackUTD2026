import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import type db from './schema';
import { adaptScenario, source } from './scenario';

// Seed and reset share the checked-in Person 3 dataset; no filesystem/network at runtime.
export function seed(ctx: ReducerCtx<InferSchema<typeof db>>) {
  const rows = adaptScenario(source, ctx.timestamp);
  rows.disasters.forEach(row => ctx.db.disaster.insert(row));
  rows.zones.forEach(row => ctx.db.zone.insert(row));
  rows.households.forEach(row => ctx.db.household.insert(row));
  rows.teams.forEach(row => ctx.db.responseTeam.insert(row));
  // Let SpacetimeDB allocate IDs so old activity history cannot alias new requests.
  rows.requests.forEach(row => ctx.db.helpRequest.insert({ ...row, id: 0n }));
  // The source has no tasks. Add explicit demo outreach, not invented hazard advice.
  rows.households.filter(row => row.lastContactAt === undefined).forEach(row => {
    ctx.db.preparednessTask.insert({ id: 0n, zoneId: row.zoneId, householdId: row.id, actionType: 'outreach', status: 'pending', createdAt: ctx.timestamp, completedAt: undefined });
  });
}
