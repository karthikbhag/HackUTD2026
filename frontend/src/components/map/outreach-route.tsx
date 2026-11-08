"use client";

import { useSearchParams } from "next/navigation";
import { demoMapData } from "@/lib/map/demo-data";
import { ConnectedDashboard } from "./connected-dashboard";
import { OutreachDashboard } from "./outreach-dashboard";

export function OutreachRoute({ uri, database }: { uri?: string; database?: string }) {
  const params = useSearchParams();
  const areaId = params.get("area") ?? "";
  const demo = params.get("mode") === "demo";
  if (demo) return <OutreachDashboard key={`demo-${areaId}`} data={demoMapData} areaId={areaId} status="demo"/>;
  if (uri && database) return <ConnectedDashboard key={`connected-${areaId}`} uri={uri} database={database} areaId={areaId}/>;
  return <OutreachDashboard data={{ zones: [], households: [], teams: [] }} areaId={areaId} status="error" errorMessage="The connected data source is not configured. Return to the map or open /demo to choose a fictional scenario."/>;
}
