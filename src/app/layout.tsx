import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";

import { AppProviders } from "@/components/providers/app-providers";
import { bodyFont, headingFont } from "@/lib/fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Supersede",
    template: "%s | Supersede",
  },
  description:
    "Governed change propagation from source evidence to verified remediation.",
  applicationName: "Supersede",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1e7" },
    { media: "(prefers-color-scheme: dark)", color: "#1d151b" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // A per-request CSP nonce can only be attached to dynamically rendered
  // framework scripts. Static shells would ship scripts without the nonce.
  await connection();
  const nonce = (await headers()).get("x-nonce") ?? "";

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${bodyFont.variable} ${headingFont.variable}`}
      suppressHydrationWarning
    >
      <body>
        <AppProviders nonce={nonce}>{children}</AppProviders>
      </body>
    </html>
  );
}
