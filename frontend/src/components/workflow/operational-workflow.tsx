"use client";

import { displayTime, type DataStatus, type MapData, type Selection } from "@/lib/map/types";
import type { OperationalRows } from "@/lib/map/backend-data";
import { ActionFeedback, useActionRunner } from "./action-feedback";
import type { WorkflowActions } from "./actions";
import { PriorityQueue } from "./priority-queue";

/**
 * Person 4 operational controls, mounted in MapDashboard's workflowPanel.
 * Every change goes through the shared SpacetimeDB connection; results arrive
 * back through the subscription, so a second browser session sees them too.
 */
export function OperationalWorkflow({ data, rows, status, identity, actions, database, uri, selection = null, onSelect }: {
  data: MapData; rows?: OperationalRows; status: DataStatus; identity?: string; actions: WorkflowActions;
  database?: string; uri?: string; selection?: Selection; onSelect?: (selection: Selection) => void;
}) {
  const { run, busy, feedback, clear } = useActionRunner();
  const connected = status === "connected";
  // Acts on the household selected on the map or in the queue; a dropdown would
  // render every household (10,000+ in the Demo preset).
  const household = selection?.kind === "household" ? data.households.find(item => item.id === selection.id) : undefined;

  return <div className="workflow">
    <div className="workflow-header">
      <div><p className="eyebrow">Operational workflow</p><h2>Outreach & response</h2></div>
      <span className="muted small">{connected ? "Changes sync live to every connected employee." : "Controls are available once operational data is connected."}</span>
    </div>
    <ActionFeedback feedback={feedback} onDismiss={clear} />
    <PriorityQueue rows={connected ? rows : undefined} connected={connected} busy={busy} selection={selection} onSelect={onSelect} actions={actions} run={run} />

    <div className="workflow-card">
      <h3>Record outreach</h3>
      {household
        ? <p className="muted small"><strong>{household.name}</strong> · {household.checkIn.replace("_", " ")} · Last contact: {displayTime(household.lastContactAt)}</p>
        : <p className="muted small">Select a household on the map or in the priority queue.</p>}
      <button type="button" className="workflow-button" disabled={!connected || !household || busy}
        onClick={() => household && run(`Mark ${household.name} contacted`, () => actions.recordOutreach(household.id), `${household.name} marked contacted (simulated outreach).`)}>
        Mark contacted
      </button>
    </div>

    <div className="guidance">
      {database && <p>Database: <strong>{database}</strong>{uri && <> · {uri}</>}</p>}
      {identity && <p>Employee identity: <code style={{ overflowWrap: "anywhere" }}>{identity}</code></p>}
      {connected && !data.zones.length && <p>No visible scenario data. An administrator must enroll this identity; an enrolled employee may also see an empty database until it is seeded.</p>}
      <small>Synthetic demo data. Outreach is simulated; no messages are sent. Team grouping is for display and does not recommend dispatch.</small>
    </div>
  </div>;
}
