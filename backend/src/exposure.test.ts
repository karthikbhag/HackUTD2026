import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { calculateExposure, pointInPolygon, type ImpactLayer, type LocatedHousehold, type Polygon } from './exposure';

const polygon: Polygon = { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] };
function layer(id = 'fire', changes: Partial<ImpactLayer> = {}): ImpactLayer {
  return { id, disaster_id: 'event', hazard_type: 'wildfire', component: 'fire_perimeter', severity: 'high',
    geometry: polygon, data_kind: 'simulation', is_simulated: true,
    source: 'Synthetic test', updated_at: '2026-11-07T12:00:00Z', label: 'SIMULATION', ...changes };
}
function household(id: string, longitude: number, latitude: number): LocatedHousehold {
  return { id, longitude, latitude };
}
// Independent winding-number oracle, deliberately different from production ray casting.
function winding(point: readonly number[], geometry: Polygon) {
  const ring = geometry.coordinates[0];
  let count = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    const side = (b[0] - a[0]) * (point[1] - a[1]) - (point[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(side) <= 1e-10 && point[0] >= Math.min(a[0], b[0]) - 1e-10 && point[0] <= Math.max(a[0], b[0]) + 1e-10 &&
      point[1] >= Math.min(a[1], b[1]) - 1e-10 && point[1] <= Math.max(a[1], b[1]) + 1e-10) return true;
    if (a[1] <= point[1] && b[1] > point[1] && side > 0) count++;
    if (a[1] > point[1] && b[1] <= point[1] && side < 0) count--;
  }
  return count !== 0;
}

