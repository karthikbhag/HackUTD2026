"use client";

import { useEffect, useState } from "react";
import { DbConnection, tables } from "@/module_bindings";
import { toMapData, type OperationalRows } from "@/lib/map/backend-data";
import type { DataStatus, MapData } from "@/lib/map/types";
import { MapDashboard } from "./map-dashboard";
import { OutreachDashboard } from "./outreach-dashboard";
import { OperationalWorkflow } from "@/components/workflow/operational-workflow";
import { ConnectionLink } from "@/components/workflow/actions";
import { sharedDashboardSnapshot } from "@/lib/map/shared-dashboard";
import type { SharedDashboard } from "@/lib/map/shared-dashboard";
import { needsAttention } from "@/lib/map/dashboard-scenario";

const empty: MapData = { zones: [], households: [], teams: [] };

export function ConnectedDashboard({ uri, database, areaId }: { uri: string; database: string; areaId?: string }) {
  const [state, setState] = useState<{ data: MapData; rows?: OperationalRows; shared?: Omit<SharedDashboard, "onAction">; status: DataStatus; errorMessage?: string; identity?: string }>({ data: empty, status: "loading" });
  // Person 4: reducer calls reuse this single connection; no second identity is opened.
  const [link] = useState(() => new ConnectionLink());
  useEffect(() => {
    let disposed = false;
    let ready = false;
    let queued = false;
    let identity: string | undefined;
    const tokenKey = `riskreach:${uri}/${database}:token`;
    const fail = (error: unknown) => {
      ready = false;
      if (!disposed) setState({ data: empty, status: "error", identity, errorMessage: error instanceof Error ? error.message : String(error) });
    };
    let conn: DbConnection | undefined;
    try {
      conn = DbConnection.builder().withUri(uri).withDatabaseName(database)
        .withToken(localStorage.getItem(tokenKey) ?? undefined)
        .withAutomaticReconnect()
        .onConnect((_connection, who, token) => {
          if (disposed) return;
          identity = who.toHexString();
          localStorage.setItem(tokenKey, token);
          setState({ data: empty, status: "loading", identity });
        })
        .onConnectError((_ctx, error) => fail(error))
        .onDisconnect((_ctx, error) => fail(error ?? new Error("Operational connection closed.")))
        .build();
      const connection = conn;
      const detach = link.attach(connection);
      const refresh = () => {
        if (disposed || !ready) return;
        try {
          const rows: OperationalRows = {
            disasters: [...connection.db.disasters.iter()], zones: [...connection.db.zones.iter()],
            households: [...connection.db.households.iter()], requests: [...connection.db.requests.iter()],
            teams: [...connection.db.teams.iter()], tasks: [...connection.db.tasks.iter()],
            assignments: [...connection.db.assignments.iter()], impactLayers: [...connection.db.impactLayers.iter()],
          };
          // Raw rows also feed Person 4's queue, which needs request urgency and microsecond timestamps.
          const shared = sharedDashboardSnapshot([...connection.db.dashboardState.iter()][0], [...connection.db.dashboardNotices.iter()],
            [...connection.db.dashboardRecipients.iter()], [...connection.db.dashboardResponses.iter()], rows.assignments);
          setState({ data: toMapData(rows), rows, shared, status: "connected", identity });
        } catch (error) {
          // Keep listening: a later valid transaction can repair malformed data.
          if (!disposed) setState({ data: empty, status: "error", identity, errorMessage: error instanceof Error ? error.message : String(error) });
        }
      };
      // Batch row callbacks after the transaction so joins see a consistent cache.
      const changed = () => {
        if (queued || disposed) return;
        queued = true;
        queueMicrotask(() => { queued = false; refresh(); });
      };
      const handles = [connection.db.disasters, connection.db.zones, connection.db.households, connection.db.requests, connection.db.teams, connection.db.tasks, connection.db.assignments, connection.db.impactLayers,
        connection.db.dashboardState, connection.db.dashboardNotices, connection.db.dashboardRecipients, connection.db.dashboardResponses];
      for (const table of handles) {
        table.onInsert(changed); table.onDelete(changed); table.onUpdate(changed);
      }
      const subscription = connection.subscriptionBuilder()
        .onApplied(() => { ready = true; refresh(); })
        .onError(ctx => fail(ctx.event))
        .subscribe([tables.disasters, tables.zones, tables.households, tables.requests, tables.teams, tables.tasks, tables.assignments, tables.impactLayers,
          tables.dashboardState, tables.dashboardNotices, tables.dashboardRecipients, tables.dashboardResponses]);
      return () => {
        disposed = true;
        for (const table of handles) {
          table.removeOnInsert(changed); table.removeOnDelete(changed); table.removeOnUpdate(changed);
        }
        subscription.unsubscribe();
        detach();
        connection.disconnect();
      };
    } catch (error) { fail(error); conn?.disconnect(); }
    return () => { disposed = true; };
  }, [uri, database, link]);

  if (areaId !== undefined) return <OutreachDashboard {...state} areaId={areaId}/>;
  const { rows, shared, ...dashboard } = state;
  const queueData = shared ? { ...state.data, households: state.data.households.filter(h => needsAttention(shared.state, h, shared.state.minute < 0 ? "before" : "after")) } : state.data;
  const queueIds = new Set(queueData.households.map(h => h.id));
  const overdue = shared ? Object.values(shared.state.areas).flatMap(a => a.after && shared.state.minute >= a.after.sentAt + 30
    ? a.after.recipients.filter(id => !a.after!.replies[id] && !shared.state.assignments[id]) : []) : [];
  const queueRows = rows && shared ? { ...rows, households: rows.households.filter(h => queueIds.has(String(h.id))),
    requests: rows.requests.filter(r => queueIds.has(String(r.householdId))), dashboardOverdueHouseholdIds: overdue } : rows;
  return <MapDashboard {...dashboard} sharedDashboard={shared && state.status === "connected" ? { ...shared, onAction: action => link.actions.dashboardAction(action, { expectedRunId: shared.runId, expectedMinute: shared.state.minute }) } : undefined} workflowPanel={({ selection, onSelect }) => <OperationalWorkflow data={queueData} rows={queueRows} status={state.status} identity={state.identity} actions={link.actions} database={database} uri={uri} selection={selection} onSelect={onSelect} />} />;
}
