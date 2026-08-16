'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { demandRequestsApi } from '@/lib/api/demand-requests';
import { referencePricesApi } from '@/lib/api/reference-prices';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { BgPattern } from '@/components/effects/bg-pattern';
import { FilmGrain } from '@/components/effects/film-grain';
import { ArrowLeft, Calendar, Loader2, Info, AlertTriangle, CheckCircle, MapPin } from 'lucide-react';
import Link from 'next/link';
import { reverseGeocode as fetchAddress } from '@/lib/utils/geocode';
import { provinceCentroids } from '@/lib/data/province-centroids';

const getCategoryForCommodity = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('beras')) return 'BERAS';
  if (n.includes('bawang merah')) return 'BAWANG MERAH';
  if (n.includes('bawang putih')) return 'BAWANG PUTIH';
  if (n.includes('cabai rawit') || n.includes('rawit')) return 'CABAI RAWIT';
  if (n.includes('cabai merah') || n.includes('cabai')) return 'CABAI MERAH';
  if (n.includes('daging ayam') || n.includes('ayam')) return 'DAGING AYAM';
  if (n.includes('telur')) return 'TELUR AYAM';
  if (n.includes('daging sapi') || n.includes('sapi')) return 'DAGING SAPI';
  if (n.includes('minyak')) return 'MINYAK GORENG';
  if (n.includes('gula')) return 'GULA PASIR';
  return 'BERAS'; // Default fallback
};

