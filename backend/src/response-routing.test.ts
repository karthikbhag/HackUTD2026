import { describe, it, expect } from 'vitest';
import { solve } from '../../routing-worker/src/solver';
import { responseRoutingDefaults, validateResponseRoutingConfig } from '../../shared/response-routing-config';
describe('routing foundation', () => {
  it('validates finite durations and bounded fixture sizes', () => {
    expect(validateResponseRoutingConfig(responseRoutingDefaults).simulationSpeed).toBe(10);
    expect(() => validateResponseRoutingConfig({ ...responseRoutingDefaults, visitMinutes: NaN })).toThrow();
    expect(() => validateResponseRoutingConfig({ ...responseRoutingDefaults, householdCount: 21 })).toThrow();
  });
  it('retains urgent precedence and reserves return travel', () => {
    const result = solve([{ id:'unknown', point:1, urgent:false, eligibleSince:0 }, { id:'urgent', point:2, urgent:true, eligibleSince:1 }], [{ id:'team', point:0, remainingMinutes:20 }], [[0,2,2],[2,0,2],[2,2,0]], 0, 5);
    expect(result.routes[0].visits.map(v => v.id)).toEqual(['urgent','unknown']);
    expect(result.routes[0].minutes).toBe(16);
  });
  it('does not interpret missing travel as zero', () => {
    expect(solve([{ id:'a', point:1, urgent:true, eligibleSince:0 }], [{ id:'t', point:0, remainingMinutes:120 }], [[0,null],[null,0]], 0,5).unassigned[0].reason).toBe('unreachable');
  });
});
