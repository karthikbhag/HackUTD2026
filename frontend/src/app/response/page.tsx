import Link from "next/link";
import { ResponseDashboard } from "@/components/response/response-dashboard";
export default function ResponsePage() {
  const uri=process.env.NEXT_PUBLIC_SPACETIMEDB_URI,database=process.env.NEXT_PUBLIC_SPACETIMEDB_DATABASE;
  if(!uri||!database)return <main><h1>Simulated response teams</h1><p>Configure the shared database to open response routing.</p><Link href="/">Dispatcher</Link></main>;
  return <ResponseDashboard uri={uri} database={database} browserKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY??process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY??""} workerUrl={process.env.NEXT_PUBLIC_ROUTING_WORKER_URL??"http://localhost:3201"}/>;
}
