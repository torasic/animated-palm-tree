'use client';

import React, { useEffect, useState, useRef } from 'react';
import { productsApi } from '@/lib/api/products';
import { Glow } from '@/components/effects/glow';
import { useInView } from 'framer-motion';
import Link from 'next/link';

interface StatsData {
  total_commodities: number;
  last_updated: string | null;
  active_products: number;
}


function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (!ref.current) return;
    if (inView) {
      const from = 0;
      const to = value;
      const duration = 1200; // ms
      let startTime: number | null = null;

      const step = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        // Ease out quad
        const easeProgress = progress * (2 - progress);
        const current = Math.floor(easeProgress * (to - from) + from);
        if (ref.current) {
          ref.current.textContent = current.toLocaleString('id-ID');
        }
        if (progress < 1) {
          window.requestAnimationFrame(step);
        }
      };
      window.requestAnimationFrame(step);
    }
  }, [inView, value]);

  return <span ref={ref}>0</span>;
}

function getRelativeTime(dateString: string | null) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 1000 / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Baru saja';
  if (diffMins < 60) return `${diffMins} menit lalu`;
  if (diffHours < 24) return `${diffHours} jam lalu`;
  return `${diffDays} hari lalu`;
}

export function LiveStatsHero() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await productsApi.getLiveStats();
        setStats(data);
      } catch (err) {
        console.error('Failed to fetch live stats:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading || !stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mx-auto my-10">
        {[1, 2, 3].map((i) => (
          <div 
            key={i} 
            className="relative overflow-hidden rounded-sm border border-white/5 bg-gr-bg-elevated p-8 min-h-[140px] flex flex-col justify-center animate-pulse"
          >
            <div className="h-3 w-28 bg-white/10 rounded mb-3" />
            <div className="h-10 w-20 bg-white/10 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mx-auto my-10 relative z-10">
      {/* Card 1: Total Reference Prices */}
      <Link href="/pusat-niaga" className="relative overflow-hidden rounded-sm border border-white/5 bg-gr-bg-elevated p-8 min-h-[140px] flex flex-col justify-center transition-all duration-300 hover:border-gr-green/20 hover:bg-white/[0.03] group cursor-pointer">
        <Glow color="var(--gr-green)" position="center" className="opacity-5 pointer-events-none scale-[0.6] group-hover:opacity-10 transition-opacity" />
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-gr-text-primary/40 mb-1 z-10">
          Total Acuan Harga
        </span>
        <span className="font-display text-5xl font-semibold text-gr-green tracking-tight z-10">
          <CountUp value={stats.total_commodities} />
        </span>
      </Link>

      {/* Card 2: Last Scraped Time */}
      <div className="relative overflow-hidden rounded-sm border border-white/5 bg-gr-bg-elevated p-8 min-h-[140px] flex flex-col justify-center transition-all duration-300 hover:border-gr-green/20 group">
        <Glow color="var(--gr-green)" position="center" className="opacity-5 pointer-events-none scale-[0.6] group-hover:opacity-10 transition-opacity" />
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-gr-text-primary/40 mb-1 z-10">
          Pembaruan Terakhir
        </span>
        <span className="font-display text-4xl font-semibold text-gr-text-primary tracking-tight z-10">
          {getRelativeTime(stats.last_updated)}
        </span>
      </div>

      {/* Card 3: Active Products Count */}
      <div className="relative overflow-hidden rounded-sm border border-white/5 bg-gr-bg-elevated p-8 min-h-[140px] flex flex-col justify-center transition-all duration-300 hover:border-gr-green/20 group">
        <Glow color="var(--gr-green)" position="center" className="opacity-5 pointer-events-none scale-[0.6] group-hover:opacity-10 transition-opacity" />
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-gr-text-primary/40 mb-1 z-10">
          Produk Aktif Petani
        </span>
        <span className="font-display text-5xl font-semibold text-gr-green tracking-tight z-10">
          <CountUp value={stats.active_products} />
        </span>
      </div>
    </div>
  );
}
