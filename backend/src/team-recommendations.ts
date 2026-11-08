/** Pure, deterministic advisory matching. No SDK, clocks, I/O, or dispatch.
 * Snapshot eligibility never reserves a team; assignTeam remains authoritative.
 */
import type { RecordId } from './exposure';

export type Need = 'food' | 'water' | 'shelter' | 'welfare_check' | 'evacuation' | 'claims_support' | 'fire_smoke_support' | 'winter_weather_support';
export interface DispatchHousehold<Id extends RecordId = string> { id: Id; latitude: number; longitude: number }
export interface DispatchRequest<Id extends RecordId = string> {
  id: Id; householdId: Id; needType: Need; people: number; status: 'open' | 'assigned' | 'in_progress' | 'resolved';
}
export interface DispatchTeam<Id extends RecordId = string> {
  id: Id; name: string; latitude: number; longitude: number; capacity: number;
  capabilities: readonly Need[]; status: 'available' | 'assigned' | 'responding' | 'unavailable';
}
export interface DispatchAssignment<Id extends RecordId = string> {
  id: Id; requestId: Id; teamId: Id; status: 'assigned' | 'in_progress' | 'completed' | 'cancelled';
}
export interface TeamRecommendationConfig {
  readonly label: string; readonly assumedSpeedKmh: number;
}
export const DEFAULT_TEAM_RECOMMENDATION_CONFIG: TeamRecommendationConfig = {
  label: 'RiskReach demo assumptions: straight-line km and constant-speed ETA; employee approval required',
  assumedSpeedKmh: 30,
};
export type TeamExclusionCode = 'unavailable' | 'active_assignment' | 'missing_capability' | 'insufficient_capacity';
export interface TeamExclusionReason<Id extends RecordId = string> {
  code: TeamExclusionCode; explanation: string; assignmentIds: Id[];
}
const NEEDS: readonly Need[] = ['food', 'water', 'shelter', 'welfare_check', 'evacuation', 'claims_support', 'fire_smoke_support', 'winter_weather_support'];
const active = (status: string) => status === 'assigned' || status === 'in_progress';
function requireValid(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid team recommendation input: ${message}`);
}
function validId(value: RecordId) {
  return typeof value === 'bigint' || (typeof value === 'string' && value.trim().length > 0);
}
function compareIds(a: RecordId, b: RecordId) {
  if (typeof a === typeof b) return a < b ? -1 : a > b ? 1 : 0;
  return typeof a === 'bigint' ? -1 : 1;
}
function validatePoint(p: { latitude: number; longitude: number }) {
  requireValid(Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180, 'coordinates');
}
function positiveU32(value: number) { return Number.isInteger(value) && value > 0 && value <= 0xffffffff; }

/** Same mean Earth radius and Haversine formula as the existing dispatch reducer.
 * This measures distance only; it says nothing about roads, safety or access.
 */
export function straightLineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  validatePoint(a); validatePoint(b);
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function createTeamRecommender<Id extends RecordId>(
  households: readonly DispatchHousehold<Id>[], requests: readonly DispatchRequest<Id>[],
  teams: readonly DispatchTeam<Id>[], assignments: readonly DispatchAssignment<Id>[],
  config: TeamRecommendationConfig = DEFAULT_TEAM_RECOMMENDATION_CONFIG,
) {
  requireValid(config.label.trim() && Number.isFinite(config.assumedSpeedKmh) && config.assumedSpeedKmh > 0 && config.assumedSpeedKmh <= 300, 'labeled speed must be greater than 0 and at most 300 km/h');
  const assumptions = { ...config };
  const homeById = new Map<Id, DispatchHousehold<Id>>();
  for (const h of households) {
    requireValid(validId(h.id) && !homeById.has(h.id), 'duplicate/empty household ID'); validatePoint(h);
    homeById.set(h.id, { id: h.id, latitude: h.latitude, longitude: h.longitude });
  }
  const requestById = new Map<Id, DispatchRequest<Id>>();
  for (const r of requests) {
    requireValid(validId(r.id) && !requestById.has(r.id) && homeById.has(r.householdId), 'duplicate/empty request ID or missing household');
    requireValid(NEEDS.includes(r.needType) && positiveU32(r.people) && ['open', 'assigned', 'in_progress', 'resolved'].includes(r.status), 'request need/people/status');
    requestById.set(r.id, { ...r });
  }
  const teamById = new Map<Id, DispatchTeam<Id>>();
  for (const t of teams) {
    requireValid(validId(t.id) && !teamById.has(t.id), 'duplicate/empty team ID'); validatePoint(t);
    requireValid(t.name.trim() && positiveU32(t.capacity) && ['available', 'assigned', 'responding', 'unavailable'].includes(t.status) && t.capabilities.every(c => NEEDS.includes(c)), 'team resources/status');
    teamById.set(t.id, { ...t, capabilities: [...new Set(t.capabilities)] });
  }
  const assignmentIds = new Set<Id>(), busyTeams = new Map<Id, Id[]>(), assignedRequests = new Map<Id, Id[]>();
  for (const a of assignments) {
    requireValid(validId(a.id) && !assignmentIds.has(a.id) && teamById.has(a.teamId) && requestById.has(a.requestId), 'duplicate assignment ID or missing request/team');
    requireValid(['assigned', 'in_progress', 'completed', 'cancelled'].includes(a.status), 'assignment status');
    assignmentIds.add(a.id);
    if (!active(a.status)) continue;
    const teamIds = busyTeams.get(a.teamId) ?? []; teamIds.push(a.id); busyTeams.set(a.teamId, teamIds);
    const requestIds = assignedRequests.get(a.requestId) ?? []; requestIds.push(a.id); assignedRequests.set(a.requestId, requestIds);
  }
  for (const ids of [...busyTeams.values(), ...assignedRequests.values()]) ids.sort(compareIds);
  const snapshot = [...teamById.values()].sort((a, b) => compareIds(a.id, b.id));

  return {
    /** Reuse this validated snapshot for many requests. Rebuild after any input
     * changes. Bounded top-K results avoid a request x team output explosion.
     */
    recommend(requestId: Id, options: { limit?: number; includeExcludedTeams?: boolean } = {}) {
      const limit = options.limit ?? 5;
      requireValid(Number.isSafeInteger(limit) && limit >= 1 && limit <= 100, 'recommendation limit must be 1..100');
      requireValid(options.includeExcludedTeams === undefined || typeof options.includeExcludedTeams === 'boolean', 'exclusion detail option');
      const request = requestById.get(requestId);
      requireValid(request, 'request not found');
      const blocks: { code: 'request_not_open' | 'active_request_assignment'; explanation: string; assignmentIds: Id[] }[] = [];
      if (request.status !== 'open') blocks.push({ code: 'request_not_open', explanation: `Request status is ${request.status}; only open requests can be assigned.`, assignmentIds: [] });
      if (assignedRequests.has(requestId)) blocks.push({ code: 'active_request_assignment', explanation: 'The request already has an active assignment, even if its status snapshot says open.', assignmentIds: [...assignedRequests.get(requestId)!] });
      const exclusionCounts: Record<TeamExclusionCode, number> = { unavailable: 0, active_assignment: 0, missing_capability: 0, insufficient_capacity: 0 };
      const excludedTeams: { teamId: Id; name: string; reasons: TeamExclusionReason<Id>[] }[] = [];
      const recommendations: { teamId: Id; name: string; distanceKm: number; approximateEtaMinutes: number; requiresHumanApproval: true; reasons: string[] }[] = [];
      let evaluatedTeamCount = 0, eligibleTeamCount = 0, excludedTeamCount = 0;
      if (!blocks.length) {
        const home = homeById.get(request.householdId)!;
        for (const team of snapshot) {
          evaluatedTeamCount++;
          const unavailable = team.status !== 'available', busy = busyTeams.has(team.id);
          const missing = !team.capabilities.includes(request.needType), insufficient = team.capacity < request.people;
          if (unavailable || busy || missing || insufficient) {
            excludedTeamCount++;
            if (unavailable) exclusionCounts.unavailable++;
            if (busy) exclusionCounts.active_assignment++;
            if (missing) exclusionCounts.missing_capability++;
            if (insufficient) exclusionCounts.insufficient_capacity++;
            if (options.includeExcludedTeams) {
              const reasons: TeamExclusionReason<Id>[] = [];
              if (unavailable) reasons.push({ code: 'unavailable', explanation: `Team status is ${team.status}.`, assignmentIds: [] });
              if (busy) reasons.push({ code: 'active_assignment', explanation: 'A team can hold only one active assignment, regardless of unused capacity.', assignmentIds: [...busyTeams.get(team.id)!] });
              if (missing) reasons.push({ code: 'missing_capability', explanation: `Team lacks required capability ${request.needType}.`, assignmentIds: [] });
              if (insufficient) reasons.push({ code: 'insufficient_capacity', explanation: `Capacity ${team.capacity} people is below request party size ${request.people}.`, assignmentIds: [] });
              excludedTeams.push({ teamId: team.id, name: team.name, reasons });
            }
            continue;
          }
          eligibleTeamCount++;
          const distanceKm = straightLineKm(home, team);
          const worst = recommendations.at(-1);
          if (recommendations.length === limit && worst && (distanceKm > worst.distanceKm ||
            (distanceKm === worst.distanceKm && compareIds(team.id, worst.teamId) >= 0))) continue;
          const candidate = { teamId: team.id, name: team.name, distanceKm,
            approximateEtaMinutes: distanceKm / assumptions.assumedSpeedKmh * 60, requiresHumanApproval: true as const,
            reasons: [`Available with no active assignment; capability ${request.needType} matches.`,
              `Capacity ${team.capacity} people covers ${request.people} requested people under the one-assignment-per-team rule.`,
              'Ranked by straight-line distance; ETA assumes constant speed and is not a road route or safety assessment.'] };
          const position = recommendations.findIndex(r => distanceKm < r.distanceKm || (distanceKm === r.distanceKm && compareIds(team.id, r.teamId) < 0));
          if (position >= 0) recommendations.splice(position, 0, candidate);
          else if (recommendations.length < limit) recommendations.push(candidate);
          if (recommendations.length > limit) recommendations.pop();
        }
      }
      return { requestId, householdId: request.householdId, requestPeople: request.people, needType: request.needType,
        assumptions: { ...assumptions }, requestBlockReasons: blocks, evaluatedTeamCount, eligibleTeamCount,
        excludedTeamCount, omittedEligibleTeamCount: eligibleTeamCount - recommendations.length,
        exclusionCounts, excludedTeams, recommendations };
    },
  };
}
