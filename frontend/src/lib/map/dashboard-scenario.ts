import type { MapData, MapHousehold, MapTeam, Phase } from "./types";

/** Disposable dashboard rehearsal; never changes subscribed records. */
export interface DashboardRound {
  recipients: string[];
  sentAt: number;
  message: string;
  replies: Record<string, "safe" | "needs_help">;
}
export interface DashboardScenario {
  minute: number;
  areas: Record<string, Partial<Record<Phase, DashboardRound>>>;
  assignments: Record<string, string>;
}
export const initialDashboardScenario: DashboardScenario = { minute: -120, areas: {}, assignments: {} };
export type DashboardAction =
  | { type: "send"; areaId: string; message: string }
  | { type: "reply"; id: string; reply: "safe" | "needs_help" }
  | { type: "impact" }
  | { type: "deadline" }
  | { type: "assign"; id: string; teamId: string }
  | { type: "reset" };
export const areaIdFor = (row: MapHousehold | MapTeam) => row.hotspotId ?? row.zoneId;
export function roundFor(state: DashboardScenario, row: MapHousehold, phase: Phase) {
  return state.areas[areaIdFor(row)]?.[phase];
}
export function confirmedSafe(state: DashboardScenario, row: MapHousehold, phase: Phase) {
  return (!row.isCustomer && row.checkIn === "safe")
    || roundFor(state, row, phase)?.replies[row.id] === "safe"
    || (phase === "after" && roundFor(state, row, "before")?.replies[row.id] === "safe");
}
export function needsAttention(state: DashboardScenario, row: MapHousehold, phase: Phase) {
  if (confirmedSafe(state, row, phase)) return false;
  if (!row.isCustomer) return phase === "after" && (row.needs.length > 0 || row.checkIn === "needs_help" || row.checkIn === "urgent");
  return true;
}
export function responseEligible(state: DashboardScenario, row: MapHousehold) {
  if (state.minute < 0 || state.assignments[row.id] || confirmedSafe(state, row, "after")) return false;
  if (row.needs.length > 0 || (!row.isCustomer && ["needs_help", "urgent"].includes(row.checkIn))) return true;
  const round = roundFor(state, row, "after");
  return !!round?.recipients.includes(row.id) && (round.replies[row.id] === "needs_help"
    || (!confirmedSafe(state, row, "after") && state.minute >= round.sentAt + 30));
}
export function matchingTeam(state: DashboardScenario, row: MapHousehold, teams: MapTeam[]) {
  const required = row.needs.length ? row.needs : ["Welfare check"];
  return teams.find(team => areaIdFor(team) === areaIdFor(row) && team.status === "available" && team.capacity > 0
    && !Object.values(state.assignments).includes(team.id)
    && required.every(need => team.capabilities.some(capability => capability.toLowerCase().replaceAll("_", " ") === need.toLowerCase())));
}
export function dashboardScenarioReducer(state: DashboardScenario, action: DashboardAction, data: MapData): DashboardScenario {
  const phase = state.minute < 0 ? "before" : "after";
  switch (action.type) {
    case "reset": return initialDashboardScenario;
    case "impact": return state.minute < 0 && Object.values(state.areas).some(area => area.before)
      ? { ...state, minute: 0 } : state;
    case "deadline": return state.minute >= 0 && Object.values(state.areas).some(area => area.after && state.minute < area.after.sentAt + 30)
      ? { ...state, minute: state.minute + 30 } : state;
    case "send": {
      if (!action.message.trim() || !data.zones.some(zone => zone.id === action.areaId) || state.areas[action.areaId]?.[phase]) return state;
      const recipients = data.households.filter(row => row.isCustomer && areaIdFor(row) === action.areaId && !confirmedSafe(state, row, phase)).map(row => row.id);
      if (!recipients.length) return state;
      return { ...state, areas: { ...state.areas, [action.areaId]: { ...state.areas[action.areaId], [phase]: { recipients, sentAt: state.minute, message: action.message, replies: {} } } } };
    }
    case "reply": {
      const row = data.households.find(row => row.id === action.id);
      if (!row || state.assignments[row.id] || (phase === "before" && action.reply !== "safe")) return state;
      const areaId = areaIdFor(row);
      const round = state.areas[areaId]?.[phase];
      if (!round?.recipients.includes(row.id)) return state;
      return { ...state, areas: { ...state.areas, [areaId]: { ...state.areas[areaId], [phase]: { ...round, replies: { ...round.replies, [row.id]: action.reply } } } } };
    }
    case "assign": {
      const row = data.households.find(row => row.id === action.id);
      if (!row || !responseEligible(state, row)) return state;
      const team = matchingTeam(state, row, data.teams.filter(team => team.id === action.teamId));
      return team ? { ...state, assignments: { ...state.assignments, [row.id]: team.id } } : state;
    }
  }
}

export function dashboardHouseholdStatus(state: DashboardScenario, row: MapHousehold, phase: Phase) {
  if (state.assignments[row.id]) return "Unit assigned";
  if (!row.isCustomer) return row.checkIn.replaceAll("_", " ");
  const round = roundFor(state, row, phase);
  if (confirmedSafe(state, row, phase)) return "Confirmed safe";
  if (round?.replies[row.id] === "needs_help") return "Needs help";
  if (!round?.recipients.includes(row.id)) return "Not contacted";
  return phase === "after" && state.minute >= round.sentAt + 30 ? "No response · Overdue" : "Awaiting reply";
}