describe('household exposure', () => {
  it('includes edges, vertices, negative coordinates and either ring direction', () => {
    for (const point of [[1, 1], [0, 1], [2, 2], [0, 0]] as const) {
      expect(pointInPolygon(point, polygon)).toBe(true);
      expect(pointInPolygon(point, { type: 'Polygon', coordinates: [[...polygon.coordinates[0]].reverse()] })).toBe(true);
    }
    expect(pointInPolygon([2.001, 1], polygon)).toBe(false);
    const western: Polygon = { type: 'Polygon', coordinates: [[[-100, 30], [-99, 30], [-99, 31], [-100, 31], [-100, 30]]] };
    expect(pointInPolygon([-99.5, 30.5], western)).toBe(true);
  });

  it('handles a concave exclusion inside the bounding box', () => {
    const concave: Polygon = { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [1, 1], [2, 2], [0, 2], [0, 0]]] };
    expect(pointInPolygon([1.8, 1], concave)).toBe(false);
    expect(pointInPolygon([0.5, 1], concave)).toBe(true);
    expect(pointInPolygon([1, 1], concave)).toBe(true);
  });

  it('preserves overlapping components and hazards with unique aggregate counts', () => {
    const layers = [layer(), layer('smoke', { component: 'smoke', severity: 'moderate' }),
      layer('flood', { disaster_id: 'flood-event', hazard_type: 'flood', component: 'inundation' })];
    const result = calculateExposure([household('inside', 1, 1), household('outside', 3, 3)], layers);
    expect(result.affectedHouseholds).toBe(1);
    expect(result.households[0].exposures).toHaveLength(3);
    expect(result.households[0].highestSeverity).toBe('high');
    expect(result.households[0].exposures[0]).toMatchObject({ source: 'Synthetic test', dataKind: 'simulation', updatedAt: '2026-11-07T12:00:00Z' });
    expect(result.byHazard.find(h => h.hazardType === 'wildfire')?.households).toBe(1);
    expect(result.byDisaster.find(d => d.disasterId === 'event')?.households).toBe(1);
    expect(result.byLayer.every(l => l.households === 1)).toBe(true);
    expect(result.households[1]).toMatchObject({ affected: false, highestSeverity: undefined, exposures: [] });
    expect(calculateExposure([household('outside', 3, 3), household('inside', 1, 1)], [...layers].reverse())).toEqual(result);
  });

  it('does not gate exposure by a household home zone or customer status', () => {
    const row = { ...household('cross-hazard', 1, 1), zone_id: 'unrelated-zone', is_customer: false };
    expect(calculateExposure([row], [layer()]).affectedHouseholds).toBe(1);
  });

  it('supports bigint backend IDs, empty data, and valid non-simulated provenance', () => {
    const result = calculateExposure([{ id: 7n, longitude: 1, latitude: 1 }], [{ ...layer(), id: 8n, disaster_id: 9n }]);
    expect(result.households[0].exposures[0].disasterId).toBe(9n);
    expect(calculateExposure([], []).affectedHouseholds).toBe(0);
    expect(calculateExposure([household('one', 0, 0)], []).households[0].affected).toBe(false);
    expect(calculateExposure([household('one', 1, 1)], [layer('report', { data_kind: 'report', is_simulated: false })]).affectedHouseholds).toBe(1);
  });

  it('rejects invalid coordinates, duplicate IDs, and unsupported geometry/metadata', () => {
    expect(() => calculateExposure([household('bad', NaN, 1)], [])).toThrow();
    expect(() => calculateExposure([household('same', 0, 0), household('same', 1, 1)], [])).toThrow(/duplicate/);
    expect(() => calculateExposure([], [layer(), layer()])).toThrow(/duplicate/);
    expect(() => calculateExposure([], [layer('bad', { data_kind: 'report' })])).toThrow(/simulation/);
    expect(() => calculateExposure([], [layer('bad', { updated_at: 'not a date' })])).toThrow(/timestamp/);
    expect(() => calculateExposure([], [layer('bad', { updated_at: '2026-02-30T12:00:00Z' })])).toThrow(/timestamp/);
    const invalid: Polygon[] = [
      { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 1], [1, 0], [0, 0]]] },
      { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [2, 0], [0, 0]]] },
      { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] },
      { type: 'Polygon', coordinates: [polygon.coordinates[0], polygon.coordinates[0]] },
      { type: 'Polygon', coordinates: [[[-179, 0], [179, 0], [179, 1], [-179, 1], [-179, 0]]] },
    ];
    for (const geometry of invalid) expect(() => calculateExposure([], [layer('bad', { geometry })])).toThrow();
  });

  it('keeps grid-boundary points and broad fallback layers', () => {
    const broad: Polygon = { type: 'Polygon', coordinates: [[[-40, -40], [40, -40], [40, 40], [-40, 40], [-40, -40]]] };
    const result = calculateExposure([household('grid-edge', 2, 2), household('broad-only', -30, -30)], [layer(), layer('broad', { geometry: broad })]);
    expect(result.affectedHouseholds).toBe(2);
    expect(result.households.find(h => h.householdId === 'grid-edge')?.exposures).toHaveLength(2);
  });

  it.each(['small', 'demo', 'stress'])('calculates %s fixture exposures against every source layer', preset => {
    const data = JSON.parse(execFileSync(process.env.PYTHON ?? 'python', ['../data/scenarios/generate.py', '--preset', preset], { maxBuffer: 96 * 1024 * 1024 }).toString()) as {
      households: LocatedHousehold[]; impact_layers: ImpactLayer[];
    };
    const start = performance.now();
    const result = calculateExposure(data.households, data.impact_layers);
    const elapsed = performance.now() - start;
    const sourceById = new Map(data.households.map(h => [h.id, h]));
    let unique = 0;
    for (const row of result.households) {
      const h = sourceById.get(row.householdId)!;
      const expected = data.impact_layers.filter(l => winding([h.longitude, h.latitude], l.geometry)).map(l => l.id).sort();
      expect(row.exposures.map(e => e.layerId)).toEqual(expected);
      if (expected.length) unique++;
    }
    expect(result.affectedHouseholds).toBe(unique);
    expect(unique).toBeGreaterThan(0);
    expect(unique).toBeLessThan(data.households.length);
    if (preset === 'stress') {
      expect(result.totalHouseholds).toBe(100000);
      expect(result.candidateChecks).toBeLessThan(data.households.length * data.impact_layers.length / 10);
      console.log(`Stress exposure: ${unique}/100000 affected; ${result.candidateChecks} candidate checks; ${elapsed.toFixed(1)} ms (helper only)`);
    }
  }, 60000);
});
