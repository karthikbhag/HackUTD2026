import type { DbConnection } from "../../module_bindings";
import type { DashboardAction } from "../../lib/map/dashboard-scenario";

/**
 * Typed wrappers around the shared connection's reducers (Person 4).
 * View models use string IDs; reducers take u64 bigints, so convert here.
 * Each call resolves after the backend commits, or rejects with the backend's
 * SenderError message (for example "Team is unavailable").
 */
export type CheckInStatus = "unknown" | "safe" | "needs_help" | "urgent";
export type TaskStatus = "pending" | "in_progress" | "completed";
export type AssignmentStatus = "assigned" | "in_progress" | "completed" | "cancelled";

export interface WorkflowActions {
  dashboardAction(action: DashboardAction, expected: { expectedRunId: bigint; expectedMinute: number }): Promise<void>;
  recordOutreach(householdId: string): Promise<void>;
  updateCheckIn(householdId: string, status: CheckInStatus): Promise<void>;
  createTask(zoneId: string, householdId: string | null, actionType: string): Promise<void>;
  updateTask(taskId: string, status: TaskStatus): Promise<void>;
  createRequest(householdId: string, needType: string, urgency: number, people: number): Promise<void>;
  resolveRequest(requestId: string): Promise<void>;
  assignTeam(requestId: string, teamId: string): Promise<void>;
  updateAssignment(assignmentId: string, status: AssignmentStatus): Promise<void>;
  escalateScenario(disasterId: string): Promise<void>;
  resetDemo(confirmation: string): Promise<void>;
}

function toId(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error(`Invalid record ID: ${value}`);
  return BigInt(value);
}

/** Holds the live shared connection so stable action callbacks always use the current one. */
export class ConnectionLink {
  #connection: DbConnection | null = null;
  readonly actions: WorkflowActions = createWorkflowActions(() => this.#connection);
  /** Attach the connection; returns a detach function for effect cleanup. */
  attach(connection: DbConnection) {
    this.#connection = connection;
    return () => { if (this.#connection === connection) this.#connection = null; };
  }
}

/** `getConnection` returns the live shared connection, or null while disconnected. */
export function createWorkflowActions(getConnection: () => DbConnection | null): WorkflowActions {
  const reducers = () => {
    const connection = getConnection();
    if (!connection) throw new Error("Not connected to the operational database.");
    return connection.reducers;
  };
  // async so synchronous validation errors also surface as rejected promises.
  return {
    dashboardAction: async (action, args) => {
      const connection = getConnection();
      if (!connection?.isActive) throw new Error("Not connected to the operational database.");
      const state = [...connection.db.dashboardState.iter()][0];
      if (!state) throw new Error("Wait for the shared dashboard subscription and employee enrollment.");
      switch (action.type) {
        case "send": return connection.reducers.approveDashboardNotice({ ...args, areaId: toId(action.areaId), message: action.message });
        case "reply": return connection.reducers.replyDashboardNotice({ ...args, householdId: toId(action.id), reply: action.reply });
        case "assign": return connection.reducers.approveDashboardResponse({ ...args, householdId: toId(action.id), teamId: toId(action.teamId) });
        case "impact": return connection.reducers.advanceDashboardClock({ ...args, step: "impact" });
        case "deadline": return connection.reducers.advanceDashboardClock({ ...args, step: "deadline" });
        case "reset": return connection.reducers.resetDashboard({ ...args, confirmation: "RESET SYNTHETIC DEMO" });
      }
    },
    recordOutreach: async householdId => reducers().recordOutreach({ householdId: toId(householdId) }),
    updateCheckIn: async (householdId, status) => reducers().updateCheckIn({ householdId: toId(householdId), status }),
    createTask: async (zoneId, householdId, actionType) => reducers().createTask({ zoneId: toId(zoneId), householdId: householdId === null ? undefined : toId(householdId), actionType }),
    updateTask: async (taskId, status) => reducers().updateTask({ taskId: toId(taskId), status }),
    createRequest: async (householdId, needType, urgency, people) => reducers().createRequest({ householdId: toId(householdId), needType, urgency, people }),
    resolveRequest: async requestId => reducers().resolveRequest({ requestId: toId(requestId) }),
    assignTeam: async (requestId, teamId) => reducers().assignTeam({ requestId: toId(requestId), teamId: toId(teamId) }),
    updateAssignment: async (assignmentId, status) => reducers().updateAssignment({ assignmentId: toId(assignmentId), status }),
    escalateScenario: async disasterId => reducers().escalateScenario({ disasterId: toId(disasterId) }),
    resetDemo: async confirmation => reducers().resetDemo({ confirmation }),
  };
}
