import { Atkinson_Hyperlegible, Literata } from "next/font/google";

export const bodyFont = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-body",
  display: "swap",
});

export const headingFont = Literata({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});
