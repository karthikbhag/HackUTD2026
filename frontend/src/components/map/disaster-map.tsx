"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { hazards, type MapData, type Selection } from "@/lib/map/types";
import { HOUSEHOLD_ZOOM, viewportHouseholds } from "@/lib/map/presentation";

function tooltip(text: string) {
  const element = document.createElement("span");
  element.textContent = text;
  return element;
}
function fitOverview(instance: L.Map) {
  instance.fitBounds([[18, -171], [72, -65]], { padding: [24, 24], animate: false });
}
interface Props { data: MapData; selection: Selection; onSelect: (selection: Selection) => void; overviewVersion: number }
export default function DisasterMap({ data, selection, onSelect, overviewVersion }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const atOverview = useRef(true);
  const currentSelection = useRef(selection);
  const currentData = useRef(data);
  const householdMarkers = useRef(new Map<string, L.CircleMarker>());
  const zonePolygons = useRef(new Map<string, L.Polygon>());
  const [tileError, setTileError] = useState(false);
  const [drawn, setDrawn] = useState(0);
  useEffect(() => { currentData.current = data; }, [data]);
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { minZoom: 2, maxZoom: 17, scrollWheelZoom: true, preferCanvas: true });
    map.current = instance;
    fitOverview(instance);
    atOverview.current = true;
    instance.on("movestart", () => { atOverview.current = false; });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' })
      .on("tileerror", () => setTileError(true)).addTo(instance);
    const resize = new ResizeObserver(() => {
      instance.invalidateSize();
      if (atOverview.current) { fitOverview(instance); atOverview.current = true; }
    });
    resize.observe(container.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; };
  }, []);
  // Geometry is rebuilt only when records/filters change, never on selection.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const geometry = L.layerGroup().addTo(instance);
    const summaries = L.layerGroup().addTo(instance);
    const records = L.layerGroup().addTo(instance);
    const polygons = zonePolygons.current;
    const markers = householdMarkers.current;
    polygons.clear();
    const counts = new Map<string, number>();
    for (const row of data.households) { const id = row.hotspotId ?? row.zoneId; counts.set(id, (counts.get(id) ?? 0) + 1); }
    for (const zone of data.zones) {
      const color = hazards[zone.hazard].color;
      const polygon = L.polygon(zone.contextBoundary ?? zone.boundary, { color, fill: false, weight: currentSelection.current?.kind === "zone" && currentSelection.current.id === zone.id ? 4 : 1, dashArray: "5 5" }).addTo(geometry);
      polygons.set(zone.id, polygon);
      polygon.bindTooltip(tooltip(`${zone.name} · Geographic context only`));
      polygon.on("click", () => onSelect({ kind: "zone", id: zone.id }));
      const center = L.latLngBounds(zone.boundary).getCenter();
      L.circleMarker(center, { radius: 18, color, fillColor: color, fillOpacity: 0.9, weight: 2 })
        .bindTooltip(tooltip(String(counts.get(zone.id) ?? 0)), { permanent: true, direction: "center", className: "hotspot-count" })
        .on("click", () => onSelect({ kind: "zone", id: zone.id })).addTo(summaries);
    }
    for (const layer of data.impactLayers ?? []) {
      L.polygon(layer.boundary, { color: hazards[layer.hazard].color, fillOpacity: layer.severity === "high" ? 0.24 : 0.12, weight: layer.severity === "high" ? 2 : 1 })
        .bindTooltip(tooltip(`${layer.label} · ${layer.severity} · ${layer.severityBasis}`))
        .on("click", () => onSelect({ kind: "zone", id: layer.hotspotId })).addTo(geometry);
    }
    const refreshViewport = () => {
      records.clearLayers(); markers.clear();
      const local = instance.getZoom() >= HOUSEHOLD_ZOOM;
      if (local) summaries.remove(); else if (!instance.hasLayer(summaries)) summaries.addTo(instance);
      const bounds = instance.getBounds().pad(0.1);
      const households = viewportHouseholds(data.households, instance.getZoom(), { south: bounds.getSouth(), north: bounds.getNorth(), west: bounds.getWest(), east: bounds.getEast() });
      for (const row of households) {
        const selected = currentSelection.current?.kind === "household" && currentSelection.current.id === row.id;
        const marker = L.circleMarker(row.position, { radius: selected ? 10 : 6, color: "#fff", weight: 1, fillColor: row.checkIn === "safe" ? "#35816f" : "#b74943", fillOpacity: 1 })
          .bindTooltip(tooltip(`${row.name} · ${row.membership ?? "neighborhood"}`))
          .on("click", () => onSelect({ kind: "household", id: row.id })).addTo(records);
        markers.set(row.id, marker);
      }
      if (local) for (const row of data.teams) if (bounds.contains(row.position)) {
        L.marker(row.position, { icon: L.divIcon({ className: "team-marker", html: "+", iconSize: [24, 24], iconAnchor: [12, 12] }), title: row.name, alt: row.name })
          .bindTooltip(tooltip(row.name)).on("click", () => onSelect({ kind: "team", id: row.id })).addTo(records);
      }
      setDrawn(households.length);
    };
    instance.on("moveend resize", refreshViewport);
    refreshViewport();
    return () => { instance.off("moveend resize", refreshViewport); geometry.remove(); summaries.remove(); records.remove(); markers.clear(); polygons.clear(); };
  }, [data, onSelect]);
  // Restyle just the previous/current selection. Keep the rest of the map intact.
  useEffect(() => {
    const previous = currentSelection.current;
    if (previous?.kind === "household") householdMarkers.current.get(previous.id)?.setRadius(6);
    if (previous?.kind === "zone") zonePolygons.current.get(previous.id)?.setStyle({ weight: 1 });
    currentSelection.current = selection;
    if (selection?.kind === "household") householdMarkers.current.get(selection.id)?.setRadius(10);
    if (selection?.kind === "zone") zonePolygons.current.get(selection.id)?.setStyle({ weight: 4 });
    const instance = map.current;
    if (!instance || !selection) return;
    atOverview.current = false;
    const records = currentData.current;
    if (selection.kind === "zone") {
      const zone = records.zones.find(row => row.id === selection.id);
      if (zone) instance.fitBounds(L.latLngBounds(zone.contextBoundary ?? zone.boundary), { padding: [40, 40], maxZoom: 11 });
    } else {
      const row = (selection.kind === "household" ? records.households : records.teams).find(row => row.id === selection.id);
      if (row) instance.setView(row.position, Math.max(12, instance.getZoom()));
    }
  }, [selection]);
  useEffect(() => {
    if (overviewVersion > 0 && map.current) { fitOverview(map.current); atOverview.current = true; }
  }, [overviewVersion]);
  return <div className="map-wrapper">
    <div ref={container} className="map-canvas" role="region" aria-label="Interactive U.S. disaster map. Select a hotspot to zoom, then select households or teams." />
    <div className="map-render-count" role="status">{drawn.toLocaleString()} household markers drawn (padded viewport). Zoom {HOUSEHOLD_ZOOM}+ for individual records.</div>
    {tileError && <div className="tile-warning" role="alert">Some basemap tiles could not load. Scenario overlays and hotspot navigation remain available.</div>}
  </div>;
}
