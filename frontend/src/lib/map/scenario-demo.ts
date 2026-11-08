/** Browser-local rehearsal only. Never passed to backend reducers or subscriptions. */
export type DemoReply = "safe" | "needs_help";
export interface DemoRound {
  sentAt: number;
  replies: Record<string, DemoReply>;
}
export interface ScenarioDemo {
  minute: number;
  before: DemoRound | null;
  after: DemoRound | null;
  assignments: Record<string, string>;
  events: string[];
}
export const initialScenarioDemo: ScenarioDemo = { minute: -120, before: null, after: null, assignments: {}, events: [] };
export type DemoAction =
  | { type: "send" }
  | { type: "impact" }
  | { type: "deadline" }
  | { type: "reply"; id: string; reply: DemoReply }
  | { type: "assign"; id: string; teamId: string }
  | { type: "reset" };
export function scenarioDemoReducer(state: ScenarioDemo, action: DemoAction): ScenarioDemo {
  const phase = state.minute < 0 ? "before" : "after";
  const round = state[phase];
  const log = (message: string) => [...state.events, `${state.minute < 0 ? 'T' : 'T+'}${state.minute} min · ${message}`];
  switch (action.type) {
    case "reset": return initialScenarioDemo;
    case "send": return round ? state : { ...state, [phase]: { sentAt: state.minute, replies: {} }, events: log(`${phase === 'before' ? 'Preparation' : 'Post-disaster'} check-in approved (simulated).`) };
    case "impact": return state.minute >= 0 ? state : { ...state, minute: 0, events: [...state.events, 'T+0 min · Time advanced to post-disaster conditions.'] };
    case "deadline": return state.after && state.minute < state.after.sentAt + 30 ? { ...state, minute: state.after.sentAt + 30, events: [...state.events, 'T+30 min · Post-disaster response deadline reached.'] } : state;
    case "reply": return !round ? state : { ...state, [phase]: { ...round, replies: { ...round.replies, [action.id]: action.reply } }, events: log(`${action.id}: ${action.reply === 'safe' ? 'confirmed safe' : 'requested help'}.`) };
    case "assign": {
      const reply = state.after?.replies[action.id];
      const overdue = state.after && state.minute >= state.after.sentAt + 30;
      if (!state.after || (reply !== 'needs_help' && !(overdue && !reply)) || state.assignments[action.id] || Object.values(state.assignments).includes(action.teamId)) return state;
      return { ...state, assignments: { ...state.assignments, [action.id]: action.teamId }, events: log(`Response unit approved for ${action.id} (simulated).`) };
    }
  }
}
