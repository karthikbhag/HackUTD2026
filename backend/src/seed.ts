import { Timestamp } from 'spacetimedb';
import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import type db from './schema';

// Integration fixture; Person 3 owns the final scenario geometry and decision rules.
export function seed(ctx: ReducerCtx<InferSchema<typeof db>>) {
  const polygon = (west: number, south: number, east: number, north: number) => JSON.stringify({ type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] });
  const hotspots = [
    { type: 'flood', name: 'Houston', lat: 29.76, lon: -95.37, need: 'water', action: 'flood_preparation' },
    { type: 'tornado', name: 'Oklahoma City', lat: 35.47, lon: -97.52, need: 'shelter', action: 'shelter_in_place' },
    { type: 'earthquake', name: 'Los Angeles', lat: 34.05, lon: -118.24, need: 'evacuation', action: 'infrastructure_check' },
    { type: 'hurricane', name: 'Miami', lat: 25.76, lon: -80.19, need: 'evacuation', action: 'evacuation_preparation' },
    { type: 'wildfire', name: 'Sacramento', lat: 38.58, lon: -121.49, need: 'fire_smoke_support', action: 'smoke_protection' },
    { type: 'blizzard', name: 'Minneapolis', lat: 44.98, lon: -93.27, need: 'winter_weather_support', action: 'winter_preparation' },
  ];
  hotspots.forEach((spot, i) => {
    const disasterId = BigInt(i + 1), nationalId = BigInt(100 + i);
    ctx.db.disaster.insert({ id: disasterId, name: `Synthetic U.S. ${spot.type} exercise`, type: spot.type, phase: 'preparedness', source: 'Simulated hackathon fixture — not a forecast or advance earthquake prediction', isSimulated: true, updatedAt: ctx.timestamp });
    ctx.db.zone.insert({ id: nationalId, disasterId, name: `${spot.type} — contiguous U.S. context`, level: 'national', parentZoneId: undefined, boundary: polygon(-125, 24, -66, 50), riskLevel: 1, updatedAt: ctx.timestamp });
    const metroId = BigInt(10 + i * 10), zoneId = metroId + 1n;
    ctx.db.zone.insert({ id: metroId, disasterId, name: `${spot.name} exercise area`, level: 'metro', parentZoneId: nationalId, boundary: polygon(spot.lon - .2, spot.lat - .2, spot.lon + .2, spot.lat + .2), riskLevel: 3, updatedAt: ctx.timestamp });
    ctx.db.zone.insert({ id: zoneId, disasterId, name: `${spot.name} fictional neighborhood`, level: 'neighborhood', parentZoneId: metroId, boundary: polygon(spot.lon - .03, spot.lat - .03, spot.lon + .03, spot.lat + .03), riskLevel: 4, updatedAt: ctx.timestamp });
    for (let j = 0; j < 2; j++) {
      const id = BigInt(i * 2 + j + 1);
      ctx.db.household.insert({ id, zoneId, displayName: `Fictional household ${id}`, latitude: spot.lat + j * .01, longitude: spot.lon + j * .01, isCustomer: j === 0, checkInStatus: j === 0 ? 'unknown' : 'needs_help', vulnerabilityFlags: j === 0 ? ['mobility_assistance'] : [], lastContactAt: new Timestamp(ctx.timestamp.microsSinceUnixEpoch - 48n * 3600n * 1000000n) });
      ctx.db.helpRequest.insert({ id: 0n, householdId: id, needType: j === 0 ? 'welfare_check' : spot.need, urgency: j === 0 ? 5 : 3, people: 2, status: 'open', createdAt: ctx.timestamp, resolvedAt: undefined });
      ctx.db.preparednessTask.insert({ id: 0n, zoneId, householdId: id, actionType: j === 0 ? 'outreach' : spot.action, status: 'pending', createdAt: ctx.timestamp, completedAt: undefined });
    }
    ctx.db.responseTeam.insert({ id: BigInt(i + 1), name: `${spot.name} simulated team`, latitude: spot.lat + .04, longitude: spot.lon, status: 'available', capacity: 4, capabilities: [...new Set(['water', 'food', 'welfare_check', spot.need])] });
  });
}
