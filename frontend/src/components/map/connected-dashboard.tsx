"use client";

import Link from "next/link";
import { OutreachDashboard } from "./outreach-dashboard";
import { useOperationalConnection } from "@/lib/response/use-operational-connection";
import { MapDashboard } from "./map-dashboard";
import { ConnectedWorkspace } from "./connected-workspace";


export function ConnectedDashboard({ uri, database, areaId }: { uri: string; database: string; areaId?: string }) {
  const { conn: activeConnection, snapshot: state } = useOperationalConnection(uri, database);
  if (areaId !== undefined) return <OutreachDashboard {...state} areaId={areaId}/>;
  return <MapDashboard {...state} renderWorkspace={activeConnection && state.status === "connected" ? (data, zone, selection, onSelect) =>
    <ConnectedWorkspace key={zone.id} conn={activeConnection} data={data} zone={zone} selection={selection} onSelect={onSelect} /> : undefined} workflowPanel={<div className="guidance">
    <h3>Shared operational map</h3>
    {state.routingError && <p role="alert">{state.routingError}</p>}
    <p><Link href="/response">Open simulated response teams →</Link></p>
    <p>{state.visits.filter(v => v.priority === "urgent" && !["completed","cancelled"].includes(v.state)).length} urgent · {state.visits.filter(v => v.priority === "unknown" && !["completed","cancelled"].includes(v.state)).length} unknown welfare checks</p>
    {state.visits.filter(v => v.state === "pending" && v.notice).map(v => <p key={String(v.id)}>{v.notice}</p>)}
    {state.routes.some(r => r.status === "stale") && <p>Route estimates stale; worker retry pending.</p>}
    {state.teamStates.length > 0 && <p>Latest simulated location: {new Date(Math.max(...state.teamStates.map(s=>s.updatedAt.toDate().getTime()))).toLocaleTimeString()}</p>}
    <p>Database: <strong>{database}</strong> · {uri}</p>
    <p>Shared scenario desk: employee-reviewed actions and Person 3 decisions persist in SpacetimeDB. Notices and replies are simulated.</p>
    {state.identity && <p>Employee identity: <code style={{ overflowWrap: "anywhere" }}>{state.identity}</code></p>}
    {state.status === "connected" && !state.data.zones.length && <p>No visible scenario data. An administrator must enroll this identity; an enrolled employee may also see an empty database until it is seeded.</p>}
    <small>Scenario polygons and preparedness tasks are synthetic integration fixtures. Team grouping is for display and does not recommend dispatch.</small>
  </div>} />;
}
