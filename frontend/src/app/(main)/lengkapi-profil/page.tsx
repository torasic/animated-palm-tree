'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { BgPattern } from '@/components/effects/bg-pattern';
import { Glow } from '@/components/effects/glow';
import { UserCheck } from 'lucide-react';

export default function LengkapiProfilPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getCurrentPosition = (): Promise<GeolocationPosition | null> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position),
        () => resolve(null),
        { timeout: 5000 }
      );
    });
  };

  const handleContinue = async () => {
    setLoading(true);
    setError('');

    let lat: number | null = null;
    let lng: number | null = null;

    try {
      const position = await getCurrentPosition();
      if (position) {
        lat = position.coords.latitude;
        lng = position.coords.longitude;
      }
    } catch (err) {
      console.warn('Failed to get geolocation:', err);
    }

    try {
      await authApi.completeProfile(null, lat, lng);
      router.push('/beranda');
    } catch (err: any) {
      setError(err.message || 'Gagal melengkapi profil');
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-[calc(100vh-80px)] flex-col items-center justify-center overflow-hidden py-12 px-4 sm:px-6 lg:px-8 bg-gr-paper">
      <BgPattern />
      <Glow color="var(--gr-board)" position="center" className="opacity-10 pointer-events-none" />

      <div className="z-10 w-full max-w-md space-y-8 rounded-sm border border-gr-line bg-white/80 p-8 sm:p-10 backdrop-blur-xl relative overflow-hidden">
        {/* Editorial Double Rule Top Accent */}
        <div className="absolute top-0 inset-x-0">
          <div className="h-[3px] bg-gr-ink w-full" />
          <div className="h-[1px] bg-gr-ink w-full mt" />
        </div>

        <div className="flex flex-col items-center text-center pt-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-sm border border-gr-line bg-gr-paper text-gr-ink mb-4">
            <UserCheck size={22} />
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-gr-ink">
            Selamat Datang!
          </h2>
          <p className="mt-2.5 font-sans text-xs text-gr-ink-soft max-w-xs leading-relaxed">
            Izinkan akses lokasi Anda untuk mencocokkan Anda dengan hasil tani terdekat.
          </p>
        </div>

        <div className="space-y-6">
          {error && (
            <div className="rounded-sm bg-gr-down/10 p-3.5 text-xs text-gr-down border border-gr-down/30 font-mono text-[11px]">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Button
              onClick={handleContinue}
              disabled={loading}
              className="w-full bg-gr-board text-gr-chalk hover:bg-gr-board/90 font-mono text-xs font-bold uppercase tracking-widest py-6 rounded-sm cursor-pointer transition-all"
            >
              {loading ? 'Memproses...' : 'Lanjutkan ke Beranda'}
            </Button>
          </div>
        </div>

      </div>
    </main>
  );
}
