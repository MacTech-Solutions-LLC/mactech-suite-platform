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
          colorPrimary: "hsl(199 89% 56%)",
          colorBackground: "hsl(222 47% 6%)",
          colorText: "hsl(210 40% 96%)",
          colorInputBackground: "hsl(217 33% 14%)",
          colorInputText: "hsl(210 40% 96%)",
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
