import type { Metadata, Viewport } from "next";
import { connection } from "next/server";

import { AppProviders } from "@/components/providers/app-providers";
import { geistMono, geistSans } from "@/lib/fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Supersede",
    template: "%s | Supersede",
  },
  description: "Evidence-backed change propagation for governed organizations.",
  applicationName: "Supersede",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7fbfb" },
    { media: "(prefers-color-scheme: dark)", color: "#111b20" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // A per-request CSP nonce can only be attached to dynamically rendered
  // framework scripts. Static shells would ship scripts without the nonce.
  await connection();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
