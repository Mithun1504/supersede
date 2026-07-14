import type { Metadata, Viewport } from "next";

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
