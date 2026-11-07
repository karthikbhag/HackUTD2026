import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RiskReach | Disaster Response",
  description:
    "Disaster preparedness and response coordination for State Farm employees.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
