import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { FilmGrain } from "@/components/effects/film-grain";
import { SiteChrome } from "@/components/layout/site-chrome";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  axes: ["opsz"],
  style: ["normal", "italic"],
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-sans",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono",
});

import { BottomNav } from "@/components/layout/bottom-nav";
import { AccessibilityWidget } from "@/components/layout/accessibility-widget";

export const metadata: Metadata = {
  title: "Grove — Harga Pangan Pedesaan",
  description: "Pantau harga komoditas pangan strategis langsung dari PIHPS Bank Indonesia. Rantai pasok pangan pedesaan yang transparan.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gr-paper">
          <FilmGrain />
          {/* Persistent site chrome: Ticker (landing only) + Kicker bar (all pages) */}
          <SiteChrome />
          <div className="flex-1 flex flex-col pb-20 md:pb-0">
            {children}
          </div>
          <BottomNav />
          <AccessibilityWidget />
      </body>
    </html>
  );
}

