"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AreaReviewDialog } from "./area-review-dialog";
import { ScenarioWorkspace } from "./scenario-workspace";
import { hazards, type DataStatus, type MapData } from "@/lib/map/types";
import { PAGE_SIZE } from "@/lib/map/presentation";

export function OutreachDashboard({ data, status, areaId, errorMessage }: { data: MapData; status: DataStatus; areaId: string; errorMessage?: string }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [page, setPage] = useState(0);
  const openReview = useCallback(() => setReviewOpen(true), []);
  const demo = status === "demo";
  const back = demo ? "/demo" : "/";
  const zone = data.zones.find(zone => zone.id === areaId);
  const local = useMemo<MapData>(() => ({
    zones: data.zones.filter(zone => zone.id === areaId),
    households: data.households.filter(row => (row.hotspotId ?? row.zoneId) === areaId),
    teams: data.teams.filter(row => (row.hotspotId ?? row.zoneId) === areaId),
    impactLayers: data.impactLayers?.filter(layer => layer.hotspotId === areaId),
  }), [data, areaId]);
  if (!zone) return <main className="outreach-page"><Link className="outreach-back" href={back}>← Back to map</Link><section className="outreach-empty"><h1>{status === "loading" ? "Loading your area…" : status === "error" ? "Unable to load this area" : "Area unavailable"}</h1><p role={status === "error" ? "alert" : "status"}>{errorMessage || (status === "loading" ? "Waiting for the shared scenario subscription." : "This area is not in the available dataset. Return to the map and choose an area you can access.")}</p></section></main>;
  const order = { urgent: 0, needs_help: 1, unknown: 2, safe: 3 };
  const attention = local.households.filter(row => row.checkIn !== "safe" || row.needs.length > 0).sort((a, b) => order[a.checkIn] - order[b.checkIn]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(attention.length / PAGE_SIZE) - 1));
  return <main className="dashboard outreach-page">
    <div className="utility-bar"><span>State Farm · State Watch</span><span className="simulation-badge">{demo ? "Browser-local simulation" : "Connected · Read-only"}</span></div>
    <header className="outreach-heading"><Link className="outreach-back" href={back}>← Back to national map</Link><div className="desk-heading"><div><p className="eyebrow">{hazards[zone.hazard].label} · {zone.name}</p><h1>Take the next step.</h1><p className="muted">Prepare your outreach. See who needs attention. Keep every check-in in view.</p></div><button className="outline-button" onClick={openReview}>Review area details</button></div></header>
    {demo ? <ScenarioWorkspace key={areaId} data={local} zone={zone} demo/> : <section className="scenario-desk">
      <div className="desk-heading"><div><p className="eyebrow">Preparation outreach</p><h2>Households needing attention</h2><p className="muted small">Ordered by reported check-in status. Includes customer and community assistance needs.</p></div><span className="count">{attention.length.toLocaleString()} households</span></div>
      <p className="simulation-notice">Connected records are read-only. Notification approval and shared check-in updates are pending integration. <Link href="/demo">Choose a fictional demo area</Link> to rehearse the full workflow.</p>
      {attention.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(row => <div className="review-row" key={row.id}><span className="review-row-copy"><strong>{row.name}</strong><small>{row.needs.join(" · ") || "Safety not confirmed"} · {row.isCustomer ? "Customer" : "Community member"}</small></span><span className={`check-in ${row.checkIn}`}>{row.checkIn.replaceAll("_", " ")}</span></div>)}
      {!attention.length && <p className="empty-state">No households currently need attention in the supplied records.</p>}
      {attention.length > PAGE_SIZE && <div className="list-pagination"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {Math.ceil(attention.length / PAGE_SIZE)}</span><button disabled={(currentPage + 1) * PAGE_SIZE >= attention.length} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
    </section>}
    {reviewOpen && <AreaReviewDialog data={local} zone={zone} phase="before" demo={demo} onClose={() => setReviewOpen(false)}/>}
    <footer className="app-footer"><span>State Watch · Employee preparedness & response</span><span>{demo ? "Simulated messages and assignments · Nothing is delivered or dispatched" : "Shared source data · Employee review required"}</span></footer>
  </main>;
}
