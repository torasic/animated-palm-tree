'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { BgPattern } from '@/components/effects/bg-pattern';
import { Glow } from '@/components/effects/glow';
import { Store, ArrowLeft, Loader2, Info } from 'lucide-react';
import Link from 'next/link';

export default function UpgradeToFarmerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingUser, setCheckingUser] = useState(true);
  const [user, setUser] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Profile Form States
  const [bio, setBio] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authApi.getMe();
        setUser(userData);
        setBio(userData.bio || '');
        setBankName(userData.bank_name || '');
        setBankAccountNumber(userData.bank_account_number || '');
        setBankAccountHolder(userData.bank_account_holder || '');
        if (userData.role === 'PETANI') {
          setSuccess(true);
        }
      } catch (err: any) {
        if (err.status !== 401) {
          console.error('Failed to get user:', err);
        }
        router.replace('/login');
      } finally {
        setCheckingUser(false);
      }
    };
    fetchUser();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!bio.trim()) {
      setError('Deskripsi/Bio Ladang wajib diisi');
      return;
    }
    if (!bankName) {
      setError('Silakan pilih nama Bank');
      return;
    }
    if (!bankAccountHolder.trim()) {
      setError('Nama pemilik rekening wajib diisi');
      return;
    }
    if (!bankAccountNumber.trim()) {
      setError('Nomor rekening wajib diisi');
      return;
    }

    setLoading(true);

    try {
      await authApi.upgradeToFarmer({
        bio: bio.trim(),
        bank_name: bankName.trim(),
        bank_account_number: bankAccountNumber.trim(),
        bank_account_holder: bankAccountHolder.trim(),
      });
      setSuccess(true);
      setTimeout(() => {
        router.push('/jual');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Gagal melakukan upgrade role');
      setLoading(false);
    }
  };

  if (checkingUser) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gr-paper">
        <BgPattern />
        <Loader2 className="h-10 w-10 text-gr-board animate-spin opacity-60 z-10" />
      </main>
    );
  }

  return (
    <main className="relative flex min-h-[calc(100vh-80px)] flex-col items-center justify-center overflow-hidden py-12 px-4 sm:px-6 lg:px-8 bg-gr-paper">
      <BgPattern />
      <Glow color="var(--gr-board)" position="center" className="opacity-10 pointer-events-none" />

      <div className="z-10 w-full max-w-lg space-y-6 rounded-sm border border-gr-line bg-white/80 p-8 sm:p-10 backdrop-blur-xl  relative overflow-hidden">
        {/* Editorial Double Rule Top Accent */}
        <div className="absolute top-0 inset-x-0">
          <div className="h-[3px] bg-gr-ink w-full" />
          <div className="h-[1px] bg-gr-ink w-full mt" />
        </div>

        <div className="flex flex-col items-center text-center pt-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-sm border border-gr-line bg-gr-paper text-gr-ink mb-4 ">
            <Store size={22} />
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-gr-ink">
            Mulai Jualan (Petani/Peternak)
          </h2>
          <p className="mt-2 font-sans text-xs text-gr-ink-soft max-w-sm leading-relaxed">
            Lengkapi data profil dan rekening bank Anda terlebih dahulu untuk mengaktifkan status Petani/Peternak/Penjual.
          </p>
        </div>

        {success ? (
          <div className="space-y-6 text-center py-4">
            <div className="rounded-sm bg-gr-up/10 p-4 text-xs font-mono text-gr-up border border-gr-up/30">
              Selamat! Akun Anda telah sukses diupgrade menjadi Petani/Peternak.
            </div>
            <p className="font-sans text-xs text-gr-ink-soft/70">
              Mengalihkan ke halaman jual produk...
            </p>
            <Button
              onClick={() => router.push('/jual')}
              className="w-full bg-gr-board text-gr-chalk hover:bg-gr-board/90 font-mono text-xs font-bold uppercase tracking-widest py-6 rounded-sm  cursor-pointer"
            >
              Ke Halaman Jual
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-sm bg-gr-down/10 p-3.5 text-xs text-gr-down border border-gr-down/30 font-mono text-[11px]">
                {error}
              </div>
            )}

            {/* Disclaimer Peran */}
            <div className="rounded-sm bg-gr-board/10 p-3.5 text-gr-board border border-gr-board/20 flex gap-2.5 items-start text-xs font-sans leading-relaxed">
              <Info size={16} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-mono uppercase tracking-wider text-[9px] font-bold block">Catatan Peran</span>
                Sebagai <strong>Petani/Peternak</strong>, Anda tetap dapat membeli bahan pangan/produk dari petani/peternak lain, namun Anda <strong>tidak dapat mengajukan permintaan komoditas baru</strong>.
              </div>
            </div>



            {/* Deskripsi Ladang / Bio */}
            <div className="space-y-1.5">
              <label htmlFor="bio" className="block font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink-soft">
                Deskripsi / Bio Petani/Peternak
              </label>
              <textarea
                id="bio"
                rows={3}
                required
                maxLength={1000}
                placeholder="Ceritakan tentang pertanian, peternakan, ladang, atau komoditas Anda..."
                className="block w-full rounded-sm border border-gr-line bg-white focus:outline-none focus:ring-1 focus:ring-gr-board/20 p-2.5 font-sans text-xs text-gr-ink placeholder-gr-ink-soft/45 transition-all "
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>

            {/* Bank Penerima Dana Rekening Bersama */}
            <div className="border-t border-gr-line/40 pt-4 mt-2 space-y-4">
              <h4 className="font-mono text-[10px] font-bold text-gr-ink uppercase tracking-wider">
                Rekening Bank Penerimaan Dana
              </h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="bank-name" className="block font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink-soft">
                    Nama Bank
                  </label>
                  <select
                    id="bank-name"
                    required
                    className="block w-full rounded-sm border border-gr-line bg-white px-3.5 py-2.5 font-sans text-gr-ink focus:border-gr-board focus:outline-none focus:ring-1 focus:ring-gr-board text-sm transition-all "
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                  >
                    <option value="">Pilih Bank</option>
                    <option value="MANDIRI">Bank Mandiri</option>
                    <option value="BRI">Bank Rakyat Indonesia (BRI)</option>
                    <option value="BCA">Bank Central Asia (BCA)</option>
                    <option value="BNI">Bank Negara Indonesia (BNI)</option>
                    <option value="CIMB">CIMB Niaga</option>
                    <option value="PERMATA">Bank Permata</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="bank-acc-holder" className="block font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink-soft">
                    Pemilik Rekening
                  </label>
                  <input
                    id="bank-acc-holder"
                    type="text"
                    required
                    placeholder="Sesuai buku tabungan"
                    className="block w-full rounded-sm border border-gr-line bg-white px-3.5 py-2.5 font-sans text-gr-ink placeholder-gr-ink-soft/45 focus:border-gr-board focus:outline-none focus:ring-1 focus:ring-gr-board text-sm transition-all "
                    value={bankAccountHolder}
                    onChange={(e) => setBankAccountHolder(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="bank-acc-number" className="block font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink-soft">
                  Nomor Rekening Bank
                </label>
                <input
                  id="bank-acc-number"
                  type="text"
                  required
                  placeholder="Contoh: 1234567890"
                  className="block w-full rounded-sm border border-gr-line bg-white px-3.5 py-2.5 font-sans text-gr-ink placeholder-gr-ink-soft/45 focus:border-gr-board focus:outline-none focus:ring-1 focus:ring-gr-board text-sm transition-all "
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-4 pt-4 border-t border-gr-line/40">
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gr-board text-gr-chalk hover:bg-gr-board/90 font-mono text-xs font-bold uppercase tracking-widest py-6 rounded-sm  cursor-pointer transition-all"
              >
                {loading ? 'Memproses Upgrade...' : 'Kirim & Upgrade'}
              </Button>

              <Link href="/settings" className="flex items-center justify-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-gr-ink-soft/60 hover:text-gr-ink transition-colors py-2">
                <ArrowLeft size={12} />
                Kembali ke Pengaturan
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
