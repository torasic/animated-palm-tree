'use client';

import React from 'react';
import { MessageCircle } from 'lucide-react';

export default function ChatIndexPage() {
  return (
    <div className="flex-grow flex flex-col items-center justify-center p-8 text-center bg-white/10 dark:bg-black/5 h-full relative overflow-hidden">
      
      {/* Decorative crop dots pattern in background */}
      <div className="absolute inset-0 opacity-[0.015] bg-radial from-gr-board" />
      
      <div className="w-14 h-14 rounded-sm bg-gr-board/5 border border-gr-board/10 flex items-center justify-center text-gr-board mb-5">
        <MessageCircle size={24} />
      </div>
      
      <h3 className="font-sans text-xs font-bold text-gr-ink uppercase tracking-wider mb-1.5">
        Mulai Obrolan Pangan
      </h3>
      <p className="font-sans text-[11px] text-gr-ink-soft max-w-[280px] leading-relaxed">
        Pilih salah satu percakapan di Kotak Masuk untuk bernegosiasi harga, berdiskusi stok komoditas, atau koordinasi pengiriman.
      </p>
    </div>
  );
}
