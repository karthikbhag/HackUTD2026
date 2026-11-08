/** Uses the existing source need mapping; validates dispatch fields separately
 * from display geometry/region metadata, which are not eligibility criteria.
 */
import { scenarioNeed, type Scenario } from './scenario';
import type { DispatchRequest, DispatchTeam, DispatchAssignment, Need } from './team-recommendations';

export function scenarioTeamInputs(data: Scenario) {
  if (![1, 2, 3].includes(data.schema_version) || data.is_simulated !== true) throw new Error('Expected a supported synthetic fixture');
  const requests: DispatchRequest[] = data.help_requests.map(r => ({ id: r.id, householdId: r.household_id,
    needType: scenarioNeed(r.need_type), people: 1, status: r.status as DispatchRequest['status'] }));
  const teams: DispatchTeam[] = data.response_teams.map(t => ({ id: t.id, name: t.name, latitude: t.latitude,
    longitude: t.longitude, capacity: t.capacity, status: t.status as DispatchTeam['status'], capabilities: t.capabilities.map(scenarioNeed) as Need[] }));
  return { households: data.households.map(h => ({ id: h.id, latitude: h.latitude, longitude: h.longitude })),
    requests, teams, assignments: [] as DispatchAssignment[],
    sourceRequestIds: new Map(requests.map(r => [r.id, r.id])),
    conversionAssumptions: 'Existing fixture conversion: missing party size becomes one person; source household-case capacity is reused numerically; supply_delivery becomes water; initial assignments are empty.' };
}
