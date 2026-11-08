import type { Assignment, DashboardInfoRow, DashboardNotice, DashboardRecipient, DashboardResponse } from "../../module_bindings/types";
import type { DashboardAction, DashboardScenario } from "./dashboard-scenario";

export interface SharedDashboard {
  runId: bigint;
  state: DashboardScenario;
  ready: boolean;
  canReset: boolean;
  assignmentStatuses: Record<string, string>;
  onAction: (action: DashboardAction) => Promise<void>;
}

/** A linear join of subscribed rows; never mutates the browser's local rehearsal. */
export function sharedDashboardSnapshot(info: DashboardInfoRow | undefined, notices: readonly DashboardNotice[], recipients: readonly DashboardRecipient[],
  responses: readonly DashboardResponse[], assignments: readonly Assignment[]) {
  const state: DashboardScenario = { minute: info?.minute ?? -120, areas: {}, assignments: {} };
  const rounds = new Map<string, NonNullable<DashboardScenario["areas"][string]["before"]>>();
  for (const notice of notices) if (notice.runId === info?.runId) {
    const round = { recipients: [] as string[], sentAt: notice.sentAt, message: notice.message, replies: {} as Record<string, "safe" | "needs_help"> };
    const area = state.areas[String(notice.areaId)] ?? {};
    if (notice.phase === "before" || notice.phase === "after") area[notice.phase] = round;
    state.areas[String(notice.areaId)] = area; rounds.set(notice.id, round);
  }
  for (const recipient of recipients) {
    const round = rounds.get(recipient.noticeId);
    if (!round) continue;
    const id = String(recipient.householdId); round.recipients.push(id);
    if (recipient.status === "safe" || recipient.status === "needs_help") round.replies[id] = recipient.status;
  }
  const byId = new Map(assignments.map(a => [a.id, a])), assignmentStatuses: Record<string, string> = {};
  for (const response of responses) {
    const assignment = byId.get(response.assignmentId);
    if (response.runId !== info?.runId || !assignment || assignment.status === "cancelled") continue;
    state.assignments[String(response.householdId)] = String(assignment.teamId);
    assignmentStatuses[String(response.householdId)] = assignment.status;
  }
  return { state, runId: info?.runId ?? 0n, ready: !!info, canReset: info?.canReset ?? false, assignmentStatuses };
}
