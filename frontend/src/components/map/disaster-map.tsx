"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { hazards, type MapData, type Selection } from "@/lib/map/types";

// Set textContent so future backend labels are rendered as text rather than HTML.
function tooltip(text: string) {
  const element = document.createElement("span");
  element.textContent = text;
  return element;
}

// Fit the contiguous U.S. to the available canvas, including narrow phone layouts.
function fitOverview(instance: L.Map) {
  instance.fitBounds([[24, -125], [50, -66]], { padding: [24, 24], animate: false });
}

interface Props { data: MapData; selection: Selection; onSelect: (selection: Selection) => void; overviewVersion: number }
export default function DisasterMap({ data, selection, onSelect, overviewVersion }: Props) {
  // Leaflet owns the DOM inside this container; refs retain its instance across React renders.
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const atOverview = useRef(true);
  const [tileError, setTileError] = useState(false);
  // Create the basemap once. Cleanup also supports React development-mode remounts.
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { minZoom: 2, maxZoom: 17, scrollWheelZoom: true });
    map.current = instance;
    fitOverview(instance);
    atOverview.current = true;
    instance.on("movestart", () => { atOverview.current = false; });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' })
      .on("tileerror", () => setTileError(true)).addTo(instance);
    // Panel and viewport resizing must notify Leaflet to avoid gaps in the tile layout.
    const resize = new ResizeObserver(() => {
      instance.invalidateSize();
      // Keep the overview fitted on resize, but preserve user pan/zoom and record focus.
      if (atOverview.current) {
        fitOverview(instance);
        atOverview.current = true;
      }
    });
    resize.observe(container.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; };
  }, []);
  // Replace scenario overlays when filters, records, or selection change; retain the basemap.
  useEffect(() => {
    if (!map.current) return;
    const layers = L.layerGroup().addTo(map.current);
    data.zones.forEach(zone => {
      // Color identifies the hazard; outline style/weight indicates severity and selection.
      const polygon = L.polygon(zone.boundary, { color: hazards[zone.hazard].color, weight: selection?.kind === "zone" && selection.id === zone.id ? 5 : zone.severity === "critical" ? 3 : zone.severity === "high" ? 2 : 1, fillOpacity: 0.22, dashArray: zone.severity === "moderate" ? "5 5" : undefined }).addTo(layers);
      polygon.bindTooltip(tooltip(`${zone.name} · ${hazards[zone.hazard].label} · ${zone.severity}`));
      polygon.on("click", () => onSelect({ kind: "zone", id: zone.id }));
    });
    // Check-in color does not imply that outstanding assistance requests are resolved.
    data.households.forEach(household => {
      L.circleMarker(household.position, { radius: selection?.kind === "household" && selection.id === household.id ? 10 : 7, color: "#fff", weight: 2, fillColor: household.checkIn === "safe" ? "#35816f" : "#b74943", fillOpacity: 1 })
        .bindTooltip(tooltip(household.name)).on("click", () => onSelect({ kind: "household", id: household.id })).addTo(layers);
    });
    data.teams.forEach(team => {
      L.marker(team.position, { icon: L.divIcon({ className: "team-marker", html: "+", iconSize: [24, 24], iconAnchor: [12, 12] }), title: team.name, alt: team.name })
        .bindTooltip(tooltip(team.name)).on("click", () => onSelect({ kind: "team", id: team.id })).addTo(layers);
    });
    return () => { layers.remove(); };
  }, [data, selection, onSelect]);
  // Selecting a zone fits its boundary; selecting an individual record zooms to its location.
  useEffect(() => {
    if (!map.current || !selection) return;
    atOverview.current = false;
    if (selection.kind === "zone") {
      const zone = data.zones.find(item => item.id === selection.id);
      if (zone) map.current.fitBounds(L.latLngBounds(zone.boundary), { padding: [55, 55], maxZoom: 11 });
    } else {
      const item = (selection.kind === "household" ? data.households : data.teams).find(item => item.id === selection.id);
      if (item) map.current.setView(item.position, 12);
    }
    // Only selection changes should reposition the user's map; data updates preserve navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);
  // A counter lets Reset view work repeatedly, even when nothing is selected.
  useEffect(() => {
    if (overviewVersion > 0 && map.current) {
      fitOverview(map.current);
      atOverview.current = true;
    }
  }, [overviewVersion]);
  return <div className="map-wrapper">
    <div ref={container} className="map-canvas" role="region" aria-label="Interactive U.S. disaster map. Use the hotspot list to select zones and the detail panel to select households or teams." />
    {tileError && <div className="tile-warning" role="alert">Some basemap tiles could not load. Check your connection, then <button onClick={() => window.location.reload()}>reload</button>. Scenario layers and the hotspot list remain available.</div>}
  </div>;
}
