import type { MapData, MapHousehold, MapTeam, Phase } from "./types";

/** Disposable dashboard rehearsal; never changes subscribed records. */
export interface DashboardRound {
  recipients: string[];
  sentAt: number;
  message: string;
  recipientRisk?: Record<string, string>;
  recipientMessages?: Record<string, string>;
  replies: Record<string, "safe" | "needs_help">;
}
export interface DashboardScenario {
  minute: number;
  impactMinutes?: Record<string, number>;
  areas: Record<string, Partial<Record<Phase, DashboardRound>>>;
  assignments: Record<string, string>;
  completedRescues?: Record<string, { teamId: string; completedAt?: number }>;
}
export const initialDashboardScenario: DashboardScenario = { minute: -120, areas: {}, assignments: {} };
export type DashboardAction =
  | { type: "send"; areaId: string; message: string }
  | { type: "reply"; areaId?: string; id: string; reply: "safe" | "needs_help" }
  | { type: "impact" }
  | { type: "deadline" }
  | { type: "complete_rescues" }
  | { type: "assign"; areaId?: string; id: string; teamId: string }
  | { type: "reset" };
export const areaIdFor = (row: MapHousehold | MapTeam) => row.hotspotId ?? row.zoneId;
export function notificationAreaIdFor(row: MapHousehold) {
  const rank = {High:3,Medium:2,Low:1,None:0};
  const areas = Object.entries(row.riskByArea ?? {}).filter(([,risk]) => rank[risk] > 0).sort((a,b)=>rank[b[1]]-rank[a[1]] || a[0].localeCompare(b[0]));
  return areas[0]?.[0] ?? areaIdFor(row);
}
export function roundFor(state: DashboardScenario, row: MapHousehold, phase: Phase, areaId?: string) {
  if (areaId) return state.areas[areaId]?.[phase];
  return state.areas[notificationAreaIdFor(row)]?.[phase] ?? Object.values(state.areas).map(a=>a[phase]).find(r=>r?.recipients.includes(row.id));
}
export function confirmedSafe(state: DashboardScenario, row: MapHousehold, phase: Phase, selectedAreaId?: string) {
  return (!row.isCustomer && row.checkIn === "safe")
    || roundFor(state,row,phase,selectedAreaId)?.replies[row.id] === "safe"
    || (phase === "after" && roundFor(state,row,"before",selectedAreaId)?.replies[row.id] === "safe");
}
export function needsAttention(state: DashboardScenario, row: MapHousehold, phase: Phase, areaId?: string) {
  if (state.completedRescues?.[row.id] || confirmedSafe(state, row, phase, areaId)) return false;
  if (!row.isCustomer) return phase === "after" && (row.needs.length > 0 || row.checkIn === "needs_help" || row.checkIn === "urgent");
  return true;
}
export function areaPhase(state: DashboardScenario, areaId: string): Phase {
  return state.minute < (state.impactMinutes?.[areaId] ?? 0) ? "before" : "after";
}
export function responseEligible(state: DashboardScenario, row: MapHousehold, areaId?: string) {
  if (areaPhase(state, areaId ?? notificationAreaIdFor(row)) !== "after" || state.assignments[row.id] || state.completedRescues?.[row.id] || confirmedSafe(state, row, "after",areaId)) return false;
  if (row.needs.length > 0 || (!row.isCustomer && ["needs_help", "urgent"].includes(row.checkIn))) return true;
  const round = roundFor(state, row, "after",areaId);
  return !!round?.recipients.includes(row.id) && (round.replies[row.id] === "needs_help"
    || (!confirmedSafe(state, row, "after",areaId) && state.minute >= round.sentAt + 30));
}
/** Employee approval is reserved for unanswered follow-ups past their deadline. */
export function responseApprovalEligible(state: DashboardScenario, row: MapHousehold, areaId?: string) {
  const round = roundFor(state, row, "after", areaId);
  return responseEligible(state, row, areaId) && !!round?.recipients.includes(row.id)
    && !round.replies[row.id] && state.minute >= round.sentAt + 30;
}
export function matchingTeam(state: DashboardScenario, row: MapHousehold, teams: MapTeam[]) {
  const required = row.needs.length ? row.needs : ["Welfare check"];
  return teams.find(team => areaIdFor(team) === areaIdFor(row) && team.status === "available" && team.capacity > 0
    && !Object.values(state.assignments).includes(team.id)
    && required.every(need => team.capabilities.some(capability => capability.toLowerCase().replaceAll("_", " ") === need.toLowerCase())));
}
function reduceScenario(state: DashboardScenario, action: DashboardAction, data: MapData): DashboardScenario {
  const selectedArea = "areaId" in action ? action.areaId : undefined;
  const household = "id" in action ? data.households.find(h => h.id === action.id) : undefined;
  const phase = areaPhase(state, selectedArea ?? (household ? notificationAreaIdFor(household) : ""));
  switch (action.type) {
    case "reset": return initialDashboardScenario;
    case "impact": {
      const next = Math.min(...Object.values(state.impactMinutes ?? {}).filter(t => t > state.minute));
      return Number.isFinite(next) ? { ...state, minute: next } : state;
    }
    case "deadline": return state.minute >= 0 && Object.values(state.areas).some(area => area.after && state.minute < area.after.sentAt + 30)
      ? { ...state, minute: state.minute + 30 } : state;
    case "complete_rescues": {
      if (state.minute < 0 || !Object.keys(state.assignments).length) return state;
      const minute = state.minute + 30;
      const completedRescues = { ...state.completedRescues };
      for (const [householdId, teamId] of Object.entries(state.assignments)) {
        completedRescues[householdId] = { teamId, completedAt: minute };
      }
      const updated: DashboardScenario = { ...state, minute, completedRescues, assignments: {} };
      // Freed units serve queued help requests automatically; silence still needs approval.
      for (const row of data.households) {
        const helpRequested = Object.values(updated.areas).some(area => area.after?.replies[row.id] === "needs_help");
        if (!helpRequested || !responseEligible(updated, row)) continue;
        const team = matchingTeam(updated, row, data.teams);
        if (team) updated.assignments[row.id] = team.id;
      }
      return updated;
    }
    case "send": {
      if (!action.message.trim() || !data.zones.some(zone => zone.id === action.areaId) || state.areas[action.areaId]?.[phase]) return state;
      const targets = data.households.filter(row => row.isCustomer && !state.completedRescues?.[row.id] && (row.riskByArea ? !!row.riskByArea[action.areaId] && row.riskByArea[action.areaId] !== 'None' : areaIdFor(row) === action.areaId && row.riskLevel !== 'None') && !confirmedSafe(state, row, phase,action.areaId));
      const recipients = targets.map(row=>row.id);
      let messages: Record<string,string> | undefined;
      try { const value=JSON.parse(action.message); if(value.format==='risk-messages-v1')messages=value.messages; } catch { /* Legacy plain text. */ }
      const recipientRisk = Object.fromEntries(targets.map(row=>[row.id,row.riskByArea?.[action.areaId] ?? row.riskLevel ?? 'None']));
      const recipientMessages = Object.fromEntries(targets.map(row=>[row.id,messages?.[recipientRisk[row.id]] ?? action.message]));
      if (!recipients.length) return state;
      return { ...state, areas: { ...state.areas, [action.areaId]: { ...state.areas[action.areaId], [phase]: { recipients, sentAt: state.minute, message: action.message, recipientRisk, recipientMessages, replies: {} } } } };
    }
    case "reply": {
      const row = data.households.find(row => row.id === action.id);
      if (!row || state.assignments[row.id] || state.completedRescues?.[row.id] || (phase === "before" && action.reply !== "safe")) return state;
      const areaId = action.areaId ?? areaIdFor(row);
      const round = state.areas[areaId]?.[phase];
      if (!round?.recipients.includes(row.id)) return state;
      const updated = { ...state, areas: { ...state.areas, [areaId]: { ...state.areas[areaId], [phase]: { ...round, replies: { ...round.replies, [row.id]: action.reply } } } } };
      if (phase === "after" && action.reply === "needs_help" && responseEligible(updated, row, areaId)) {
        const team = matchingTeam(updated, row, data.teams);
        if (team) return { ...updated, assignments: { ...updated.assignments, [row.id]: team.id } };
      }
      return updated;
    }
    case "assign": {
      const row = data.households.find(row => row.id === action.id);
      if (!row || !responseApprovalEligible(state, row,action.areaId)) return state;
      const team = matchingTeam(state, row, data.teams.filter(team => team.id === action.teamId));
      return team ? { ...state, assignments: { ...state.assignments, [row.id]: team.id } } : state;
    }
  }
}

