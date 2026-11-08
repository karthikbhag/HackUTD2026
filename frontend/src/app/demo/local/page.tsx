import { MapDashboard } from "@/components/map/map-dashboard";
import { demoMapData } from "@/lib/map/demo-data";

/** Explicitly isolated browser-local rehearsal, independent of connection settings. */
export default function LocalDemoPage() {
  return <MapDashboard data={demoMapData} status="demo" />;
}
