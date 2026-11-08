import { Suspense } from "react";
import { OutreachRoute } from "@/components/map/outreach-route";

export default function OutreachPage() {
  return <Suspense fallback={<main className="outreach-page"><p role="status">Loading area outreach…</p></main>}><OutreachRoute uri={process.env.NEXT_PUBLIC_SPACETIMEDB_URI} database={process.env.NEXT_PUBLIC_SPACETIMEDB_DATABASE}/></Suspense>;
}
