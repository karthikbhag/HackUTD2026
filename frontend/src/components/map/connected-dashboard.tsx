"use client";

import Link from "next/link";
import { useMemo } from "react";
import { OutreachDashboard } from "./outreach-dashboard";
import { MapDashboard } from "./map-dashboard";
import { ConnectedWorkspace } from "./connected-workspace";
import { OperationalWorkflow } from "@/components/workflow/operational-workflow";
import { createWorkflowActions } from "@/components/workflow/actions";
import { needsAttention } from "@/lib/map/dashboard-scenario";
import { useOperationalConnection } from "@/lib/response/use-operational-connection";

export function ConnectedDashboard({ uri, database, areaId }: { uri: string; database: string; areaId?: string }) {
  const { conn: activeConnection, snapshot: state } = useOperationalConnection(uri, database);
  const actions = useMemo(() => createWorkflowActions(() => activeConnection), [activeConnection]);
  if (areaId !== undefined) return <OutreachDashboard {...state} areaId={areaId}/>;
  const { rows, shared } = state;
  const queueData = shared ? { ...state.data, households: state.data.households.filter(h => needsAttention(shared.state, h, shared.state.minute < 0 ? "before" : "after")) } : state.data;
  const queueIds = new Set(queueData.households.map(h => h.id));
  const overdue = shared ? Object.values(shared.state.areas).flatMap(a => a.after && shared.state.minute >= a.after.sentAt + 30
    ? a.after.recipients.filter(id => !a.after!.replies[id] && !shared.state.assignments[id]) : []) : [];
  const queueRows = rows && shared ? { ...rows, households: rows.households.filter(h => queueIds.has(String(h.id))),
    requests: rows.requests.filter(r => queueIds.has(String(r.householdId))), dashboardOverdueHouseholdIds: overdue } : rows;
  return <MapDashboard {...state}
    sharedDashboard={shared && state.status === "connected" ? { ...shared, onAction: action => actions.dashboardAction(action, { expectedRunId: shared.runId, expectedMinute: shared.state.minute }) } : undefined}
    renderWorkspace={activeConnection && state.status === "connected" ? (data, zone, selection, onSelect) =>
      <ConnectedWorkspace key={zone.id} conn={activeConnection} data={data} zone={zone} selection={selection} onSelect={onSelect}/> : undefined}
    workflowPanel={({ selection, onSelect }) => <>
      <div className="guidance">
        <h3>Shared operational map</h3>
        {state.routingError && <p role="alert">{state.routingError}</p>}
        <p><Link href="/response">Open simulated response teams</Link></p>
        <p>{state.visits.filter(v => v.priority === "urgent" && !["completed", "cancelled"].includes(v.state)).length} urgent / {state.visits.filter(v => v.priority === "unknown" && !["completed", "cancelled"].includes(v.state)).length} unknown welfare checks</p>
        {state.visits.filter(v => v.state === "pending" && v.notice).map(v => <p key={String(v.id)}>{v.notice}</p>)}
        {state.routes.some(r => r.status === "stale") && <p>Route estimates stale; worker retry pending.</p>}
        {state.teamStates.length > 0 && <p>Latest simulated location: {new Date(Math.max(...state.teamStates.map(s => s.updatedAt.toDate().getTime()))).toLocaleTimeString()}</p>}
        <p>The scenario desk uses separate per-disaster check-ins. Dashboard popups use the shared dashboard clock and carry safe preparation replies forward. Notices and replies are simulated.</p>
      </div>
      <OperationalWorkflow data={queueData} rows={queueRows} status={state.status} identity={state.identity} actions={actions} database={database} uri={uri} selection={selection} onSelect={onSelect}/>
    </>}/>;
}
