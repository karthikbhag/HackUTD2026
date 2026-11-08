import type { ReactNode } from "react";

export function DashboardIcon({ kind, className = "" }: { kind: "home" | "phone" | "teams" | "tasks" | "map"; className?: string }) {
  const paths: Record<typeof kind, ReactNode> = {
    home: <><path d="m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10" /></>,
    phone: <path d="m7 3 3 5-3 3c2 3 3 4 6 6l3-3 5 3-1 4C10 23 1 14 3 4Z" />,
    teams: <><circle cx="12" cy="7" r="3" /><path d="M6 21v-3a6 6 0 0 1 12 0v3ZM4 5a3 3 0 0 0 0 6M20 5a3 3 0 0 1 0 6M3 14a5 5 0 0 0-2 4v3M21 14a5 5 0 0 1 2 4v3" /></>,
    tasks: <><path d="M9 4H5v18h14V4h-4M9 2h6v5H9Z" /><path d="m8 13 2 2 5-5M8 19h7" /></>,
    map: <><path d="m2 5 6-3 8 3 6-3v17l-6 3-8-3-6 3ZM8 2v17M16 5v17" /></>,
  };
  return <svg className={`dashboard-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}
