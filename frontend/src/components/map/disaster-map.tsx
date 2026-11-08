"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import { hazards, type MapData, type MapHousehold, type Selection } from "@/lib/map/types";
import { HOUSEHOLD_ZOOM } from "@/lib/map/presentation";

// Include Alaska and Hawaii, matching the national scenario coverage.
const US_BOUNDS = L.latLngBounds([[18, -171], [72, -65]]);
function tooltip(text: string) {
  const element = document.createElement("span");
  element.textContent = text;
  return element;
}
function fitOptions(instance: L.Map): L.FitBoundsOptions {
  // Sidebars are grid siblings, already excluded from getSize(). Only reserve
  // space for content actually covering the canvas; never subtract them twice.
  const overlays = instance.getContainer().parentElement?.querySelector(".map-overlays");
  const bottom = overlays?.getBoundingClientRect().height ?? 0;
  if (instance.getContainer().closest(".dialog-area-map")) return { paddingTopLeft: [16, 20], paddingBottomRight: [16, bottom + 24], animate: false };
  return { paddingTopLeft: [32, 48], paddingBottomRight: [32, bottom + 40], animate: false };
}
function setUSPanBounds(instance: L.Map, zoom = instance.getZoom() ?? instance.getMinZoom()) {
  // Keep the viewport center within the US, including when its aspect ratio
  // requires showing some surrounding geography to fit Alaska and Hawaii.
  const half = instance.getSize().divideBy(2);
  const northWest = instance.project(US_BOUNDS.getNorthWest(), zoom).subtract(half);
  const southEast = instance.project(US_BOUNDS.getSouthEast(), zoom).add(half);
  const bounds = L.latLngBounds(instance.unproject(northWest, zoom), instance.unproject(southEast, zoom));
  // The maxBounds handler is installed at construction. Update its public option
  // and constrain synchronously: setMaxBounds would start an animated correction
  // against the old view, which can continue after selecting a new location.
  instance.options.maxBounds = bounds;
  if (Number.isFinite(instance.getZoom())) instance.panInsideBounds(bounds, { animate: false });
}
function fitMapBounds(instance: L.Map, bounds: L.LatLngBounds, maxZoom?: number) {
  const options = fitOptions(instance);
  if (Number.isFinite(instance.getZoom())) instance.stop();
  const padding = L.point(options.paddingTopLeft!).add(L.point(options.paddingBottomRight!));
  setUSPanBounds(instance, Math.min(maxZoom ?? instance.getMaxZoom(), instance.getBoundsZoom(bounds, false, padding)));
  instance.fitBounds(bounds, { ...options, maxZoom });
  setUSPanBounds(instance);
}
function householdIcon(row: MapHousehold, selected = false, zones: MapData["zones"] = []) {
  const size = selected ? 20 : 12;
  const element = document.createElement("span");
  element.className = "household-circle";
  const zone = zones.find(zone => zone.id === (row.hotspotId ?? row.zoneId));
  element.style.backgroundColor = zone ? hazards[zone.hazard].color : "#b74943";
  return L.divIcon({ className: "household-marker", html: element, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}
// Rebuilding an index can hide a selected marker again. Reveal it at the
// current view without navigating away from a user's subsequent pan or zoom.
function revealHousehold(group: L.MarkerClusterGroup | null, marker?: L.Marker) {
  if (!group || !marker) return;
  const parent = group.getVisibleParent(marker);
  if (!parent) return;
  if (parent instanceof L.MarkerCluster) parent.spiderfy();
  marker.openTooltip();
}
interface Props { data: MapData; selection: Selection; onSelect: (selection: Selection) => void; overviewVersion: number; onReview?: (zoneId: string) => void }
export default function DisasterMap({ data, selection, onSelect, overviewVersion, onReview }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const overlays = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const fittedView = useRef<{ bounds: L.LatLngBounds; maxZoom?: number } | null>({ bounds: US_BOUNDS });
  const currentSelection = useRef(selection);
  const currentData = useRef(data);
  const householdMarkers = useRef(new Map<string, L.Marker>());
  const clusters = useRef<L.MarkerClusterGroup | null>(null);
  const zonePolygons = useRef(new Map<string, L.Polygon>());
  const [tileError, setTileError] = useState(false);
  useEffect(() => { currentData.current = data; }, [data]);
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { minZoom: 0, maxZoom: 17, zoomSnap: 0.25, maxBounds: US_BOUNDS, maxBoundsViscosity: 1, scrollWheelZoom: true, preferCanvas: true });
    map.current = instance;
    const updatePanBounds = () => setUSPanBounds(instance);
    let boundsFrame = 0;
    instance.on("zoomend", () => {
      cancelAnimationFrame(boundsFrame);
      boundsFrame = requestAnimationFrame(updatePanBounds);
    });
    const clearFit = () => { fittedView.current = null; };
    instance.on("movestart", clearFit);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, noWrap: true, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' })
      .on("tileerror", () => setTileError(true)).addTo(instance);
    const resizeView = () => {
      const target = fittedView.current;
      const previousMinimum = instance.getMinZoom();
      instance.invalidateSize({ pan: false });
      // getBoundsZoom clamps to the current minimum, so release the old limit
      // before calculating a smaller container's national overview zoom.
      instance.setMinZoom(0);
      const options = fitOptions(instance);
      const padding = L.point(options.paddingTopLeft!).add(L.point(options.paddingBottomRight!));
      instance.setMinZoom(instance.getBoundsZoom(US_BOUNDS, false, padding));
      // MarkerCluster builds its spatial hierarchy down to the initial minimum.
      // Reindex through its public API if resizing changes that minimum.
      if (instance.getMinZoom() !== previousMinimum && clusters.current) {
        const group = clusters.current;
        const members = group.getLayers();
        group.clearLayers();
        group.addLayers(members);
      }
      updatePanBounds();
      if (target) {
        fitMapBounds(instance, target.bounds, target.maxZoom);
        fittedView.current = target;
      } else if (instance.options.maxBounds) instance.panInsideBounds(instance.options.maxBounds, { animate: false });
      const selected = currentSelection.current;
      if (selected?.kind === "household") revealHousehold(clusters.current, householdMarkers.current.get(selected.id));
    };
    resizeView();
    const resize = new ResizeObserver(resizeView);
    resize.observe(container.current);
    if (overlays.current) resize.observe(overlays.current);
    return () => { cancelAnimationFrame(boundsFrame); resize.disconnect(); instance.remove(); map.current = null; };
  }, []);
  // Index all filtered locations once. MarkerCluster manages visible layers and
  // spatial groups at every zoom, so counts do not depend on viewport clipping.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const geometry = L.layerGroup().addTo(instance);
    const teams = L.layerGroup();
    const zoneColors = new Map(data.zones.map(zone => [zone.id, hazards[zone.hazard].color]));
    const markerColors = new Map<L.Marker, string>();
    const group = L.markerClusterGroup({
      maxClusterRadius: 42,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      spiderfyOnMaxZoom: false,
      removeOutsideVisibleBounds: true,
      animate: false,
      iconCreateFunction: cluster => {
        const count = cluster.getChildCount();
        const label = tooltip(count.toLocaleString());
        const colors = new Map<string, number>();
        for (const marker of cluster.getAllChildMarkers()) {
          const color = markerColors.get(marker) ?? "#b74943";
          colors.set(color, (colors.get(color) ?? 0) + 1);
        }
        let offset = 0;
        const segments = [...colors].map(([color, total]) => {
          const start = offset;
          offset += total / count * 100;
          return `${color} ${start}% ${offset}%`;
        });
        label.style.background = colors.size === 1 ? [...colors.keys()][0] : `conic-gradient(${segments.join(", ")})`;
        label.setAttribute("aria-label", `${count.toLocaleString()} households. Zoom to expand cluster.`);
        const size = count < 100 ? 36 : count < 1000 ? 42 : 48;
        return L.divIcon({ className: "household-cluster", html: label, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
      },
    }).addTo(instance);
    clusters.current = group;
    group.on("clusterclick clusterkeypress", (event: L.LeafletEvent) => {
      const { layer: cluster, originalEvent } = event as L.LeafletEvent & { layer: L.MarkerCluster; originalEvent?: KeyboardEvent };
      if (event.type === "clusterkeypress") {
        if (originalEvent?.key !== "Enter" && originalEvent?.key !== " ") return;
        originalEvent.preventDefault();
      }
      if (instance.getZoom() >= instance.getMaxZoom()) cluster.spiderfy();
      else {
        const bounds = cluster.getBounds();
        fitMapBounds(instance, bounds, 17);
        fittedView.current = { bounds, maxZoom: 17 };
      }
    });
    const polygons = zonePolygons.current;
    const markers = householdMarkers.current;
    polygons.clear(); markers.clear();
    for (const zone of data.zones) {
      const color = hazards[zone.hazard].color;
      const polygon = L.polygon(zone.contextBoundary ?? zone.boundary, { color, fill: false, weight: currentSelection.current?.kind === "zone" && currentSelection.current.id === zone.id ? 4 : 1, dashArray: "5 5" }).addTo(geometry);
      const info = tooltip("i");
      info.setAttribute("aria-hidden", "true");
      L.marker(polygon.getBounds().getCenter(), { icon: L.divIcon({ className: "area-info-marker", html: info, iconSize: [26, 26], iconAnchor: [13, 13] }), title: `Review ${zone.name} · ${zone.severity} severity`, alt: `Review ${zone.name}` })
        .bindTooltip(tooltip(`${zone.name} · ${zone.severity} · Open area review`))
        .on("click", () => {
          if (onReview) onReview(zone.id);
          else onSelect({ kind: "zone", id: zone.id });
        }).addTo(geometry);
      polygons.set(zone.id, polygon);
      polygon.bindTooltip(tooltip(`${zone.name} · Geographic context only`));
      polygon.on("click", () => onSelect({ kind: "zone", id: zone.id }));
    }
    for (const layer of data.impactLayers ?? []) {
      L.polygon(layer.boundary, { color: hazards[layer.hazard].color, fillOpacity: layer.severity === "critical" || layer.severity === "extreme" ? 0.34 : layer.severity === "high" ? 0.24 : 0.12, weight: layer.severity === "critical" || layer.severity === "extreme" ? 4 : layer.severity === "high" ? 2 : 1 })
        .bindTooltip(tooltip(`${layer.label} · ${layer.severity} · ${layer.severityBasis}`))
        .on("click", () => onSelect({ kind: "zone", id: layer.hotspotId })).addTo(geometry);
    }
    for (const row of data.households) {
      const marker = L.marker(row.position, { icon: householdIcon(row, currentSelection.current?.kind === "household" && currentSelection.current.id === row.id, data.zones), title: row.name, alt: row.name, riseOnHover: true })
        .bindTooltip(tooltip(`${row.name} · ${row.membership ?? "neighborhood"}`))
        .on("click", () => onSelect({ kind: "household", id: row.id }));
      markerColors.set(marker, zoneColors.get(row.hotspotId ?? row.zoneId) ?? "#b74943");
      markers.set(row.id, marker);
    }
    group.addLayers([...markers.values()]);
    const selected = currentSelection.current;
    if (selected?.kind === "household") revealHousehold(group, markers.get(selected.id));
    for (const row of data.teams) {
      L.marker(row.position, { icon: L.divIcon({ className: "team-marker", html: "+", iconSize: [24, 24], iconAnchor: [12, 12] }), title: row.name, alt: row.name })
        .bindTooltip(tooltip(row.name)).on("click", () => onSelect({ kind: "team", id: row.id })).addTo(teams);
    }
    const refreshTeams = () => {
      if (instance.getZoom() >= HOUSEHOLD_ZOOM) teams.addTo(instance);
      else teams.remove();
    };
    instance.on("zoomend", refreshTeams);
    refreshTeams();
    return () => { instance.off("zoomend", refreshTeams); geometry.remove(); teams.remove(); group.clearLayers(); group.remove(); clusters.current = null; markers.clear(); polygons.clear(); };
  }, [data, onSelect, onReview]);
  useEffect(() => {
    const previous = currentSelection.current;
    const records = currentData.current;
    if (previous?.kind === "household") {
      const row = records.households.find(row => row.id === previous.id);
      if (row) householdMarkers.current.get(row.id)?.setIcon(householdIcon(row, false, records.zones));
    }
    if (previous?.kind === "zone") zonePolygons.current.get(previous.id)?.setStyle({ weight: 1 });
    currentSelection.current = selection;
    if (selection?.kind === "zone") zonePolygons.current.get(selection.id)?.setStyle({ weight: 4 });
    const instance = map.current;
    if (!instance || !selection) return;
    if (selection.kind === "zone") {
      const zone = records.zones.find(row => row.id === selection.id);
      if (zone) {
        const bounds = L.latLngBounds(zone.contextBoundary ?? zone.boundary);
        fitMapBounds(instance, bounds, 11);
        fittedView.current = { bounds, maxZoom: 11 };
      }
    } else {
      const row = (selection.kind === "household" ? records.households : records.teams).find(row => row.id === selection.id);
      if (row) {
        const zoom = Math.max(12, instance.getZoom());
        if (Number.isFinite(instance.getZoom())) instance.stop();
        setUSPanBounds(instance, zoom);
        instance.setView(row.position, zoom, { animate: false });
        setUSPanBounds(instance);
        fittedView.current = null;
        if (selection.kind === "household") {
          const marker = householdMarkers.current.get(row.id);
          marker?.setIcon(householdIcon(row as MapHousehold, true, records.zones));
          revealHousehold(clusters.current, marker);
        }
      }
    }
  }, [selection]);
  useEffect(() => {
    if (overviewVersion > 0 && map.current) {
      fitMapBounds(map.current, US_BOUNDS);
      fittedView.current = { bounds: US_BOUNDS };
    }
  }, [overviewVersion]);
  return <div className="map-wrapper">
    <div ref={container} className="map-canvas" role="region" aria-label="Interactive U.S. disaster map. Select a hotspot to zoom, then select households or teams." />
    <div ref={overlays} className="map-overlays">
      <div className="map-render-count" role="status">{data.households.length.toLocaleString()} household locations · Numbered circles expand on click.</div>
      {tileError && <div className="tile-warning" role="alert">Some basemap tiles could not load. Scenario overlays and hotspot navigation remain available.</div>}
    </div>
  </div>;
}