export function dashboardHouseholdStatus(state: DashboardScenario, row: MapHousehold, phase: Phase, areaId?: string) {
  if (state.completedRescues?.[row.id]) return "Assistance completed";
  if (state.assignments[row.id]) return "Unit assigned";
  if (!row.isCustomer) return row.checkIn.replaceAll("_", " ");
  const round = roundFor(state, row, phase,areaId);
  if (confirmedSafe(state, row, phase,areaId)) return "Confirmed safe";
  if (round?.replies[row.id] === "needs_help") return "Needs help";
  if (!round?.recipients.includes(row.id)) return "Not contacted";
  return phase === "after" && state.minute >= round.sentAt + 30 ? "No response · Overdue" : "Awaiting reply";
}

/** Marker actions follow the same notification rounds and dispatch eligibility as the dialogs. */
export interface MapAction { areaId?: string; kind: "notification" | "response"; label: string; hasNotification?: boolean }
export function householdMapAction(state: DashboardScenario, row: MapHousehold, phase: Phase, enabled = true, areaId?: string): MapAction | undefined {
  if (enabled ? confirmedSafe(state, row, phase, areaId) || !!state.assignments[row.id] || !!state.completedRescues?.[row.id] : row.checkIn === "safe") return;
  if (phase === "after" && (enabled ? responseEligible(state, row, areaId) : row.needs.length > 0 || row.checkIn === "needs_help" || row.checkIn === "urgent")) {
    return { kind: "response", label: "Assistance or welfare check needed" };
  }
  if (!row.isCustomer || row.riskLevel === "None") return;
  const round = enabled ? roundFor(state, row, phase, areaId) : undefined;
  if (enabled ? !round : !row.lastContactAt) return { kind: "notification", label: phase === "before" ? "Preparedness notification needed" : "Follow-up notification needed" };
}

