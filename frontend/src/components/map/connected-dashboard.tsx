"use client";

import { useEffect, useState } from "react";
import { DbConnection, tables } from "@/module_bindings";
import { toMapData, type OperationalRows } from "@/lib/map/backend-data";
import type { DataStatus, MapData } from "@/lib/map/types";
import { MapDashboard } from "./map-dashboard";
import { OperationalWorkflow } from "@/components/workflow/operational-workflow";
import { ConnectionLink } from "@/components/workflow/actions";

const empty: MapData = { zones: [], households: [], teams: [] };

export function ConnectedDashboard({ uri, database }: { uri: string; database: string }) {
  const [state, setState] = useState<{ data: MapData; rows?: OperationalRows; status: DataStatus; errorMessage?: string; identity?: string }>({ data: empty, status: "loading" });
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
          setState({ data: toMapData(rows), rows, status: "connected", identity });
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
      const handles = [connection.db.disasters, connection.db.zones, connection.db.households, connection.db.requests, connection.db.teams, connection.db.tasks, connection.db.assignments, connection.db.impactLayers];
      for (const table of handles) {
        table.onInsert(changed); table.onDelete(changed); table.onUpdate(changed);
      }
      const subscription = connection.subscriptionBuilder()
        .onApplied(() => { ready = true; refresh(); })
        .onError(ctx => fail(ctx.event))
        .subscribe([tables.disasters, tables.zones, tables.households, tables.requests, tables.teams, tables.tasks, tables.assignments, tables.impactLayers]);
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

  const { rows, ...dashboard } = state;
  return <MapDashboard {...dashboard} workflowPanel={({ selection, onSelect }) => <OperationalWorkflow data={state.data} rows={rows} status={state.status} identity={state.identity} actions={link.actions} database={database} uri={uri} selection={selection} onSelect={onSelect} />} />;
}
