"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AreaBrief } from "./area-brief";
import type { MapData, MapZone, Phase, Selection } from "@/lib/map/types";

const DisasterMap = dynamic(() => import("./disaster-map"), { ssr: false, loading: () => <div className="map-loading" role="status">Loading area map…</div> });

export function outreachHref(zoneId: string, demo: boolean) {
  return `/outreach?${new URLSearchParams({ area: zoneId, mode: demo ? "demo" : "connected" })}`;
}

export function AreaReviewDialog({ data, zone, phase, demo, onClose, onTakeAction }: { data: MapData; zone: MapZone; phase: Phase; demo: boolean; onClose: () => void; onTakeAction?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selection, setSelection] = useState<Selection>({ kind: "zone", id: zone.id });
  const areaData = useMemo<MapData>(() => ({
    zones: data.zones.filter(row => row.id === zone.id),
    households: data.households.filter(row => (row.hotspotId ?? row.zoneId) === zone.id),
    teams: data.teams.filter(row => (row.hotspotId ?? row.zoneId) === zone.id),
    impactLayers: data.impactLayers?.filter(row => row.hotspotId === zone.id),
  }), [data, zone.id]);
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    // Leaflet needs the dialog's visible dimensions when it initializes.
    const frame = requestAnimationFrame(() => setMapReady(true));
    return () => {
      cancelAnimationFrame(frame);
      element?.close();
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className="area-review-dialog" aria-labelledby="area-review-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="area-review-content">
      <header className="dialog-heading"><div><p className="eyebrow">Area intelligence</p><h2 id="area-review-title">Disaster area review</h2></div><button className="dialog-close" aria-label="Close area review" onClick={onClose} autoFocus>×</button></header>
      <div className="dialog-review-body">
      <section className="dialog-area-map map-panel" aria-label={`${zone.name} area map`}>
        {mapReady ? <DisasterMap data={areaData} selection={selection} onSelect={setSelection} overviewVersion={0}/> : <div className="map-loading" role="status">Loading area map…</div>}
        <div className="map-legend"><span><i className="household-key"/> Household</span><span><i className="team-key">+</i> Response team</span><span>Dashed = context · Filled = hazard footprints</span></div>
      </section>
      <AreaBrief data={data} zone={zone} phase={phase}/>
      </div>
      <footer className="dialog-actions"><button className="outline-button" onClick={onClose}>Back to map</button>{onTakeAction ? <button className="primary-button" onClick={onTakeAction}>Take action <span aria-hidden="true">→</span></button> : <Link className="primary-button" href={outreachHref(zone.id, demo)} onClick={onClose}>Take action <span aria-hidden="true">→</span></Link>}</footer>
    </div>
  </dialog>;
}
