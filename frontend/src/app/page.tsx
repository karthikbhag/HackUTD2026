import { MapDashboard } from "@/components/map/map-dashboard";
import { demoMapData } from "@/lib/map/demo-data";

export default function Home() {
  return <MapDashboard data={demoMapData} status="demo" />;
}
