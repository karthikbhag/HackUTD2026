import Link from "next/link";
import type { ReactNode } from "react";
import { DashboardIcon } from "@/components/map/dashboard-icon";

export function ResponseShell({ children, status = "unconfigured" }: { children: ReactNode; status?: string }) {
  return <main className="dashboard response-page">
    <div className="utility-bar"><span>HackUTD prototype · <Link href="/">Dispatcher dashboard</Link></span><span className={`connection ${status === "connected" ? "live" : ""}`} role="status"><span aria-hidden="true" />{status === "connected" ? "Connected" : status}</span></div>
    <header className="app-header">
      <Link className="brand" href="/" aria-label="StateWatch home"><span className="statefarm-wordmark">State Farm<span className="wordmark-dot">®</span></span><span className="product-name">StateWatch</span></Link>
      <span className="employee-label"><DashboardIcon kind="teams" />Employee workspace</span>
    </header>
    <div className="workspace-heading"><p className="eyebrow">State Farm · Preparedness & response</p><h1>Response teams</h1><p className="muted">Simulated welfare checks & team routing</p><p className="small muted">Fictional exercise · Estimated road travel · No passenger transport</p></div>
    <nav className="response-navigation" aria-label="Workspace"><Link href="/">Dispatcher</Link><Link href="/response" aria-current="page">Response teams</Link></nav>
    {children}
  </main>;
}
