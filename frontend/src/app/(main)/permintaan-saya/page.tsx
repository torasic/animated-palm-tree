'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { demandRequestsApi } from '@/lib/api/demand-requests';
import { BgPattern } from '@/components/effects/bg-pattern';
import { FilmGrain } from '@/components/effects/film-grain';
import { Glow } from '@/components/effects/glow';
import { Button } from '@/components/ui/button';
import { Plus, Calendar, ClipboardList, Loader2, ArrowRight, Activity } from 'lucide-react';
import Link from 'next/link';

export default function PermintaanSayaPage() {
  const router = useRouter();
  
  // Auth state
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState<any | null>(null);

  // Demands state
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const initPage = async () => {
      try {
        const userData = await authApi.getMe();
        setUser(userData);
        if (userData.role !== 'PEMBELI') {
          setCheckingAuth(false);
          return;
        }

        const data = await demandRequestsApi.getMyDemandRequests();
        setRequests(data);
        setCheckingAuth(false);
      } catch (err: any) {
        console.error('Failed to init mine page:', err);
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    };
    initPage();
  }, [router]);

  if (checkingAuth || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gr-paper">
        <Loader2 className="h-10 w-10 text-gr-board animate-spin opacity-60" />
      </div>
    );
  }

  // Restricted access screen
  if (user && user.role !== 'PEMBELI') {
    return (
      <main className="relative min-h-[calc(100vh-80px)] bg-gr-paper py-16 px-4 sm:px-6 lg:px-8 flex flex-col justify-center items-center">
        <BgPattern />
        <div className="relative z-10 max-w-md w-full bg-white/80 border border-gr-line p-8 sm:p-10 rounded-sm backdrop-blur-xl  text-center overflow-hidden">
          {/* Editorial Double Rule Top Accent */}
          <div className="absolute top-0 inset-x-0">
            <div className="h-[3px] bg-gr-ink w-full" />
            <div className="h-[1px] bg-gr-ink w-full mt" />
          </div>

          <ClipboardList className="h-12 w-12 text-gr-board mx-auto mb-4" />
          <h2 className="font-display text-3xl font-semibold text-gr-ink mb-3">Akses Dibatasi</h2>
          <p className="font-sans text-xs text-gr-ink-soft mb-6 leading-relaxed">
            Halaman ini khusus untuk Pembeli melihat rincian riwayat permintaan komoditas panen mereka. Akun Anda terdaftar sebagai <span className="font-mono font-bold text-gr-board">{user.role}</span>.
          </p>
          <Link
            href="/beranda"
            className="inline-flex items-center gap-2 bg-gr-board text-gr-chalk hover:bg-gr-board/90 font-mono text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-sm  transition-all cursor-pointer"
          >
            Kembali ke Beranda
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-[calc(100vh-80px)] bg-gr-paper py-16 px-4 sm:px-6 lg:px-8">
      <BgPattern />

      <div className="relative z-10 mx-auto max-w-5xl">
        {/* Header toolbar */}
        <header className="mb-10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
          <div>
            <span className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-gr-board">
              Dashboard Pembeli
            </span>
            <h1 className="mt-3 font-display text-4xl sm:text-5xl font-semibold text-gr-ink tracking-tight">
              Permintaan Saya
            </h1>
            <p className="mt-2 font-sans text-sm text-gr-ink-soft max-w-xl">
              Pantau progress pemenuhan komoditas panen yang telah Anda ajukan kepada para petani lokal.
            </p>
          </div>

          <Link
            href="/ajukan-permintaan"
            className="group flex items-center gap-2 bg-gr-board hover:bg-gr-board/90 text-gr-chalk font-mono text-xs font-bold uppercase tracking-wider px-6 py-3.5 rounded-sm transition-all duration-200  cursor-pointer"
          >
            <Plus size={14} />
            <span>Ajukan Baru</span>
          </Link>
        </header>

        <div className="h-px w-full bg-gr-line mb-8" />

        {/* Requests List */}
        {requests.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {requests.map((req) => {
              const needed = req.quantity_kg_needed;
              const committed = req.quantity_kg_committed;
              const percent = Math.min(100, Math.round((committed / needed) * 100));

              const deadlineDate = new Date(req.deadline).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              });

              return (
                <div 
                  key={req.id}
                  className="group relative rounded-sm border border-gr-line bg-white/80 p-6 hover:border-gr-ink/30 transition-all duration-200 flex flex-col justify-between "
                >
                  <Link href={`/permintaan/${req.id}`} className="absolute inset-0 z-10" />
                  
                  <div>
                    {/* Top Row: Status & Request ID */}
                    <div className="flex justify-between items-start gap-4 mb-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-sm font-mono text-[9px] uppercase tracking-wider font-bold border ${
                        req.status === 'TERBUKA'
                          ? 'bg-gr-board/10 text-gr-board border-gr-board/20'
                          : req.status === 'TERPENUHI'
                          ? 'bg-gr-up/10 text-gr-up border-gr-up/20'
                          : req.status === 'DIBATALKAN'
                          ? 'bg-gr-down/10 text-gr-down border-gr-down/20'
                          : 'bg-gr-paper text-gr-ink-soft border-gr-line'
                      }`}>
                        {req.status}
                      </span>
                      <span className="font-mono text-xs font-bold text-gr-ink-soft/70">
                        Request ID: {req.id.slice(0, 8)}
                      </span>
                    </div>

                    {/* Product Title */}
                    <h3 className="font-display text-2xl font-semibold tracking-tight text-gr-ink group-hover:text-gr-board transition-colors">
                      {req.commodity_name}
                    </h3>

                    {/* Divider */}
                    <div className="h-px bg-gr-line/20 my-4" />

                    {/* Attributes Grid (Kategori & Harga Penawaran) */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="font-mono text-[8px] uppercase tracking-widest text-gr-ink-soft/75 font-bold block">
                          Kategori
                        </span>
                        <span className="font-sans text-xs font-semibold text-gr-ink block uppercase">
                          {req.category}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <span className="font-mono text-[8px] uppercase tracking-widest text-gr-ink-soft/75 font-bold block">
                          Harga Penawaran
                        </span>
                        <div className="flex items-baseline gap-0.5 font-display text-xs font-bold text-gr-ink whitespace-nowrap">
                          <span>Rp {req.price_per_kg ? req.price_per_kg.toLocaleString('id-ID') : '-'}</span>
                          <span className="text-[8px] text-gr-ink-soft font-bold">/ KG</span>
                        </div>
                      </div>
                    </div>

                    {/* Progress Area */}
                    <div className="mt-5 space-y-3">
                      {/* Bar indicator */}
                      <div className="w-full bg-gr-paper h-2 rounded-full overflow-hidden border border-gr-line">
                        <div 
                          className="bg-gr-up h-full rounded-sm transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>

                      {/* Info Grid (Volume & Deadline) */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <span className="font-mono text-[8px] uppercase tracking-widest text-gr-ink-soft/75 font-bold block">
                            Volume Pemenuhan
                          </span>
                          <div className="font-mono text-xs font-bold text-gr-ink leading-none">
                            {committed.toLocaleString('id-ID')} <span className="text-[10px] text-gr-ink-soft/70 font-normal">dari</span> {needed.toLocaleString('id-ID')} <span className="text-[9px] text-gr-ink-soft/70 font-bold tracking-wider">KG</span>
                          </div>
                        </div>
                        <div className="space-y-1 text-right">
                          <span className="font-mono text-[8px] uppercase tracking-widest text-gr-ink-soft/75 font-bold block text-right">
                            Deadline Pemenuhan
                          </span>
                          <span className="flex items-center justify-end gap-1 font-mono text-xs font-bold text-gr-ink leading-none">
                            <Calendar size={11} className="text-gr-ink-soft/70 shrink-0" />
                            {deadlineDate}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom section with divider and link */}
                  <div className="mt-5">
                    <div className="h-px bg-gr-line/20 mb-4" />
                    <div className="flex justify-end relative z-20">
                      <span className="inline-flex items-center gap-1 text-gr-board font-mono text-[10px] uppercase font-bold tracking-wider transition-all">
                        <span className="group-hover:underline">Lihat Detail</span>
                        <ArrowRight size={12} className="transform group-hover:translate-x-1 transition-transform duration-200" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-gr-line rounded-sm bg-white/40 p-8 ">
            <ClipboardList className="h-12 w-12 text-gr-ink-soft/30 mb-4" />
            <span className="font-display text-2xl font-semibold text-gr-ink">
              Belum mengajukan permintaan
            </span>
            <p className="mt-2 font-sans text-sm text-gr-ink-soft max-w-xs">
              Mulai ajukan komoditas pangan yang Anda butuhkan di masa depan untuk dipenuhi oleh petani.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
