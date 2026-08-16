'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AccessibilityWidget() {
  const pathname = usePathname();
  const [isAccessibleMode, setIsAccessibleMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('farmer_accessibility_mode') === 'true';
    setIsAccessibleMode(saved);
    if (saved) {
      document.documentElement.classList.add('farmer-accessibility-mode');
    }
  }, []);

  if (!mounted) return null;

  const toggleAccessibility = () => {
    const nextState = !isAccessibleMode;
    setIsAccessibleMode(nextState);
    localStorage.setItem('farmer_accessibility_mode', String(nextState));
    if (nextState) {
      document.documentElement.classList.add('farmer-accessibility-mode');
    } else {
      document.documentElement.classList.remove('farmer-accessibility-mode');
    }
  };

  const isMapPage = pathname === '/pusat-niaga';

  return (
    <div className={cn(
      "fixed z-50",
      isMapPage
        ? "top-4 right-4 md:top-auto md:bottom-24 md:right-[10px]"
        : "bottom-20 right-4 md:bottom-6 md:right-6"
    )}>
      <button
        onClick={toggleAccessibility}
        type="button"
        aria-label="Alihkan Mode Aksesibilitas Petani/Peternak (Teks Besar & Kontras Tinggi)"
        title={isAccessibleMode ? "Matikan Mode Aksesibilitas" : "Aktifkan Mode Aksesibilitas (Teks Besar & Kontras Tinggi)"}
        className={cn(
          "group relative flex items-center justify-center p-3 rounded-sm  border transition-all duration-300 cursor-pointer",
          isAccessibleMode
            ? "bg-gr-board text-gr-chalk border-gr-board ring-2 ring-gr-board/40 scale-105"
            : "bg-gr-paper text-gr-ink border-gr-line hover:border-gr-board hover:bg-white"
        )}
      >
        <Eye size={22} className="transition-transform group-hover:scale-110" />
        
        {/* Tooltip on desktop hover */}
        <span className="absolute right-full mr-3 hidden md:group-hover:block whitespace-nowrap bg-gr-board text-gr-chalk text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-sm  pointer-events-none">
          {isAccessibleMode ? "Mode Aksesibilitas (Aktif)" : "Mode Aksesibilitas"}
        </span>
      </button>
    </div>
  );
}