export default function AjukanPermintaanPage() {
  const router = useRouter();
  
  // Auth state
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState<any | null>(null);

  // Form inputs
  const [commodityName, setCommodityName] = useState('');
  const [category, setCategory] = useState('BERAS');
  const [quantity, setQuantity] = useState('');
  const [pricePerKg, setPricePerKg] = useState('');
  const [deadline, setDeadline] = useState('');
  const [addressName, setAddressName] = useState('');

  // Autocomplete state
  const [allCommodities, setAllCommodities] = useState<string[]>([]);
  const [filteredCommodities, setFilteredCommodities] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Status state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Geolocation state
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [refPrice, setRefPrice] = useState<number | null>(null);
  const [refPriceRegion, setRefPriceRegion] = useState<string>('');

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

  const reverseGeocode = async (latitude: number, longitude: number) => {
    const fallbackProv = getClosestProvince(latitude, longitude);
    setAddressName(fallbackProv);

    const result = await fetchAddress(latitude, longitude);
    if (result) {
      setAddressName(result.full || result.short);
    }
  };

  const fetchReferencePrice = async (commodity: string, latitude: number | null, longitude: number | null) => {
    try {
      const region = latitude && longitude ? getClosestProvince(latitude, longitude) : 'Nasional';
      
      const [regionRes, nationalRes] = await Promise.all([
        referencePricesApi.getReferencePrices(1, 1, commodity, undefined, region),
        region !== 'Nasional' ? referencePricesApi.getReferencePrices(1, 1, commodity, undefined, 'Nasional') : null
      ]);
      
      if (regionRes.items && regionRes.items.length > 0) {
        setRefPrice(regionRes.items[0].price_per_kg);
        setRefPriceRegion(region);
      } else if (nationalRes && nationalRes.items && nationalRes.items.length > 0) {
        setRefPrice(nationalRes.items[0].price_per_kg);
        setRefPriceRegion('Nasional');
      } else {
        setRefPrice(null);
        setRefPriceRegion('');
      }
    } catch (err) {
      console.error('Failed to fetch ref price:', err);
      setRefPrice(null);
      setRefPriceRegion('');
    }
  };

  // Reactively fetch reference price when commodity name or coordinates change
  useEffect(() => {
    if (commodityName.trim()) {
      fetchReferencePrice(commodityName, lat, lng);
    } else {
      setRefPrice(null);
    }
  }, [commodityName, lat, lng]);

  const requestLocation = () => {
    setGettingLocation(true);
    setLocationError('');

    if (!navigator.geolocation) {
      setLocationError('Browser Anda tidak mendukung fitur lokasi (geolocation)');
      setGettingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        setLat(latitude);
        setLng(longitude);
        setGettingLocation(false);
        reverseGeocode(latitude, longitude);
      },
      (error) => {
        console.error('Error getting geolocation:', error);
        let msg = 'Gagal mendapatkan lokasi dari browser.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Akses lokasi ditolak. Harap aktifkan izin lokasi di browser Anda untuk melanjutkan.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Informasi lokasi tidak tersedia.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'Waktu permintaan lokasi habis.';
        }
        setLocationError(msg);
        setGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  // 1. Auth check and fetch commodities
  useEffect(() => {
    const checkAuthAndLoad = async () => {
      try {
        const userData = await authApi.getMe();
        setUser(userData);
        if (userData.role !== 'PEMBELI') {
          setCheckingAuth(false);
          return;
        }

        // Fetch distinct commodities for autocomplete
        const refPrices = await referencePricesApi.getReferencePrices(1, 1);
        if (refPrices.distinct_commodities) {
          setAllCommodities(refPrices.distinct_commodities);
        }
        setCheckingAuth(false);
        requestLocation();
      } catch (err) {
        router.replace('/login');
      }
    };
    checkAuthAndLoad();
  }, [router]);

  // Close autocomplete on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter commodities on input change
  const handleCommodityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCommodityName(val);
    setCategory(getCategoryForCommodity(val));
    if (val.trim() === '') {
      setFilteredCommodities([]);
      setShowDropdown(false);
    } else {
      const filtered = allCommodities.filter((item) =>
        item.toLowerCase().includes(val.toLowerCase())
      );
      setFilteredCommodities(filtered);
      setShowDropdown(true);
    }
  };

  const selectCommodity = (name: string) => {
    setCommodityName(name);
    setCategory(getCategoryForCommodity(name));
    setShowDropdown(false);
  };

  // Get minimum date (7 days from today)
  const getMinDateString = () => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().split('T')[0];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!commodityName.trim()) {
      setError('Nama komoditas harus diisi');
      return;
    }
    const parsedQty = parseFloat(quantity);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      setError('Jumlah (kg) harus bernilai lebih dari 0');
      return;
    }
    const parsedPrice = parseFloat(pricePerKg);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setError('Harga penawaran per KG harus bernilai lebih dari 0');
      return;
    }
    if (!deadline) {
      setError('Tanggal tenggat waktu (deadline) harus ditentukan');
      return;
    }

    const minDeadline = new Date();
    minDeadline.setDate(minDeadline.getDate() + 7);
    const selectedDeadline = new Date(deadline);
    if (selectedDeadline < minDeadline) {
      setError('Tenggat waktu minimal harus 1 minggu dari hari ini');
      return;
    }

    if (gettingLocation) {
      setError('Sedang mendapatkan koordinat lokasi Anda...');
      return;
    }

    if (lat === null || lng === null) {
      setError(locationError || 'Lokasi dari browser diperlukan untuk mengajukan permintaan.');
      return;
    }

    setLoading(true);
    try {
      const res = await demandRequestsApi.createDemandRequest({
        commodity_name: commodityName,
        category,
        quantity_kg_needed: parsedQty,
        price_per_kg: parsedPrice,
        deadline: new Date(deadline).toISOString(),
        latitude: lat,
        longitude: lng
      });
      router.push(`/permintaan/${res.id}`);
    } catch (err: any) {
      setError(err.message || 'Gagal mengajukan permintaan');
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gr-paper">
        <BgPattern />
        <Loader2 className="h-12 w-12 text-gr-board animate-spin opacity-50 z-10" />
      </main>
    );
  }

  // Restricted access for non-buyers
  if (user && user.role !== 'PEMBELI') {
    return (
      <main className="relative min-h-screen bg-gr-paper py-24 px-4 sm:px-6 lg:px-8 flex flex-col justify-center items-center">
        <BgPattern />
        <FilmGrain />
        <div className="relative z-10 max-w-md w-full bg-white/60 dark:bg-white/10 border border-gr-line p-8 rounded-sm  text-center backdrop-blur-sm">
          <AlertTriangle className="h-16 w-16 text-gr-down mx-auto mb-6 animate-pulse" />
          <h2 className="font-display text-2xl font-medium text-gr-ink mb-3">Akses Dibatasi</h2>
          <p className="font-sans text-sm text-gr-ink-soft mb-6 leading-relaxed">
            Halaman ini khusus untuk Pembeli mengajukan permintaan hasil panen di masa depan. Akun Anda terdaftar sebagai <span className="font-bold text-gr-board">{user.role}</span>.
          </p>
          <Link
            href="/beranda"
            className="inline-flex items-center gap-2 bg-gr-board text-gr-chalk border border-gr-board hover:bg-gr-board/90 font-mono text-xs font-bold uppercase tracking-widest px-6 py-3 rounded-sm transition-all  cursor-pointer"
          >
            Kembali ke Beranda
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="relative min-h-screen bg-gr-paper py-12 px-4 sm:px-6 lg:px-8">
      <BgPattern />
      <FilmGrain />

      <div className="relative z-10 mx-auto max-w-2xl">
        {/* Back Link */}
        <div className="mb-6">
          <Link 
            href="/permintaan-saya" 
            className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-gr-ink-soft hover:text-gr-ink transition-colors"
          >
            <ArrowLeft size={12} />
            Kembali ke Permintaan Saya
          </Link>
        </div>

        <header className="mb-12 text-center select-none">
          <h1 className="font-display text-5xl font-medium tracking-tight text-gr-ink">
            Ajukan Permintaan
          </h1>
          <p className="mt-4 font-sans text-gr-ink-soft italic">
            "Ajukan kebutuhan panen Anda agar para petani dapat mempersiapkan dan mengalokasikan hasil kebun mereka."
          </p>
        </header>

        {/* Form Container */}
        <div className="space-y-6 rounded-sm bg-white/60 dark:bg-white/10 p-8 border border-gr-line  backdrop-blur-sm text-gr-ink">
          {error && (
            <div className="rounded-sm bg-gr-down/10 p-4 text-xs text-gr-down border border-gr-down/20 font-sans flex items-center gap-2">
              <Info size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Commodity Name Autocomplete */}
            <div className="relative" ref={dropdownRef}>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold">
                Nama Komoditas
              </label>
              <input
                type="text"
                placeholder="Contoh: Beras Medium, Cabai Rawit Merah..."
                value={commodityName}
                onChange={handleCommodityChange}
                onFocus={() => {
                  setFilteredCommodities(commodityName ? allCommodities.filter(item => item.toLowerCase().includes(commodityName.toLowerCase())) : allCommodities);
                  setShowDropdown(true);
                }}
                className="mt-2 block w-full bg-white/40 border border-gr-line hover:border-gr-ink-soft/40 px-3 py-2 text-sm text-gr-ink focus:outline-none focus:border-gr-board/50 rounded-sm transition-all placeholder:text-gr-ink-soft/40"
              />
              {/* Autocomplete Dropdown */}
              {showDropdown && filteredCommodities.length > 0 && (
                <div className="absolute left-0 right-0 mt-2 max-h-48 overflow-y-auto rounded-sm border border-gr-line bg-gr-paper backdrop-blur-sm  z-30 divide-y divide-gr-line/40 text-gr-ink">
                  {filteredCommodities.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => selectCommodity(item)}
                      className="w-full text-left px-4 py-3 font-sans text-xs text-gr-ink hover:text-gr-board hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reference Price Info Box */}
            <div className="rounded-sm border border-gr-line bg-white/20 p-4 font-sans text-xs">
              <span className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold mb-2">
                Harga Acuan Pasar (PIHPS)
              </span>
              {refPrice !== null ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-gr-board font-medium">
                    <Info size={14} className="text-gr-board shrink-0" />
                    <span>Terdeteksi wilayah <span className="font-bold">{refPriceRegion}</span> untuk komoditas <span className="font-bold">{commodityName}</span></span>
                  </div>
                  <span className="font-mono text-sm font-bold text-gr-board bg-white/40 border border-gr-line px-3 py-1 rounded-sm w-fit">
                    Rp {refPrice.toLocaleString('id-ID')}/KG
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gr-ink-soft/75">
                  <Info size={14} className="shrink-0" />
                  <span>Silakan ketik dan pilih nama komoditas di atas untuk memuat harga acuan pasar wilayah Anda.</span>
                </div>
              )}
            </div>

            {/* Quantity */}
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold">
                Jumlah yang Dibutuhkan (KG)
              </label>
              <input
                type="number"
                step="any"
                min="0.1"
                placeholder="Contoh: 150"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-2 block w-full bg-white/40 border border-gr-line hover:border-gr-ink-soft/40 px-3 py-2 text-sm text-gr-ink font-mono focus:outline-none focus:border-gr-board/50 rounded-sm transition-all placeholder:text-gr-ink-soft/40"
              />
            </div>

            {/* Price per KG */}
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold mb-2">
                Harga Penawaran per KG (IDR)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 font-mono text-sm text-gr-ink-soft/50 font-bold">
                  Rp
                </span>
                <CurrencyInput
                  placeholder="Contoh: 35000"
                  value={pricePerKg}
                  onValueChange={(val) => setPricePerKg(val)}
                  className="block w-full bg-white/40 border border-gr-line hover:border-gr-ink-soft/40 pl-9 pr-3 py-2 text-sm text-gr-ink font-mono font-bold focus:outline-none focus:border-gr-board/50 rounded-sm transition-all placeholder:text-gr-ink-soft/40"
                />
              </div>

              {/* Price Assistant Box */}
              {refPrice !== null && pricePerKg && (
                <div className="mt-3 font-sans text-xs">
                  {parseFloat(pricePerKg) < 0.75 * refPrice && (
                    <div className="rounded-sm bg-gr-down/10 p-4 text-gr-down border border-gr-down/20 flex gap-2 items-start ">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <span className="font-mono uppercase tracking-wider text-[10px] font-bold block">Harga Penawaran Cukup Rendah</span>
                        <p className="mt-1 leading-relaxed text-xs">
                          Rata-rata harga acuan saat ini adalah <strong>Rp {refPrice.toLocaleString('id-ID')}/kg</strong>. Penawaran Anda jauh di bawah pasar. Petani mungkin akan ragu untuk mengambil komitmen ini.
                        </p>
                      </div>
                    </div>
                  )}
                  {parseFloat(pricePerKg) > 1.20 * refPrice && (
                    <div className="rounded-sm bg-gr-board/10 p-4 text-gr-board border border-gr-board/20 flex gap-2 items-start ">
                      <CheckCircle size={16} className="shrink-0 mt-0.5 text-gr-board animate-pulse" />
                      <div>
                        <span className="font-mono uppercase tracking-wider text-[10px] font-bold block">Penawaran Sangat Menarik</span>
                        <p className="mt-1 leading-relaxed text-xs">
                          Penawaran Anda (<strong>Rp {parseFloat(pricePerKg).toLocaleString('id-ID')}/kg</strong>) berada di atas harga pasar rata-rata (<strong>Rp {refPrice.toLocaleString('id-ID')}/kg</strong>). Ini akan sangat menarik bagi para petani!
                        </p>
                      </div>
                    </div>
                  )}
                  {parseFloat(pricePerKg) >= 0.75 * refPrice && parseFloat(pricePerKg) <= 1.20 * refPrice && (
                    <div className="rounded-sm bg-gr-up/10 p-4 text-gr-up border border-gr-up/20 flex gap-2 items-start ">
                      <CheckCircle size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <span className="font-mono uppercase tracking-wider text-[10px] font-bold block">Harga Penawaran Adil & Kompetitif</span>
                        <p className="mt-1 leading-relaxed text-xs">
                          Penawaran Anda kompetitif dengan rata-rata acuan harga pasar saat ini (<strong>Rp {refPrice.toLocaleString('id-ID')}/kg</strong>).
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Deadline */}
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold mb-2">
                Batas Akhir Pemenuhan (Deadline)
              </label>
              <div className="relative">
                <input
                  type="date"
                  min={getMinDateString()}
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full bg-white/40 border border-gr-line hover:border-gr-ink-soft/40 pl-9 pr-3 py-2 text-sm text-gr-ink font-mono focus:outline-none focus:border-gr-board/50 rounded-sm transition-all cursor-pointer"
                />
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gr-ink-soft pointer-events-none" />
              </div>
              <p className="mt-2 font-sans text-[10px] text-gr-ink-soft leading-relaxed flex items-center gap-1.5">
                <Info size={11} className="text-gr-board shrink-0" />
                Minimal 1 minggu dari hari ini agar petani memiliki waktu persiapan tanam/panen.
              </p>
            </div>

            {/* Geolocation Status */}
            <div className="rounded-sm border border-gr-line bg-white/20 p-4 font-sans text-xs">
              <span className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold mb-2">
                Lokasi Pengiriman (Browser GPS)
              </span>
              {gettingLocation ? (
                <div className="flex items-center gap-2 text-gr-ink-soft">
                  <Loader2 size={14} className="animate-spin text-gr-board" />
                  <span>Mendeteksi koordinat lokasi Anda...</span>
                </div>
              ) : locationError ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-gr-down">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <span>{locationError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={requestLocation}
                    className="px-3 py-1.5 border border-gr-line hover:border-gr-ink text-[10px] font-mono uppercase tracking-wider bg-white/40 hover:bg-white/60 text-gr-ink rounded-sm transition-all duration-200  cursor-pointer"
                  >
                    Coba Dapatkan Ulang Lokasi
                  </button>
                </div>
              ) : lat !== null && lng !== null ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 text-gr-board">
                    <div className="h-2 w-2 rounded-full bg-gr-board animate-pulse shrink-0" />
                    <span className="font-sans text-xs font-semibold">Lokasi Terdeteksi</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-gr-board bg-gr-board/10 border border-gr-board/20 px-3 py-1.5 rounded-sm  max-w-xs truncate">
                    <MapPin size={11} className="stroke-[2.2] shrink-0" />
                    <span className="truncate">{addressName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-gr-down">
                  <Info size={14} className="shrink-0 mt-0.5" />
                  <span>Menunggu izin akses lokasi...</span>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gr-board text-gr-chalk border border-gr-board hover:bg-gr-board/90 font-mono text-xs font-bold uppercase tracking-widest py-4 rounded-sm transition-all  cursor-pointer flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memproses Pengajuan...
                  </>
                ) : (
                  'Ajukan Permintaan Sekarang'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
