/**
 * Public-status layout — Slice 11.
 *
 * Lives at the top level (not under (admin)) so it inherits no
 * AdminShell, no nav, no Clerk session UI. Middleware excludes the
 * /status route from auth. Visitors land here from the public
 * status.suite.mactechsolutionsllc.com subdomain (CNAME → this app)
 * or from a direct /status link.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MacTech Suite — Status",
  description: "Live operational status for the MacTech Suite product family.",
  robots: { index: true, follow: true },
};

export default function StatusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-[#0a0b10] text-slate-100">{children}</div>;
}
