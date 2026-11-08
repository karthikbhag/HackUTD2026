"use client";

import { useEffect, useState } from "react";
import { DbConnection, tables } from "@/module_bindings";
import { toMapData } from "@/lib/map/backend-data";
import type { DataStatus, MapData } from "@/lib/map/types";
import { MapDashboard } from "./map-dashboard";
import { ConnectedWorkspace } from "./connected-workspace";

const empty: MapData = { zones: [], households: [], teams: [] };

export function ConnectedDashboard({ uri, database }: { uri: string; database: string }) {
  const [activeConnection, setActiveConnection] = useState<DbConnection | null>(null);
  const [state, setState] = useState<{ data: MapData; status: DataStatus; errorMessage?: string; identity?: string }>({ data: empty, status: "loading" });
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
        .onConnect((connection, who, token) => {
          if (disposed) return;
          identity = who.toHexString();
          setActiveConnection(connection);
          localStorage.setItem(tokenKey, token);
          setState({ data: empty, status: "loading", identity });
        })
        .onConnectError((_ctx, error) => fail(error))
        .onDisconnect((_ctx, error) => fail(error ?? new Error("Operational connection closed.")))
        .build();
      const connection = conn;
      const refresh = () => {
        if (disposed || !ready) return;
        try {
          const data = toMapData({
            disasters: [...connection.db.disasters.iter()], zones: [...connection.db.zones.iter()],
            households: [...connection.db.households.iter()], requests: [...connection.db.requests.iter()],
            teams: [...connection.db.teams.iter()], tasks: [...connection.db.tasks.iter()],
            assignments: [...connection.db.assignments.iter()], impactLayers: [...connection.db.impactLayers.iter()],
          });
          setState({ data, status: "connected", identity });
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
        connection.disconnect();
      };
    } catch (error) { fail(error); conn?.disconnect(); }
    return () => { disposed = true; };
  }, [uri, database]);

  return <MapDashboard {...state} renderWorkspace={activeConnection && state.status === "connected" ? (data, zone, selection, onSelect) =>
    <ConnectedWorkspace key={zone.id} conn={activeConnection} data={data} zone={zone} selection={selection} onSelect={onSelect} /> : undefined} workflowPanel={<div className="guidance">
    <h3>Shared operational map</h3>
    <p>Database: <strong>{database}</strong> · {uri}</p>
    <p>Shared scenario desk: employee-reviewed actions and Person 3 decisions persist in SpacetimeDB. Notices and replies are simulated.</p>
    {state.identity && <p>Employee identity: <code style={{ overflowWrap: "anywhere" }}>{state.identity}</code></p>}
    {state.status === "connected" && !state.data.zones.length && <p>No visible scenario data. An administrator must enroll this identity; an enrolled employee may also see an empty database until it is seeded.</p>}
    <small>Scenario polygons and preparedness tasks are synthetic integration fixtures. Team grouping is for display and does not recommend dispatch.</small>
  </div>} />;
}
