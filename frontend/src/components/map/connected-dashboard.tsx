"use client";

import { useMemo } from "react";
import { OutreachDashboard } from "./outreach-dashboard";
import { MapDashboard } from "./map-dashboard";
import { ConnectedWorkspace } from "./connected-workspace";
import { createWorkflowActions } from "@/components/workflow/actions";
import { useOperationalConnection } from "@/lib/response/use-operational-connection";

export function ConnectedDashboard({ uri, database, areaId }: { uri: string; database: string; areaId?: string }) {
  const { conn: activeConnection, snapshot: state } = useOperationalConnection(uri, database);
  const actions = useMemo(() => createWorkflowActions(() => activeConnection), [activeConnection]);
  if (areaId !== undefined) return <OutreachDashboard {...state} areaId={areaId}/>;
  const { shared } = state;
  return <MapDashboard {...state}
    sharedDashboard={shared && state.status === "connected" ? { ...shared, onAction: action => actions.dashboardAction(action, { expectedRunId: shared.runId, expectedMinute: shared.state.minute }) } : undefined}
    renderWorkspace={activeConnection && state.status === "connected" ? (data, zone, selection, onSelect) =>
      <ConnectedWorkspace key={zone.id} conn={activeConnection} data={data} zone={zone} selection={selection} onSelect={onSelect}/> : undefined}/>;
}
