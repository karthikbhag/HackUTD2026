import { MapDashboard } from "@/components/map/map-dashboard";
import { ConnectedDashboard } from "@/components/map/connected-dashboard";

export default function Home() {
  const uri = process.env.NEXT_PUBLIC_SPACETIMEDB_URI;
  const database = process.env.NEXT_PUBLIC_SPACETIMEDB_DATABASE;
  if (uri && database) return <ConnectedDashboard uri={uri} database={database} />;
  if (uri || database) return <MapDashboard data={{ zones: [], households: [], teams: [] }} status="error" errorMessage="Set both NEXT_PUBLIC_SPACETIMEDB_URI and NEXT_PUBLIC_SPACETIMEDB_DATABASE to use operational data." />;
  return <MapDashboard data={{ zones: [], households: [], teams: [] }} status="error" errorMessage="Configure the database in frontend/.env.local and restart Next.js to open the shared dashboard. The browser-local rehearsal is available at /demo/local." />;
}
