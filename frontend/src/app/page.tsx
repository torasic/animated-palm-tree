import React from 'react';
import { BgPattern } from '@/components/effects/bg-pattern';
import { Glow } from '@/components/effects/glow';
import { referencePricesApi } from '@/lib/api/reference-prices';
import {
  MastheadNav,
  HeroHeadline,
  LedeSection,
  QuoteSection,
  FigPanels,
  LandingFooter,
} from '@/components/scattered-hero';

// Configure ISR (Incremental Static Regeneration) with revalidate TTL of 1 hour (3600s)
export const revalidate = 3600;

export default async function LandingPage() {
  const commodities = [
    {
      name: 'Cabai Rawit Merah',
      displayName: 'Cabai rawit merah',
      desc: 'Meningkat seiring fluktuasi pasokan di pasar-pasar induk utama Jawa Barat dan sekitarnya.',
      swatchColor: 'var(--gr-up)',
    },
    {
      name: 'Bawang Merah',
      displayName: 'Bawang merah',
      desc: 'Melandai setelah pasokan panen serentak dari wilayah sentra produksi Brebes membanjiri pasar.',
      swatchColor: 'var(--gr-down)',
    },
    {
      name: 'Telur Ayam Ras Segar',
      displayName: 'Telur ayam ras segar',
      desc: 'Bergerak dalam rentang stabil sejalan dengan konsistensi rantai pasokan peternak lokal.',
      swatchColor: 'var(--gr-ink-soft)',
    },
  ];

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des',
    ];
    return `${date.getDate()} ${months[date.getMonth()]}`;
  };

  let pricesData: any[] = [];
  try {
    const results = await Promise.all(
      commodities.map(async (c) => {
        const [history, divergence] = await Promise.all([
          referencePricesApi.getPriceHistory(c.name, 'Nasional', 10),
          referencePricesApi.getPriceDivergence(c.name, 'Nasional', 90).catch(() => null)
        ]);

        if (history && history.length > 0) {
          const latestEntry = history[history.length - 1];
          const priceToday = latestEntry.price_per_kg;

          // Find the last entry with a different price (last-different-price delta)
          let comparisonEntry = latestEntry;
          for (let i = history.length - 2; i >= 0; i--) {
            if (history[i].price_per_kg !== priceToday) {
              comparisonEntry = history[i];
              break;
            }
          }
          const priceComparison = comparisonEntry.price_per_kg;
          const comparisonDate = formatShortDate(comparisonEntry.scraped_at);

          const delta =
            priceComparison > 0
              ? ((priceToday - priceComparison) / priceComparison) * 100
              : 0;

          return {
            commodityName: c.displayName,
            priceToday,
            priceComparison,
            delta,
            comparisonDate,
            history,
            desc: c.desc,
            swatchColor: c.swatchColor,
            divergence,
          };
        }
        return null;
      })
    );

    pricesData = results.filter((r) => r !== null);
  } catch (err) {
    console.error('Failed to load reference prices for landing page:', err);
  }

  return (
    <main className="relative min-h-screen bg-gr-paper text-gr-ink flex flex-col justify-start overflow-x-hidden font-sans">
      <BgPattern />
      <Glow color="var(--gr-board)" position="top" className="opacity-5 scale-110 pointer-events-none" />

      {/* Masthead: logo + Masuk only. Nav tabs NOT here — handled by Navbar in (main)/layout */}
      <MastheadNav />

      <HeroHeadline />
      <LedeSection />
      <QuoteSection />
      <FigPanels pricesData={pricesData} />
      <LandingFooter />
    </main>
  );
}
