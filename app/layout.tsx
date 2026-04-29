import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "MacTech Identity Command Center",
  description:
    "Central SSO, organization, RBAC, entitlement, and audit hub for the MacTech Suite.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#22d3ee", // sky-400; explicit hex so Clerk's internal contrast picker resolves correctly
          colorBackground: "#0b1220",
          colorText: "#f1f5f9",
          colorTextSecondary: "#cbd5e1",
          colorInputBackground: "#1e293b",
          colorInputText: "#f1f5f9",
          colorTextOnPrimaryBackground: "#0b1220",
          colorNeutral: "#cbd5e1",
          borderRadius: "0.5rem",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Inter, sans-serif",
        },
        elements: {
          // The Clerk-rendered card sits inside our own header on the
          // sign-in / sign-up pages, so suppress its internal title.
          headerTitle: { display: "none" },
          headerSubtitle: { display: "none" },
          // OAuth provider buttons were nearly invisible against the dark
          // background. Force a visible border + brighter background +
          // boost the icon brightness for the dark-themed Google/GitHub
          // marks.
          socialButtonsBlockButton: {
            backgroundColor: "#1e293b",
            borderColor: "#475569",
            color: "#f1f5f9",
            "&:hover": { backgroundColor: "#334155" },
          },
          socialButtonsBlockButtonText: { color: "#f1f5f9" },
          socialButtonsProviderIcon: { filter: "brightness(1.6) contrast(1.1)" },
          // Form labels / hints were dim; raise contrast.
          formFieldLabel: { color: "#e2e8f0" },
          formFieldHintText: { color: "#94a3b8" },
          formFieldInput: {
            backgroundColor: "#1e293b",
            borderColor: "#334155",
            color: "#f1f5f9",
          },
          dividerLine: { backgroundColor: "#334155" },
          dividerText: { color: "#94a3b8" },
          footerActionText: { color: "#cbd5e1" },
          footerActionLink: { color: "#22d3ee", "&:hover": { color: "#67e8f9" } },
          identityPreviewText: { color: "#f1f5f9" },
          identityPreviewEditButton: { color: "#22d3ee" },
        },
      }}
    >
      <html lang="en" className="dark" suppressHydrationWarning>
        <body className="min-h-screen bg-background font-sans antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
