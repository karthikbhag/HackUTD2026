import { Timestamp } from 'spacetimedb';
import source from '../../data/scenarios/nationwide-v1.json';

export { source };
export type Scenario = typeof source;
const needs: Record<string, string> = {
  shelter_support: 'shelter', welfare_check: 'welfare_check', evacuation_assistance: 'evacuation',
  smoke_support: 'fire_smoke_support', winter_weather_support: 'winter_weather_support',
  supply_delivery: 'water', // Explicit demo assumption: generic supplies become water, not a new need enum.
};
const hazards = ['tornado', 'earthquake', 'hurricane', 'wildfire', 'blizzard', 'flood'];
function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid scenario: ${message}`);
}
function choice(value: string, allowed: readonly string[]) {
  require(allowed.includes(value), value); return value;
}
function iso(value: string) {
  require(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value), 'UTC timestamp');
  const [whole, fraction = ''] = value.slice(0, -1).split('.');
  const millis = Date.parse(`${whole}Z`);
  require(Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 19) === whole, 'timestamp');
  return BigInt(millis) * 1000n + BigInt(fraction.padEnd(6, '0'));
}
function point(lon: number, lat: number) {
  require(Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90, 'coordinates');
}
function ids(rows: { id: string }[]) {
  const result = new Map<string, bigint>();
  // Stable within a fixture: sorted source IDs, independent of collection order. Never Number(id).
  for (const row of [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    require(typeof row.id === 'string' && row.id.length > 0 && !result.has(row.id), 'duplicate/empty ID');
    result.set(row.id, BigInt(result.size + 1));
  }
  return result;
}
/** Pure conversion: validate every row before the seed transaction inserts anything.
 * Raw metadata and source IDs stay in the versioned JSON; maps expose the crosswalk.
 */
export function adaptScenario(data: Scenario, clock: Timestamp) {
  require([1, 2].includes(data.schema_version) && data.is_simulated === true && !!data.source, 'simulation/version/source');
  const reference = iso(data.reference_time);
  const stamp = (value: string) => {
    const micros = iso(value); require(micros <= reference, 'future timestamp');
    const shifted = micros + clock.microsSinceUnixEpoch - reference;
    require(shifted >= -(1n << 63n) && shifted < (1n << 63n), 'timestamp overflow');
    return new Timestamp(shifted);
  };
  const maps = { disasters: ids(data.disasters), zones: ids(data.zones), households: ids(data.households), teams: ids(data.response_teams), requests: ids(data.help_requests) };
  const fk = (map: Map<string, bigint>, id: string) => { const value = map.get(id); require(value !== undefined, `foreign key ${id}`); return value; };
  const capability = (value: string) => { require(Object.prototype.hasOwnProperty.call(needs, value), `need ${value}`); return needs[value]; };
  const disasters = data.disasters.map(row => {
    require(row.is_simulated === true && !!row.source && !!row.name, 'disaster source');
    return { id: fk(maps.disasters, row.id), name: row.name, type: choice(row.type, hazards), phase: choice(row.phase, ['preparedness']), source: row.source, isSimulated: true, updatedAt: stamp(row.updated_at) };
  });
  const zoneById = new Map(data.zones.map(row => [row.id, row]));
  const zones = data.zones.map(row => {
    require(row.is_simulated === true && !!row.source && !!row.name, 'zone source');
    choice(row.level, ['region', 'neighborhood']);
    const parent = row.parent_zone_id == null ? undefined : zoneById.get(row.parent_zone_id);
    require(row.level === 'region' ? row.parent_zone_id === null : parent?.level === 'region' && parent.disaster_id === row.disaster_id, 'zone hierarchy');
    const geometry = row.boundary;
    require(geometry.type === 'Polygon' && geometry.coordinates.length === 1, 'Polygon');
    const ring = geometry.coordinates[0];
    require(ring.length >= 4 && ring.every(p => p.length === 2) && JSON.stringify(ring[0]) === JSON.stringify(ring.at(-1)), 'closed ring');
    ring.forEach(p => point(p[0], p[1]));
    const area = ring.slice(1).reduce((sum, p, i) => sum + ring[i][0] * p[1] - p[0] * ring[i][1], 0);
    require(area !== 0, 'degenerate Polygon');
    choice(row.risk_level, ['moderate', 'high']);
    return { id: fk(maps.zones, row.id), disasterId: fk(maps.disasters, row.disaster_id), name: row.name, level: row.level === 'region' ? 'metro' : row.level, parentZoneId: parent ? fk(maps.zones, parent.id) : undefined, boundary: JSON.stringify(geometry), riskLevel: row.risk_level === 'high' ? 4 : 2, updatedAt: stamp(row.updated_at) };
  });
  const households = data.households.map(row => {
    point(row.longitude, row.latitude);
    require(typeof row.is_customer === 'boolean' && !!row.display_name && row.vulnerability_flags.every(v => typeof v === 'string'), 'household');
    return { id: fk(maps.households, row.id), zoneId: fk(maps.zones, row.zone_id), displayName: row.display_name, latitude: row.latitude, longitude: row.longitude, isCustomer: row.is_customer, checkInStatus: choice(row.check_in_status, ['unknown', 'safe', 'needs_help', 'urgent']), vulnerabilityFlags: [...row.vulnerability_flags], lastContactAt: row.last_contact_at === null ? undefined : stamp(row.last_contact_at) };
  });
  const teams = data.response_teams.map(row => {
    point(row.longitude, row.latitude);
    const region = (row as typeof row & { zone_id?: string }).zone_id;
    if (data.schema_version === 2) require(region !== undefined && zoneById.get(region)?.level === 'region', 'team region');
    require(!!row.name && Number.isInteger(row.capacity) && row.capacity > 0 && row.capacity <= 0xffffffff && row.capabilities.length > 0, 'team capacity');
    // Source capacity counts household cases. Conservatively model one person per case
    // until Person 3 supplies party sizes; retain the numeric limit and single-assignment rule.
    return { id: fk(maps.teams, row.id), name: row.name, latitude: row.latitude, longitude: row.longitude, status: choice(row.status, ['available', 'unavailable']), capacity: row.capacity, capabilities: [...new Set(row.capabilities.map(capability))] };
  });
  const requests = data.help_requests.map(row => {
    choice(row.urgency, ['urgent', 'moderate']);
    require(row.status === 'open' && row.resolved_at === null, 'baseline request status');
    return { id: fk(maps.requests, row.id), householdId: fk(maps.households, row.household_id), needType: capability(row.need_type), urgency: row.urgency === 'urgent' ? 5 : 3, people: 1, status: 'open', createdAt: stamp(row.created_at), resolvedAt: undefined };
  });
  return { maps, disasters, zones, households, teams, requests };
}
