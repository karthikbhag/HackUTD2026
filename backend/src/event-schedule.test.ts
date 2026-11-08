import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { impactRegion, scheduledImpactMinute } from './event-schedule';

it('shares impact times within a hazard/region and separates other regional hazards', () => {
  expect(scheduledImpactMinute('Simulated Central Oklahoma tornado exercise', 'tornado')).toBe(scheduledImpactMinute('Dallas–Fort Worth, TX', 'tornado'));
  expect(scheduledImpactMinute('IA synthetic context', 'tornado')).not.toBe(scheduledImpactMinute('TX synthetic context', 'tornado'));
  expect(scheduledImpactMinute('TX synthetic context', 'flood')).not.toBe(scheduledImpactMinute('TX synthetic context', 'tornado'));
});
it('groups every Demo hotspot into four known regions with a single time per regional hazard', () => {
  const data = JSON.parse(readFileSync(new URL('../../data/scenarios/generated/demo.json', import.meta.url), 'utf8'));
  const groups = new Map<string, number>();
  const regions = new Set<string>();
  for (const disaster of data.disasters) {
    const region = impactRegion(disaster.name);
    expect(region).not.toBe('Unspecified region');
    regions.add(region);
    const key = `${region}:${disaster.type}`, time = scheduledImpactMinute(disaster.name, disaster.type);
    if (groups.has(key)) expect(time).toBe(groups.get(key));
    groups.set(key, time);
  }
  expect(regions.size).toBe(4);
  expect(groups.size).toBeLessThan(data.disasters.length);
  expect(new Set(groups.values()).size).toBe(groups.size);
});
