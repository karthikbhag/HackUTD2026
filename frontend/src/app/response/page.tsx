import { Suspense } from "react";
import Link from "next/link";
import { ResponseShell } from "@/components/response/response-shell";
import { ResponseDashboard } from "@/components/response/response-dashboard";
export default function ResponsePage() {
  if(process.env.DATA_SOURCE !== "database")return <ResponseShell><section className="workflow response-content"><h2>Local simulation</h2><p>Response routing requires a database connection. Use the main dashboard to rehearse notifications, replies and team assignments with local data.</p><Link className="outreach-back" href="/">← Back to dashboard</Link></section></ResponseShell>;
  const uri=process.env.NEXT_PUBLIC_SPACETIMEDB_URI,database=process.env.NEXT_PUBLIC_SPACETIMEDB_DATABASE;
  if(!uri||!database)return <ResponseShell><section className="workflow response-content"><h2>Connect your workspace</h2><p>Configure the shared database to open response routing.</p><Link className="outreach-back" href="/">← Back to dispatcher</Link></section></ResponseShell>;
  return <Suspense fallback={<ResponseShell status="loading"><p>Loading area response…</p></ResponseShell>}><ResponseDashboard uri={uri} database={database} browserKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY??process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY??""} workerUrl={process.env.NEXT_PUBLIC_ROUTING_WORKER_URL??"http://localhost:3201"}/></Suspense>;
}
