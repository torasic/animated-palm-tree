'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { ratingsApi } from '@/lib/api/ratings';
import { Button } from '@/components/ui/button';
import { BgPattern } from '@/components/effects/bg-pattern';
import { FilmGrain } from '@/components/effects/film-grain';
import { Glow } from '@/components/effects/glow';
import { provinceCentroids } from '@/lib/data/province-centroids';
import { cn } from '@/lib/utils';
import { reverseGeocode as fetchAddress } from '@/lib/utils/geocode';
import { 
  User, 
  Store, 
  MapPin, 
  Star, 
  ArrowLeft, 
  Loader2, 
  Save, 
  CheckCircle, 
  Upload, 
  Compass,
  Award
} from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [user, setUser] = useState<any | null>(null);
  
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'profile' | 'address' | 'reputation'>('profile');

  // Editable Profile States
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');
  const [selectedRole, setSelectedRole] = useState<'PETANI' | 'PEMBELI'>('PEMBELI');

  // Location States
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationSuccess, setLocationSuccess] = useState('');
  const [locationAddressName, setLocationAddressName] = useState('');

  // Avatar Upload States
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Reputation Stats States
  const [sellerRatings, setSellerRatings] = useState<any>(null);
  const [buyerRatings, setBuyerRatings] = useState<any>(null);
  const [showSellerList, setShowSellerList] = useState(true);
  const [showBuyerList, setShowBuyerList] = useState(false);

  const getClosestProvince = (latitude: number, longitude: number) => {
    let closestProv = 'Di Yogyakarta';
    let minDist = Infinity;
    Object.entries(provinceCentroids).forEach(([provName, coords]) => {
      const dist = Math.sqrt((coords.lat - latitude) ** 2 + (coords.lng - longitude) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closestProv = provName;
      }
    });
    return closestProv;
  };

  const reverseGeocodeSettings = async (latitude: number, longitude: number) => {
    const fallback = getClosestProvince(latitude, longitude);
    setLocationAddressName(fallback);

    const result = await fetchAddress(latitude, longitude);
    if (result) {
      setLocationAddressName(result.full || result.short);
    }
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authApi.getMe();
        setUser(userData);
        setFullName(userData.full_name || '');
        setPhone(userData.phone_whatsapp || '');
        setAvatarUrl(userData.avatar_url || '');
        setBio(userData.bio || '');
        setBankName(userData.bank_name || '');
        setBankAccountNumber(userData.bank_account_number || '');
        setBankAccountHolder(userData.bank_account_holder || '');
        setSelectedRole(userData.role || 'PEMBELI');
        setLat(userData.latitude || null);
        setLng(userData.longitude || null);
        if (userData.latitude && userData.longitude) {
          reverseGeocodeSettings(userData.latitude, userData.longitude);
        }
        
        try {
          const sellerData = await ratingsApi.getUserRatingsAsSeller(userData.id);
          setSellerRatings(sellerData);
          
          const buyerData = await ratingsApi.getUserRatingsAsBuyer(userData.id);
          setBuyerRatings(buyerData);
        } catch (rErr) {
          console.error('Failed to fetch ratings:', rErr);
        }
      } catch (err: any) {
        if (err.status !== 401) {
          console.error('Failed to get user:', err);
        }
        router.replace('/login');
      } finally {
        setFetching(false);
      }
    };
    fetchUser();
  }, [router]);

  const validatePhone = (num: string) => {
    const cleaned = num.replace(/[\s\-()]/g, '');
    return /^(\+628|628|08)[0-9]{7,11}$/.test(cleaned);
  };

  const handleUpdateLocation = () => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      setLocationLoading(true);
      setLocationSuccess('');
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const currentLat = position.coords.latitude;
          const currentLng = position.coords.longitude;
          try {
            const updatedUser = await authApi.updateLocation(currentLat, currentLng);
            setUser(updatedUser);
            setLat(currentLat);
            setLng(currentLng);
            setLocationSuccess('Lokasi GPS berhasil disinkronkan!');
            setTimeout(() => setLocationSuccess(''), 3000);
            reverseGeocodeSettings(currentLat, currentLng);
          } catch (err: any) {
            setError(err.message || 'Gagal menyimpan koordinat lokasi');
          } finally {
            setLocationLoading(false);
          }
        },
        (error) => {
          console.error('Geolocation failed:', error);
          setError('Izin GPS ditolak atau GPS tidak aktif.');
          setLocationLoading(false);
        },
        { timeout: 8000 }
      );
    } else {
      setError('Browser Anda tidak mendukung layanan lokasi.');
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size limit (1MB)
    if (file.size > 1024 * 1024) {
      setError('Ukuran file maksimal adalah 1 MB.');
      return;
    }

    setAvatarUploading(true);
    setError('');
    setSuccess('');

    try {
      const updatedUser = await authApi.uploadAvatar(file);
      setUser(updatedUser);
      setAvatarUrl(updatedUser.avatar_url || '');
      setSuccess('Foto profil berhasil diunggah!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Gagal mengunggah foto profil');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!fullName.trim()) {
      setError('Nama tidak boleh kosong');
      return;
    }

    setLoading(true);

    try {
      const updatedUser = await authApi.updateProfile({ 
        role: selectedRole,
        full_name: fullName.trim(),
        phone_whatsapp: phone || null,
        avatar_url: avatarUrl.trim() || null,
        bio: bio.trim() || null,
        bank_name: bankName.trim() || null,
        bank_account_number: bankAccountNumber.trim() || null,
        bank_account_holder: bankAccountHolder.trim() || null
      });
      setUser(updatedUser);
      setSuccess('Profil berhasil diperbarui!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Gagal memperbarui profil');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gr-bg">
        <BgPattern />
        <Loader2 className="h-12 w-12 text-gr-green animate-spin opacity-50 z-10" />
      </main>
    );
  }

  // Format email representation
  const formatEmail = (emailStr: string) => {
    if (!emailStr) return '';
    const parts = emailStr.split('@');
    if (parts.length !== 2) return emailStr;
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 3) return `***@${domain}`;
    return `${name.slice(0, 2)}*******@${domain}`;
  };

  return (
    <main className="relative flex min-h-[calc(100vh-80px)] flex-col items-center justify-start py-10 px-4 sm:px-6 lg:px-8 bg-gr-paper">
      <BgPattern />
      <FilmGrain />
      <Glow color="var(--gr-board)" position="top" className="opacity-5 pointer-events-none" />

      <div className="z-10 w-full max-w-5xl space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gr-line pb-4">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-gr-ink">
              Pengaturan Akun
            </h1>
            <p className="mt-1.5 font-sans text-xs text-gr-ink-soft">
              Kelola data profil, alamat lokasi koordinat, dan pantau skor transaksi Anda.
            </p>
          </div>
          <Link
            href="/beranda"
            className="inline-flex items-center gap-1.5 border border-gr-line bg-white hover:bg-gr-paper text-gr-ink font-mono text-[10px] uppercase tracking-widest px-4 py-2.5 rounded-sm transition-all  hover:border-gr-ink-soft/45 cursor-pointer"
          >
            <ArrowLeft size={12} /> Kembali ke Beranda
          </Link>
        </div>

        {/* Double column grid block like Shopee layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT SIDEBAR MENU: Akun Saya & Reputasi */}
          <div className="lg:col-span-3 bg-[#FAF9F5] border border-gr-line p-5 rounded-sm  space-y-6">
            
            {/* User Profile Mini Header */}
            <div className="flex items-center gap-3 pb-4 border-b border-gr-line/45">
              <div className="relative h-11 w-11 rounded-sm bg-white p-0.5 border border-gr-line shrink-0">
                <div className="h-full w-full rounded-sm bg-gr-paper/40 overflow-hidden flex items-center justify-center text-gr-text-primary font-display text-sm font-bold uppercase">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-display font-bold text-gr-ink opacity-40">
                      {fullName ? fullName.charAt(0) : '?'}
                    </span>
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <div className="font-display font-bold text-xs text-gr-ink truncate">
                  {fullName}
                </div>
              </div>
            </div>

            {/* Sidebar Menu Options */}
            <nav className="flex flex-col gap-1 font-sans text-xs">
              <div className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft/50 font-bold px-2.5 mb-1.5">
                Akun Saya
              </div>
              
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className={`w-full text-left px-3 py-2 rounded-sm font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'profile'
                    ? 'bg-gr-board text-gr-chalk'
                    : 'text-gr-ink hover:bg-gr-ink/5'
                }`}
              >
                <User size={14} />
                <span>Profil Saya</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('address')}
                className={`w-full text-left px-3 py-2 rounded-sm font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'address'
                    ? 'bg-gr-board text-gr-chalk'
                    : 'text-gr-ink hover:bg-gr-ink/5'
                }`}
              >
                <MapPin size={14} />
                <span>Alamat & Lokasi</span>
              </button>

              {user?.role !== 'PETANI' && (
                <Link
                  href="/settings/upgrade-to-farmer"
                  className="w-full text-left px-3 py-2 rounded-sm font-semibold text-gr-ink hover:bg-gr-ink/5 transition-all flex items-center gap-2"
                >
                  <Store size={14} />
                  <span>Upgrade ke Petani/Peternak</span>
                </Link>
              )}

              <div className="h-px bg-gr-line/50 my-3" />

              <div className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft/50 font-bold px-2.5 mb-1.5">
                Reputasi Saya
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('reputation')}
                className={`w-full text-left px-3 py-2 rounded-sm font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                  activeTab === 'reputation'
                    ? 'bg-gr-board text-gr-chalk'
                    : 'text-gr-ink hover:bg-gr-ink/5'
                }`}
              >
                <Award size={14} />
                <span>Skor Reputasi</span>
              </button>
            </nav>
          </div>

          {/* MAIN SETTINGS FORM CARD (9/12 width) */}
          <div className="lg:col-span-9 bg-[#FAF9F5] border border-gr-line p-6 sm:p-8 rounded-sm  relative overflow-hidden">
            {/* Double top rule */}
            <div className="absolute top-0 inset-x-0">
              <div className="h-[2.5px] bg-gr-ink w-full" />
              <div className="h bg-gr-ink w-full mt-[1.5px]" />
            </div>

            {/* TAB 1: PROFILE MANAGEMENT */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                {/* Form Title Header */}
                <div className="border-b border-gr-line/45 pb-3.5">
                  <h2 className="font-display text-lg font-bold text-gr-ink">
                    Profil Saya
                  </h2>
                  <p className="mt-1 font-sans text-xs text-gr-ink-soft">
                    Kelola informasi profil untuk mengontrol, melindungi dan mengamankan akun Anda.
                  </p>
                </div>

                {error && (
                  <div className="rounded-sm bg-gr-down/10 p-3.5 text-xs text-gr-down border border-gr-down/30 font-mono text-[11px]">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="rounded-sm bg-gr-up/10 p-3.5 text-xs text-gr-up border border-gr-up/30 font-mono text-[11px] flex items-center gap-2">
                    <CheckCircle size={16} />
                    <span>{success}</span>
                  </div>
                )}

                {/* Sub layout: Form inputs left, profile picture upload right */}
                <div className="flex flex-col md:flex-row gap-8 items-start">
                  
                  {/* Form fields */}
                  <form onSubmit={handleSubmit} className="flex-1 space-y-4 w-full">
                    {/* Username */}
                    <div>
                      <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink-soft mb-1.5">
                        Username / ID Akun
                      </span>
                      <div className="block w-full rounded-sm border border-gr-line bg-white/40 px-3.5 py-2.5 font-sans text-gr-ink-soft/80 text-sm ">
                        {user?.email ? user.email.split('@')[0] : 'user'}
                      </div>
                      <span className="block font-mono text-[9px] text-gr-ink-soft/40 mt-1 uppercase tracking-wider">
                        Username ditautkan otomatis dengan akun Google Anda
                      </span>
                    </div>

                    {/* Tipe Akun (Peran) */}
                    <div>
                      <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink-soft mb-1.5">
                        Tipe Akun (Peran)
                      </span>
                      <div className="flex flex-col sm:flex-row gap-3">
                        {[
                          { value: 'PETANI', label: 'Petani/Peternak', desc: 'Menjual hasil panen/ternak & merespons permintaan' },
                          { value: 'PEMBELI', label: 'Pembeli (Buyer)', desc: 'Mengajukan permintaan & membeli bahan pangan' }
                        ].map((roleOpt) => {
                          const isSelected = selectedRole === roleOpt.value;
                          return (
                            <button
                              key={roleOpt.value}
                              type="button"
                              disabled
                              className={cn(
                                "flex-1 border p-3 rounded-sm text-left transition-all duration-200 focus:outline-none cursor-not-allowed opacity-75",
                                isSelected 
                                  ? "border-gr-board bg-gr-board/5 text-gr-ink " 
                                  : "border-gr-line bg-white/40 text-gr-ink-soft/40"
                              )}
                            >
                              <span className="block font-sans text-xs font-extrabold">{roleOpt.label}</span>
                              <span className="block font-sans text-[9px] text-gr-ink-soft/60 mt-0.5 leading-tight">{roleOpt.desc}</span>
                            </button>
                          );
                        })}
                      </div>
                      <span className="block font-mono text-[9px] text-gr-ink-soft/40 mt-1.5 uppercase tracking-wider">
                        Peran tidak dapat diubah dari sini. Gunakan menu upgrade di samping jika ingin menjadi Petani/Peternak.
                      </span>
                    </div>

                    {/* Full Name */}
                    <div>
                      <label htmlFor="shopee-name" className="block font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink-soft mb-1.5">
                        Nama Lengkap
                      </label>
                      <input
                        id="shopee-name"
                        type="text"
                        required
                        placeholder="Masukkan nama lengkap Anda"
                        className="block w-full rounded-sm border border-gr-line bg-white px-3.5 py-2.5 font-sans text-gr-ink placeholder-gr-ink-soft/45 focus:border-gr-board focus:outline-none focus:ring-1 focus:ring-gr-board text-sm transition-all "
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>

                    {/* Email (Obfuscated like Shopee) */}
                    <div>
                      <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink-soft mb-1.5">
                        Alamat Email
                      </span>
                      <div className="flex w-full rounded-sm border border-gr-line bg-white/40 px-3.5 py-2.5 font-sans text-gr-ink-soft/85 text-sm justify-between items-center">
                        <span>{formatEmail(user?.email || '')}</span>
                        <span className="font-mono text-[9px] uppercase tracking-wider text-gr-up bg-gr-up/10 px-1.5 py-0.5 rounded-xs border border-gr-up/25 font-bold">Terverifikasi</span>
                      </div>
                    </div>


                    {/* Bio (Farmers Only) */}
                    {selectedRole === 'PETANI' && (
                      <>
                        <div>
                          <label htmlFor="shopee-bio" className="block font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink-soft mb-1.5">
                            Deskripsi / Bio Petani/Peternak
                          </label>
                          <textarea
                            id="shopee-bio"
                            rows={4}
                            maxLength={1000}
                            placeholder="Ceritakan tentang pertanian, peternakan, ladang, atau komoditas Anda..."
                            className="block w-full rounded-sm border border-gr-line bg-white focus:outline-none focus:ring-1 focus:ring-gr-board/20 p-2.5 font-sans text-xs text-gr-text-primary transition-all "
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                          />
                          <div className="flex justify-between items-center mt-1 font-mono text-[9px] text-gr-ink-soft/50">
                            <span>maksimal 1000 karakter</span>
                            <span>{bio.length}/1000</span>
                          </div>
                        </div>

                        {/* Bank Details */}
                        <div className="border-t border-gr-line/40 pt-6 space-y-4">
                          <h4 className="font-display text-sm font-semibold text-gr-ink uppercase tracking-wider">
                            Rekening Bank (Penerimaan Dana Rekening Bersama)
                          </h4>
                          
                          <div>
                            <label htmlFor="bank-name" className="block font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink-soft mb-1.5">
                              Nama Bank
                            </label>
                            <select
                              id="bank-name"
                              className="block w-full rounded-sm border border-gr-line bg-white px-3.5 py-2.5 font-sans text-gr-ink placeholder-gr-ink-soft/45 focus:border-gr-board focus:outline-none focus:ring-1 focus:ring-gr-board text-sm transition-all "
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

                          <div>
                            <label htmlFor="bank-acc-holder" className="block font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink-soft mb-1.5">
                              Nama Pemilik Rekening
                            </label>
                            <input
                              id="bank-acc-holder"
                              type="text"
                              placeholder="Nama sesuai buku tabungan"
                              className="block w-full rounded-sm border border-gr-line bg-white px-3.5 py-2.5 font-sans text-gr-ink placeholder-gr-ink-soft/45 focus:border-gr-board focus:outline-none focus:ring-1 focus:ring-gr-board text-sm transition-all "
                              value={bankAccountHolder}
                              onChange={(e) => setBankAccountHolder(e.target.value)}
                            />
                          </div>

                          <div>
                            <label htmlFor="bank-acc-number" className="block font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink-soft mb-1.5">
                              Nomor Rekening
                            </label>
                            <input
                              id="bank-acc-number"
                              type="text"
                              placeholder="Contoh: 1234567890"
                              className="block w-full rounded-sm border border-gr-line bg-white px-3.5 py-2.5 font-sans text-gr-ink placeholder-gr-ink-soft/45 focus:border-gr-board focus:outline-none focus:ring-1 focus:ring-gr-board text-sm transition-all "
                              value={bankAccountNumber}
                              onChange={(e) => setBankAccountNumber(e.target.value)}
                            />
                            <span className="block font-mono text-[9px] text-gr-ink-soft/40 mt-1.5 uppercase tracking-wider">
                              Pencairan dana otomatis akan dikirim ke rekening ini setelah pembeli mengonfirmasi pesanan diterima.
                            </span>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="pt-3">
                      <Button
                        type="submit"
                        disabled={loading}
                        className="bg-gr-board text-gr-chalk hover:opacity-90 font-mono text-[10px] font-bold uppercase tracking-widest py-3 px-8 rounded-sm  cursor-pointer transition-all"
                      >
                        {loading ? 'Menyimpan...' : 'Simpan'}
                      </Button>
                    </div>
                  </form>

                  {/* Profile Picture Uploader (Right side matching Shopee layout) */}
                  <div className="w-full md:w-64 flex flex-col items-center justify-center border-l border-gr-line/30 md:pl-8 pt-6 md:pt-0 pb-2 self-stretch">
                    <div className="relative group shrink-0">
                      {/* Live Image Box */}
                      <div className="h-28 w-28 rounded-sm bg-white p-0.5 border border-gr-line/75  overflow-hidden flex items-center justify-center">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="Avatar Large" className="h-full w-full object-cover rounded-sm" />
                        ) : (
                          <span className="font-display font-bold text-gr-ink opacity-30 text-3xl">
                            {fullName ? fullName.charAt(0) : '?'}
                          </span>
                        )}
                      </div>
                      
                      {avatarUploading && (
                        <div className="absolute inset-0 rounded-sm bg-black/40 flex items-center justify-center text-white">
                          <Loader2 size={20} className="animate-spin" />
                        </div>
                      )}
                    </div>

                    <input 
                      type="file"
                      ref={fileInputRef}
                      onChange={handleAvatarChange}
                      accept="image/png, image/jpeg, image/jpg"
                      className="hidden"
                    />

                    <button
                      type="button"
                      disabled={avatarUploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-4 border border-gr-line bg-white hover:bg-gr-paper text-gr-ink font-mono text-[10px] uppercase tracking-widest px-4 py-2 rounded-sm  hover:border-gr-ink-soft/40 cursor-pointer transition-all disabled:opacity-50"
                    >
                      Pilih Gambar
                    </button>

                    <div className="mt-3 text-center text-gr-ink-soft/60 font-sans text-[10px] space-y-1">
                      <p>Ukuran gambar: maks. 1 MB</p>
                      <p>Format gambar: .JPG, .JPEG, .PNG</p>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* TAB 2: ADDRESS & GEOLOCATION LOKASI */}
            {activeTab === 'address' && (
              <div className="space-y-6">
                <div className="border-b border-gr-line/45 pb-3.5">
                  <h2 className="font-display text-lg font-bold text-gr-ink flex items-center gap-2">
                    <MapPin size={18} className="text-gr-board" /> Koordinat Alamat & Lokasi
                  </h2>
                  <p className="mt-1 font-sans text-xs text-gr-ink-soft">
                    Atur lokasi koordinat peta GPS untuk menghitung jarak antara petani/peternak dengan pembeli secara akurat.
                  </p>
                </div>

                {error && (
                  <div className="rounded-sm bg-gr-down/10 p-3.5 text-xs text-gr-down border border-gr-down/30 font-mono text-[11px]">
                    {error}
                  </div>
                )}

                {locationSuccess && (
                  <div className="rounded-sm bg-gr-up/10 p-3.5 text-xs text-gr-up border border-gr-up/30 font-mono text-[11px] flex items-center gap-2">
                    <CheckCircle size={16} />
                    <span>{locationSuccess}</span>
                  </div>
                )}

                <div className="bg-white border border-gr-line p-5 rounded-sm  space-y-4">
                  {lat !== null && lng !== null ? (
                    <div>
                      <span className="block font-mono text-[9px] uppercase tracking-wider text-gr-ink-soft/60 mb-2">
                        Lokasi Tersimpan
                      </span>
                      <div className="flex items-center gap-2.5 bg-gr-board/5 border border-gr-board/20 rounded-sm px-4 py-3">
                        <MapPin size={16} className="text-gr-board shrink-0" />
                        <div className="flex flex-col gap-0.5">
                          <span className="font-sans text-sm font-semibold text-gr-ink">
                            {locationAddressName || getClosestProvince(lat, lng)}
                          </span>
                          <span className="font-mono text-[10px] text-gr-ink-soft">
                            {lat.toFixed(5)}, {lng.toFixed(5)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="block font-mono text-[9px] uppercase tracking-wider text-gr-ink-soft/60 mb-2">
                        Lokasi Tersimpan
                      </span>
                      <div className="flex items-center gap-2.5 bg-gr-paper/40 border border-gr-line rounded-sm px-4 py-3 text-gr-ink-soft">
                        <Compass size={15} className="shrink-0" />
                        <span className="font-sans text-sm">Lokasi belum disinkronkan</span>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-gr-line/40 pt-4 mt-2 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                    <button
                      type="button"
                      disabled={locationLoading}
                      onClick={handleUpdateLocation}
                      className="inline-flex items-center gap-2 bg-gr-board text-gr-chalk hover:opacity-90 font-mono text-[10px] font-bold uppercase tracking-widest py-3 px-5 rounded-sm  transition-all cursor-pointer disabled:opacity-50"
                    >
                      {locationLoading ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Sinkronisasi GPS...</span>
                        </>
                      ) : (
                        <>
                          <Compass size={13} />
                          <span>Perbarui Lokasi GPS</span>
                        </>
                      )}
                    </button>
                    <p className="font-sans text-[10px] text-gr-ink-soft/60 leading-relaxed max-w-md">
                      Klik tombol untuk memperbarui titik koordinat lokasi saat ini berdasarkan GPS perangkat/browser Anda.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: REPUTATION & REVIEWS */}
            {activeTab === 'reputation' && (
              <div className="space-y-6">
                <div className="border-b border-gr-line/45 pb-3.5">
                  <h2 className="font-display text-lg font-bold text-gr-ink flex items-center gap-2">
                    <Award size={18} className="text-gr-board" /> Skor Reputasi & Ulasan
                  </h2>
                  <p className="mt-1 font-sans text-xs text-gr-ink-soft">
                    Tinjau rata-rata penilaian transaksi Anda dari pengguna lain dan riwayat ulasan yang masuk.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Seller reputation box */}
                  <div className="bg-white border border-gr-line p-4 rounded-sm  space-y-3">
                    <div className="border-b border-gr-line/30 pb-2">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-gr-ink-soft/70 font-bold block">
                        Sebagai Penjual
                      </span>
                    </div>
                    {sellerRatings && sellerRatings.count > 0 ? (
                      <div className="space-y-3">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-mono text-2xl font-bold text-gr-ink">★ {sellerRatings.average.toFixed(1)}</span>
                          <span className="font-mono text-[10px] text-gr-ink-soft">({sellerRatings.count} ulasan)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowSellerList(!showSellerList);
                            setShowBuyerList(false);
                          }}
                          className="font-mono text-[9px] uppercase tracking-wider text-gr-board hover:underline cursor-pointer font-bold block"
                        >
                          {showSellerList ? 'Sembunyikan Riwayat' : 'Lihat Ulasan Penjual'}
                        </button>
                      </div>
                    ) : (
                      <p className="font-sans text-xs text-gr-ink-soft/50 italic py-2">
                        Belum memiliki reputasi penilaian transaksi penjualan.
                      </p>
                    )}
                  </div>

                  {/* Buyer reputation box */}
                  <div className="bg-white border border-gr-line p-4 rounded-sm  space-y-3">
                    <div className="border-b border-gr-line/30 pb-2">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-gr-ink-soft/70 font-bold block">
                        Sebagai Pembeli
                      </span>
                    </div>
                    {buyerRatings && buyerRatings.count > 0 ? (
                      <div className="space-y-3">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-mono text-2xl font-bold text-gr-ink">★ {buyerRatings.average.toFixed(1)}</span>
                          <span className="font-mono text-[10px] text-gr-ink-soft">({buyerRatings.count} ulasan)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowBuyerList(!showBuyerList);
                            setShowSellerList(false);
                          }}
                          className="font-mono text-[9px] uppercase tracking-wider text-gr-board hover:underline cursor-pointer font-bold block"
                        >
                          {showBuyerList ? 'Sembunyikan Riwayat' : 'Lihat Ulasan Pembeli'}
                        </button>
                      </div>
                    ) : (
                      <p className="font-sans text-xs text-gr-ink-soft/50 italic py-2">
                        Belum memiliki reputasi penilaian transaksi pembelian.
                      </p>
                    )}
                  </div>
                </div>

                {/* Collapsible Reviews List */}
                {showSellerList && sellerRatings && sellerRatings.ratings.length > 0 && (
                  <div className="bg-white border border-gr-line p-5 rounded-sm  space-y-4 animate-in fade-in duration-200">
                    <h3 className="font-mono text-[9px] font-bold uppercase tracking-widest text-gr-ink-soft border-b border-gr-line/40 pb-2">
                      Daftar Ulasan Masuk Sebagai Penjual
                    </h3>
                    <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1.5 custom-scrollbar">
                      {sellerRatings.ratings.map((r: any) => (
                        <div key={r.id} className="text-xs font-sans border-b border-gr-line/35 last:border-0 pb-3 last:pb-0 pt-0.5">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-gr-ink font-bold text-xs">{r.rater_name || 'Pembeli Anonim'}</span>
                            <span className="text-gr-ink font-mono font-semibold text-[11px]">★ {r.score}</span>
                          </div>
                          {r.comment && <p className="text-gr-ink-soft italic text-xs mt-1 bg-gr-paper/20 border border-gr-line/20 p-2.5 rounded-sm">"{r.comment}"</p>}
                          <span className="text text-gr-ink-soft/60 block mt-1.5 font-mono uppercase tracking-wider">
                            {new Date(r.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {showBuyerList && buyerRatings && buyerRatings.ratings.length > 0 && (
                  <div className="bg-white border border-gr-line p-5 rounded-sm  space-y-4 animate-in fade-in duration-200">
                    <h3 className="font-mono text-[9px] font-bold uppercase tracking-widest text-gr-ink-soft border-b border-gr-line/40 pb-2">
                      Daftar Ulasan Masuk Sebagai Pembeli
                    </h3>
                    <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1.5 custom-scrollbar">
                      {buyerRatings.ratings.map((r: any) => (
                        <div key={r.id} className="text-xs font-sans border-b border-gr-line/35 last:border-0 pb-3 last:pb-0 pt-0.5">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-gr-ink font-bold text-xs">{r.rater_name || 'Petani/Peternak Anonim'}</span>
                            <span className="text-gr-ink font-mono font-semibold text-[11px]">★ {r.score}</span>
                          </div>
                          {r.comment && <p className="text-gr-ink-soft italic text-xs mt-1 bg-gr-paper/20 border border-gr-line/20 p-2.5 rounded-sm">"{r.comment}"</p>}
                          <span className="text text-gr-ink-soft/60 block mt-1.5 font-mono uppercase tracking-wider">
                            {new Date(r.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>

        </div>

      </div>
    </main>
  );
}
