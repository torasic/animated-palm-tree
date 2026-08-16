'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleSignInButton } from '@/components/auth/google-signin-button';
import { authApi } from '@/lib/api/auth';
import { BgPattern } from '@/components/effects/bg-pattern';
import { Glow } from '@/components/effects/glow';
import { Leaf } from 'lucide-react';
import Link from 'next/link';

import { Navbar } from '@/components/layout/navbar';
import { GroveLogo } from '@/components/ui/grove-logo';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSuccess = async (credentialResponse: any) => {
    if (!credentialResponse.credential) {
      setError('Token Google tidak valid');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const res = await authApi.loginWithGoogle(credentialResponse.credential);
      if (res.need_onboarding) {
        router.push('/lengkapi-profil');
      } else {
        router.push('/beranda');
      }
    } catch (err: any) {
      setError(err.message || 'Gagal login dengan Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gr-paper">
      <Navbar />

      <main className="flex-1 flex items-center justify-center relative py-12 px-4 sm:px-6 lg:px-8">
        <BgPattern />
        <Glow color="var(--gr-board)" position="center" className="opacity-10 pointer-events-none" />
        
        <div className="z-10 w-full max-w-md bg-white/80 backdrop-blur-xl border border-gr-line rounded-sm p-6 sm:p-10  relative overflow-hidden space-y-6">
          {/* Editorial Double Rule Top Accent */}
          <div className="absolute top-0 inset-x-0">
            <div className="h-[3px] bg-gr-ink w-full" />
            <div className="h-[1px] bg-gr-ink w-full mt" />
          </div>

          <div className="flex flex-col items-center text-center pt-2">
            {/* Prominent Grove Brand Mark */}
            <div className="mb-2">
              <GroveLogo href="/" size="md" />
            </div>

            <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-gr-ink mt-2">
              Masuk ke Grove
            </h2>
            <p className="mt-2.5 font-sans text-xs text-gr-ink-soft max-w-xs leading-relaxed">
              Akses papan harga &amp; marketplace hasil panen langsung dari jaringan petani
            </p>
          </div>

          {error && (
            <div className="rounded-sm bg-gr-down/10 p-3.5 text-xs text-gr-down border border-gr-down/30 font-mono text-[11px] animate-pulse">
              {error}
            </div>
          )}

          <div className="pt-2 flex flex-col items-center justify-center border-t border-gr-line gap-4">
            {loading ? (
              <div className="flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-widest text-gr-ink-soft py-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent border-gr-board" />
                <span>Memproses otentikasi...</span>
              </div>
            ) : (
              <div className="w-full flex justify-center">
                <GoogleSignInButton
                  onSuccess={(credential) =>
                    handleGoogleSuccess({ credential })
                  }
                  onError={() => setError('Google Sign-In failed. Please try again.')}
                  theme="filled_black"
                  shape="pill"
                  size="large"
                  width={320}
                />
              </div>
            )}
          </div>
          
          <div className="pt-2 border-t border-gr-line/50 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-gr-ink-soft/60">
            Terlindungi oleh Sistem Keamanan OAuth 2.0
          </div>
        </div>
      </main>
    </div>
  );
}
