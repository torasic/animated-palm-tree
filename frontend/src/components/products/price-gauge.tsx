'use client';

import React, { useEffect, useState } from 'react';

interface PriceGaugeProps {
  hargaReferensi: number;
  hargaProduk: number;
  hargaRataRataApp?: number;
  isMini?: boolean;
}

export const PriceGauge: React.FC<PriceGaugeProps> = ({
  hargaReferensi,
  hargaProduk,
  hargaRataRataApp,
  isMini = false
}) => {
  // Animation state to slide the dot on mount
  const [position, setPosition] = useState(50); // Start at center (reference)
  const [animate, setAnimate] = useState(false);

  // Calculate percentage of product price on a scale of 70% to 130% of reference price
  const minRatio = 0.7;
  const maxRatio = 1.3;
  const productRatio = hargaProduk / hargaReferensi;
  const targetPosition = ((productRatio - minRatio) / (maxRatio - minRatio)) * 100;
  const finalPosition = Math.min(Math.max(targetPosition, 0), 100);

  // Calculate percentage deviation
  const deviation = ((hargaProduk - hargaReferensi) / hargaReferensi) * 100;
  const deviationText = deviation > 0 
    ? `+${deviation.toFixed(1)}%` 
    : deviation < 0 
    ? `${deviation.toFixed(1)}%` 
    : '0.0%';

  // Determine category and styling
  let category: 'unfair' | 'warn' | 'fair' = 'fair';
  let badgeLabel = 'Adil';
  let colorClass = 'bg-gr-up';
  let borderClass = 'border-gr-up/20';
  let textClass = 'text-gr-up';
  let bgClass = 'bg-gr-up/10';
  let explanation = 'Harga ini adil dan menguntungkan petani. Transaksi ini mendukung kesejahteraan pedesaan.';

  if (hargaProduk < hargaReferensi) {
    if (hargaProduk >= hargaReferensi * 0.9) {
      category = 'warn';
      badgeLabel = 'Warning';
      colorClass = 'bg-gr-price-warn';
      borderClass = 'border-gr-price-warn/20';
      textClass = 'text-gr-price-warn';
      bgClass = 'bg-gr-price-warn/10';
      explanation = 'Harga di bawah acuan pasar. Pendapatan petani sedikit tertekan dalam transaksi ini.';
    } else {
      category = 'unfair';
      badgeLabel = 'Rendah';
      colorClass = 'bg-gr-down';
      borderClass = 'border-gr-down/20';
      textClass = 'text-gr-down';
      bgClass = 'bg-gr-down/10';
      explanation = 'Harga terlalu rendah dibanding acuan pasar. Berpotensi merugikan atau menekan petani.';
    }
  }

  useEffect(() => {
    // Small delay to trigger smooth transition after render
    const timer = setTimeout(() => {
      setPosition(finalPosition);
      setAnimate(true);
    }, 150);
    return () => clearTimeout(timer);
  }, [finalPosition]);

  if (isMini) {
    return (
      <div className="flex items-center gap-2 w-[120px] h-6 select-none relative group">
        {/* Track */}
        <div className="relative w-full h-1.5 bg-gr-line/10 rounded-full overflow-visible">
          {/* Unfair Zone (0% to 33.3%) */}
          <div className="absolute left-0 top-0 bottom-0 w-[33.3%] bg-gr-down/20 rounded-l-full" />
          {/* Warning Zone (33.3% to 50%) */}
          <div className="absolute left-[33.3%] top-0 bottom-0 w-[16.7%] bg-gr-price-warn/25" />
          {/* Fair Zone (50% to 100%) */}
          <div className="absolute left-[50%] top-0 bottom-0 w-[50%] bg-gr-up/10 rounded-r-full" />

          {/* Reference Line */}
          <div 
            className="absolute top-1/2 -translate-y-1/2 w-[1.5px] h-3 bg-gr-ink-soft/40 z-10"
            style={{ left: '50%' }}
            title={`Referensi: Rp ${Math.round(hargaReferensi).toLocaleString('id-ID')}`}
          />

          {/* Product Price Dot */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-sm ${colorClass}  z-20 transition-all duration-1000 cubic-bezier(0.34, 1.56, 0.64, 1)`}
            style={{ left: `${position}%`, transform: `translate(-50%, -50%) scale(${animate ? 1 : 0.4})` }}
            title={`Harga: Rp ${Math.round(hargaProduk).toLocaleString('id-ID')} (${deviationText})`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 select-none w-full">
      {/* Visual Gauge Component */}
      <div className="relative pt-10 pb-2 px-1">
        {/* Track Container */}
        <div className="relative w-full h-3 bg-gr-chalk rounded-sm border border-gr-line/5 overflow-visible">
          
          {/* Zone Overlays to show color tracks inside the bar */}
          {/* Unfair Zone (0% to 33.3%) */}
          <div className="absolute left-0 top-0 bottom-0 w-[33.3%] bg-gr-down/15 rounded-l-full border-r border-dashed border-gr-line/10" />
          {/* Warning Zone (33.3% to 50%) */}
          <div className="absolute left-[33.3%] top-0 bottom-0 w-[16.7%] bg-gr-price-warn/15 border-r border-dashed border-gr-line/10" />
          {/* Fair Zone (50% to 100%) */}
          <div className="absolute left-[50%] top-0 bottom-0 w-[50%] bg-gr-up/10 rounded-r-full" />

          {/* Zone Labels underneath the track */}
          <div className="absolute left-0 -bottom-5 font-mono text-[7px] text-gr-down font-bold tracking-widest uppercase">
            Rendah
          </div>
          <div className="absolute left-[34%] -bottom-5 font-mono text-[7px] text-gr-price-warn font-bold tracking-widest uppercase">
            Warning
          </div>
          <div className="absolute right-0 -bottom-5 font-mono text-[7px] text-gr-up font-bold tracking-widest uppercase">
            Adil
          </div>

          {/* Reference Marker */}
          <div 
            className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center z-10"
            style={{ left: '50%' }}
          >
            {/* Top label */}
            <span className="absolute -top-4 font-mono text-[8px] font-extrabold tracking-widest text-gr-ink-soft opacity-60">
              ACUAN
            </span>
            {/* Dotted vertical line */}
            <div className="w-px h-6 bg-gr-ink border-l border-dashed border-gr-ink-soft/40" />
          </div>

          {/* Product Price Marker (Dot + Tooltip + Pulsing effect) */}
          <div
            className="absolute top-1/2 -translate-y-1/2 z-20 flex flex-col items-center transition-all duration-1000 cubic-bezier(0.34, 1.56, 0.64, 1)"
            style={{ left: `${position}%` }}
          >
            {/* Floating deviation percentage tag */}
            <div 
              className={`absolute -top-9 px-1.5 py-0.5 rounded-sm font-mono text-[9px] font-extrabold tracking-wider ${bgClass} ${textClass} border ${borderClass}  transition-all duration-300 whitespace-nowrap`}
              style={{ transform: `scale(${animate ? 1 : 0.8})` }}
            >
              {deviationText}
            </div>

            {/* Solid dot */}
            <div 
              className={`w-4.5 h-4.5 rounded-sm ${colorClass} border-2 border-gr-chalk  cursor-pointer transform hover:scale-125 transition-transform duration-200`}
            />
          </div>

          {/* App average price marker (if provided) */}
          {hargaRataRataApp && (
            <div 
              className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center z-10"
              style={{ left: `${((hargaRataRataApp / hargaReferensi - minRatio) / (maxRatio - minRatio)) * 100}%` }}
              title={`Rata-rata App: Rp ${Math.round(hargaRataRataApp).toLocaleString('id-ID')}`}
            >
              <div className="w-[1.5px] h-5 bg-gr-live/80" />
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Summary Card to fit the theme better */}
      <div className="flex items-start gap-3.5 p-3.5 bg-white/70 border border-gr-line/14 rounded-sm mt-3 transition-all duration-500 ">
        {/* Custom editorial-style stamp status indicator */}
        <div className={`shrink-0 border px-2 py-0.5 rounded-sm flex items-center justify-center font-mono text-[9px] font-extrabold tracking-widest uppercase select-none ${textClass} ${bgClass} border-current`}>
          {badgeLabel}
        </div>
        
        {/* Description text */}
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft">
              Status Keadilan Harga
            </span>
            <span className={`font-mono text-[9px] font-bold ${textClass}`}>
              Rp {Math.round(Math.abs(hargaProduk - hargaReferensi)).toLocaleString('id-ID')} {hargaProduk > hargaReferensi ? 'di atas' : 'di bawah'} acuan
            </span>
          </div>
          <p className="font-sans text-[11px] leading-relaxed text-gr-ink-soft m-0">
            {explanation}
          </p>
        </div>
      </div>
    </div>
  );
};