export function dashboardScenarioReducer(state: DashboardScenario, action: DashboardAction, data: MapData): DashboardScenario {
  const prepared = state.impactMinutes ? state : { ...state, impactMinutes: Object.fromEntries(data.zones.map(z => [z.id, z.impactMinute ?? 0])) };
  const result = reduceScenario(prepared, action, data);
  return result === prepared ? state : result;
}

/** Scope related map records together; overlapping exposure follows the selected event. */
export function filterPhase(data: MapData, minute: number, phase: Phase): MapData {
  const zones = data.zones.filter(z => minute < (z.impactMinute ?? 0) ? phase === "before" : phase === "after");
  const ids = new Set(zones.map(z => z.id));
  return { ...data, zones,
    impactLayers: data.impactLayers?.filter(l => ids.has(l.hotspotId)),
    households: data.households.filter(h => h.riskByArea ? Object.entries(h.riskByArea).some(([id, risk]) => ids.has(id) && risk !== "None") : ids.has(areaIdFor(h))).map(h => ({ ...h, riskByArea: h.riskByArea ? Object.fromEntries(Object.entries(h.riskByArea).filter(([id]) => ids.has(id))) : undefined })),
    teams: data.teams.filter(t => ids.has(areaIdFor(t))) };
}

/** Choose an event needing attention, prioritizing response over preparation. */
export function activeAreaIdFor(state: DashboardScenario, row: MapHousehold): string {
  const preferred = notificationAreaIdFor(row);
  const ids = Object.entries(row.riskByArea ?? {}).filter(([, risk]) => risk !== "None").map(([id]) => id);
  if (!ids.length) return preferred;
  const rank = (id: string) => responseEligible(state, row, id) ? 0 : needsAttention(state, row, areaPhase(state, id), id) ? 1 : 2;
  return ids.sort((a, b) => rank(a) - rank(b) || Number(b === preferred) - Number(a === preferred) || a.localeCompare(b))[0];
}
