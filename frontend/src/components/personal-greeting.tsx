'use client';

import React, { useEffect, useState } from 'react';
import { authApi } from '@/lib/api/auth';

const ScrambleText: React.FC<{ text: string }> = ({ text }) => {
  const [displayTxt, setDisplayTxt] = useState('');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

  useEffect(() => {
    if (!text) return;
    let iterations = 0;
    const interval = setInterval(() => {
      setDisplayTxt(
        text
          .split('')
          .map((char, index) => {
            if (char === ' ') return ' ';
            if (index < iterations) {
              return text[index];
            }
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join('')
      );
      
      if (iterations >= text.length) {
        clearInterval(interval);
      }
      iterations += 1/3; // Scramble speed factor
    }, 25);

    return () => clearInterval(interval);
  }, [text]);

  return <span>{displayTxt || text}</span>;
};

export function PersonalGreeting() {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGreetingData = async () => {
      try {
        const userData = await authApi.getMe();
        setUser(userData);
      } catch (err) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchGreetingData();
  }, []);

  const getGreetingText = () => {
    const hour = new Date().getHours();
    if (hour >= 4 && hour <= 10) return "Selamat pagi";
    if (hour >= 11 && hour <= 14) return "Selamat siang";
    if (hour >= 15 && hour <= 17) return "Selamat sore";
    return "Selamat malam";
  };

  const getFirstName = (name?: string | null) => {
    if (!name) return '';
    const firstWord = name.trim().split(/\s+/)[0];
    if (firstWord.includes('@')) {
      return firstWord.split('@')[0];
    }
    return firstWord;
  };

  const greeting = getGreetingText();
  const firstName = user ? (getFirstName(user.full_name) || getFirstName(user.email) || 'Pengguna') : '';

  // Render subtext based on login status and role
  const renderSubtext = () => {
    if (loading) {
      return null; // Remove loading text completely
    }

    if (user && user.role === 'PETANI') {
      return (
        <p className="font-sans text-xs uppercase tracking-wider text-gr-text-primary/70 mt-3">
          Kelola produk panen/ternak segar Anda dan pantau acuan harga pasar.
        </p>
      );
    }

    return (
      <p className="font-sans text-xs uppercase tracking-wider text-gr-text-primary/70 mt-3">
        Temukan hasil panen/ternak segar langsung dari petani/peternak lokal di sekitarmu.
      </p>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-8 text-center lg:text-left">
      <div>
        <span className="font-mono text-xs uppercase tracking-[0.3em] text-gr-live">
          Live Marketplace
        </span>
        <h1 className="mt-4 font-display text-4xl sm:text-5xl font-semibold tracking-tight text-gr-ink">
          {user ? (
            <>
              {greeting}, <ScrambleText text={firstName} />
            </>
          ) : (
            `${greeting}.`
          )}
        </h1>
        <div className="mt-2 min-h-5">
          {renderSubtext()}
        </div>
      </div>
      
      <div className="lg:text-right flex items-center lg:items-end justify-center lg:justify-end">
        <p className="font-sans text-[11px] text-gr-ink-soft max-w-[320px] leading-normal italic mx-auto lg:ml-auto border-l lg:border-l-0 lg:border-r border-gr-line pl-4 lg:pl-0 lg:pr-4">
          "Menghubungkan langsung ladang petani dengan dapur Anda tanpa rantai tengkulak yang panjang."
        </p>
      </div>
    </div>
  );
}
