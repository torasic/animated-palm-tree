'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { referencePricesApi } from '@/lib/api/reference-prices';

// ─── Ticker data types ───────────────────────────────────────────────────────

interface TickerItem {
  commodityName: string;
  priceToday: number;
  delta: number;
}

const defaultTickerItems: TickerItem[] = [
  { commodityName: 'CABAI RAWIT MERAH', priceToday: 42500, delta: 2.3 },
  { commodityName: 'BAWANG MERAH', priceToday: 28100, delta: -1.8 },
  { commodityName: 'GABAH KERING PANEN', priceToday: 6200, delta: 0.5 },
  { commodityName: 'TELUR AYAM RAS', priceToday: 27800, delta: -0.9 },
  { commodityName: 'JAGUNG PIPILAN', priceToday: 5400, delta: 1.1 },
];

const PANEL_COMMODITIES = [
  { name: 'Cabai Rawit Merah', displayName: 'CABAI RAWIT MERAH' },
  { name: 'Bawang Merah', displayName: 'BAWANG MERAH' },
  { name: 'Telur Ayam Ras Segar', displayName: 'TELUR AYAM RAS SEGAR' },
];

// ─── Ticker strip (inner, reused in SiteChrome) ──────────────────────────────

function TickerStrip({ items }: { items: TickerItem[] }) {
  const repeatedItems = [...items, ...items, ...items, ...items];

  return (
    <div className="ticker-wrapper w-full bg-gr-board text-gr-chalk overflow-hidden border-b border-gr-chalk/10">
      <div className="animate-ticker flex whitespace-nowrap items-center">
        {repeatedItems.map((item, idx) => {
          const isUp = item.delta > 0;
          const isDown = item.delta < 0;
          const deltaText = isUp
            ? `▲ ${item.delta.toFixed(1)}%`
            : isDown
            ? `▼ ${Math.abs(item.delta).toFixed(1)}%`
            : `± 0.0%`;

          return (
            <span
              key={idx}
              className="inline-flex items-center gap-2 mr-12 font-mono text-xs uppercase tracking-widest"
            >
              <span>{item.commodityName}</span>
              <span className="opacity-40">·</span>
              <span>Rp {Math.round(item.priceToday).toLocaleString('id-ID')}/kg</span>
              <span
                className={
                  isUp
                    ? 'text-gr-up-board'
                    : isDown
                    ? 'text-gr-down-board'
                    : 'text-gr-chalk/60'
                }
              >
                {deltaText}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Kicker bar ──────────────────────────────────────────────────────────────

function KickerBar() {
  const today = new Date();

  const formatDateIndonesian = (date: Date) => {
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const getEditionNumber = () => {
    const baseDate = new Date('2025-12-18');
    const diffTime = Math.abs(today.getTime() - baseDate.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="w-full relative z-40 bg-gr-paper">
      {/* Double rule */}
      <div className="h-[3px] bg-gr-ink max-w-[1100px] mx-auto" />
      <div className="h-[1px] bg-gr-ink max-w-[1100px] mx-auto mt-[3px]" />
      {/* Meta row */}
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 md:px-8 pt-3.5 pb-4 flex justify-between flex-wrap gap-2 font-mono text-[10px] tracking-widest uppercase text-gr-ink-soft select-none border-b border-gr-line">
        <span>Buletin harga pangan · Nº {getEditionNumber()}</span>
        <span className="hidden sm:inline">Rantai pasok pangan pedesaan</span>
        <span>PIHPS · {formatDateIndonesian(today)}</span>
      </div>
    </div>
  );
}

// ─── SiteChrome — root-level persistent chrome ───────────────────────────────

export function SiteChrome() {
  const pathname = usePathname();
  const isLanding = pathname === '/';

  const [tickerItems, setTickerItems] = useState<TickerItem[]>(defaultTickerItems);

  // Fetch live prices once on mount — shared across all pages
  useEffect(() => {
    async function loadTicker() {
      try {
        const fetches = PANEL_COMMODITIES.map((c) =>
          referencePricesApi.getPriceHistory(c.name, 'Nasional', 10)
        );
        const results = await Promise.all(fetches);

        const items: TickerItem[] = [];
        results.forEach((history, i) => {
          if (!history || history.length === 0) return;
          const latest = history[history.length - 1];
          const priceToday = latest.price_per_kg;

          // last-different-price delta
          let comparisonPrice = priceToday;
          for (let j = history.length - 2; j >= 0; j--) {
            if (history[j].price_per_kg !== priceToday) {
              comparisonPrice = history[j].price_per_kg;
              break;
            }
          }
          const delta =
            comparisonPrice > 0
              ? ((priceToday - comparisonPrice) / comparisonPrice) * 100
              : 0;

          items.push({
            commodityName: PANEL_COMMODITIES[i].displayName,
            priceToday,
            delta,
          });
        });

        if (items.length > 0) setTickerItems(items);
      } catch {
        // keep defaults on error
      }
    }

    loadTicker();
  }, []);

  return (
    <>
      {/* Ticker — animated in/out based on landing state */}
      <AnimatePresence initial={false}>
        {isLanding && (
          <motion.div
            key="ticker"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 35, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
            className="mb-7"
          >
            <TickerStrip items={tickerItems} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kicker bar — hidden on map page */}
      {pathname !== '/pusat-niaga' && (
        <div className={isLanding ? "" : "pt-3.5"}>
          <KickerBar />
        </div>
      )}
    </>
  );
}
