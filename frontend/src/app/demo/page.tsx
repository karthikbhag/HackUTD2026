import { MapDashboard } from "@/components/map/map-dashboard";
import { demoMapData } from "@/lib/map/demo-data";

/** Always uses fictional UI fixtures, independently of connection configuration. */
export default function ScenarioDemoPage() {
  return <MapDashboard data={demoMapData} status="demo" />;
}
