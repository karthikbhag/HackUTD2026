import type { MapData, MapHousehold, Hazard } from './types';

export const HOUSEHOLD_ZOOM = 9;
export const PAGE_SIZE = 50;
export function filterHazards(data: MapData, enabled: readonly Hazard[]): MapData {
  const zones = data.zones.filter(zone => enabled.includes(zone.hazard));
  const ids = new Set(zones.map(zone => zone.id));
  return { zones, households: data.households.filter(row => ids.has(row.hotspotId ?? row.zoneId)),
    teams: data.teams.filter(row => ids.has(row.hotspotId ?? row.zoneId)),
    impactLayers: data.impactLayers?.filter(row => enabled.includes(row.hazard)) };
}
export function householdCounts(households: readonly MapHousehold[]) {
  const regional = households.filter(row => row.membership === 'regional').length;
  return { total: households.length, neighborhood: households.length - regional, regional };
}
export function viewportHouseholds(households: readonly MapHousehold[], zoom: number, bounds: { south: number; north: number; west: number; east: number }) {
  if (zoom < HOUSEHOLD_ZOOM) return [];
  return households.filter(({ position: [lat, lon] }) => lat >= bounds.south && lat <= bounds.north && lon >= bounds.west && lon <= bounds.east);
}
