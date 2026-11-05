import type { Metadata } from "next";
import { Gloock, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const display = Gloock({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });
const figures = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-figures", display: "swap" });

export const metadata: Metadata = {
  title: "Last Accounts",
  description: "Settling a parent's estate without paying the wrong person first. A PayPal sandbox demo, not legal advice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${figures.variable}`}>
      <body>{children}</body>
    </html>
  );
}
