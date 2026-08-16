'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { productsApi } from '@/lib/api/products';
import { authApi } from '@/lib/api/auth';
import { referencePricesApi } from '@/lib/api/reference-prices';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { BgPattern } from '@/components/effects/bg-pattern';
import { FilmGrain } from '@/components/effects/film-grain';
import { provinceCentroids } from '@/lib/data/province-centroids';
import { cn } from '@/lib/utils';
import { Camera, Plus, X, Loader2, Info, AlertTriangle, CheckCircle } from 'lucide-react';
import { reverseGeocode as fetchAddress } from '@/lib/utils/geocode';

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

export default function JualPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const checkRole = async () => {
      try {
        const userData = await authApi.getMe();
        if (userData.role !== 'PETANI') {
          router.push('/settings/upgrade-to-farmer');
        } else {
          setCheckingAuth(false);
          if (userData.latitude !== undefined && userData.latitude !== null && userData.longitude !== undefined && userData.longitude !== null) {
            setLat(userData.latitude);
            setLng(userData.longitude);
            reverseGeocode(userData.latitude, userData.longitude, 'Lokasi terisi dari profil: ');
          } else {
            // Auto-fetch device location on load if profile location is empty
            if (typeof window !== 'undefined' && navigator.geolocation) {
              setLocationStatus('Mencari lokasi otomatis...');
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  setLat(position.coords.latitude);
                  setLng(position.coords.longitude);
                  reverseGeocode(position.coords.latitude, position.coords.longitude, 'Lokasi terisi otomatis: ');
                },
                (error) => {
                  setLocationStatus(`Gagal memuat lokasi otomatis: ${error.message}`);
                },
                { timeout: 8000 }
              );
            }
          }
        }
      } catch (err) {
        router.replace('/login');
      }
    };
    checkRole();
  }, [router]);
  
  const [formData, setFormData] = useState({
    name: '',
    category: 'BERAS',
    quantity_kg: '',
    price_per_kg: '',
  });
  
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');

  // Autocomplete & Price Advisor States
  const [allCommodities, setAllCommodities] = useState<string[]>([]);
  const [filteredCommodities, setFilteredCommodities] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [refPrice, setRefPrice] = useState<number | null>(null);

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

  const reverseGeocode = async (latitude: number, longitude: number, prefix: string = 'Lokasi terisi: ') => {
    const fallbackProv = getClosestProvince(latitude, longitude);
    setLocationStatus(`${prefix}${fallbackProv}`);

    const result = await fetchAddress(latitude, longitude);
    if (result) {
      setLocationStatus(`${prefix}${result.full || result.short}`);
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch commodities list
  useEffect(() => {
    const fetchCommodities = async () => {
      try {
        const res = await referencePricesApi.getReferencePrices(1, 1);
        if (res.distinct_commodities) {
          setAllCommodities(res.distinct_commodities);
        }
      } catch (err) {
        console.error('Failed to load commodities in sell page:', err);
      }
    };
    fetchCommodities();
  }, []);

  const fetchReferencePrice = async (commodity: string, latitude: number | null, longitude: number | null) => {
    try {
      const region = latitude && longitude ? getClosestProvince(latitude, longitude) : 'Nasional';
      
      // Concurrently query both region and national prices to load twice as fast
      const [regionRes, nationalRes] = await Promise.all([
        referencePricesApi.getReferencePrices(1, 1, commodity, region),
        region !== 'Nasional' ? referencePricesApi.getReferencePrices(1, 1, commodity, 'Nasional') : null
      ]);
      
      if (regionRes.items && regionRes.items.length > 0) {
        setRefPrice(regionRes.items[0].price_per_kg);
      } else if (nationalRes && nationalRes.items && nationalRes.items.length > 0) {
        setRefPrice(nationalRes.items[0].price_per_kg);
      } else {
        setRefPrice(null);
      }
    } catch (err) {
      console.error('Failed to fetch ref price:', err);
      setRefPrice(null);
    }
  };

  // Reactively fetch reference price when commodity name or coordinates change
  useEffect(() => {
    if (formData.name) {
      const matched = allCommodities.find(c => c.toLowerCase() === formData.name.trim().toLowerCase());
      if (matched) {
        fetchReferencePrice(matched, lat, lng);
        return;
      }
    }
    setRefPrice(null);
  }, [lat, lng, formData.name, allCommodities]);

  const handleGetLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationStatus('Browser tidak mendukung geolokasi');
      return;
    }
    setLocating(true);
    setLocationStatus('Mencari lokasi...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        setLocating(false);
        reverseGeocode(position.coords.latitude, position.coords.longitude, 'Lokasi terisi: ');
      },
      (error) => {
        setLocating(false);
        setLocationStatus(`Gagal: ${error.message}`);
      },
      { timeout: 8000 }
    );
  };

  const handleNameChange = (val: string) => {
    setFormData(prev => ({ 
      ...prev, 
      name: val,
      category: getCategoryForCommodity(val)
    }));
    
    if (val.trim() === '') {
      setFilteredCommodities(allCommodities);
      setShowDropdown(true);
    } else {
      const filtered = allCommodities.filter((item) =>
        item.toLowerCase().includes(val.toLowerCase())
      );
      setFilteredCommodities(filtered);
      setShowDropdown(true);
    }
  };

  const selectCommodity = (commodity: string) => {
    setFormData(prev => ({ 
      ...prev, 
      name: commodity,
      category: getCategoryForCommodity(commodity)
    }));
    setShowDropdown(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'name') {
      handleNameChange(value);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setPhoto(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo) {
      setError('Foto produk wajib diunggah');
      return;
    }

    // Validate commodity name against PIHPS database
    const isCommodityValid = allCommodities.some(
      (c) => c.toLowerCase() === formData.name.trim().toLowerCase()
    );
    if (!isCommodityValid) {
      setError('Komoditas harus dipilih dari daftar acuan PIHPS yang tersedia.');
      return;
    }

    setLoading(true);
    setError('');

    const data = new FormData();
    data.append('name', formData.name);
    data.append('category', formData.category);
    data.append('quantity_kg', formData.quantity_kg);
    data.append('price_per_kg', formData.price_per_kg);
    data.append('photo', photo);
    if (lat !== null) {
      data.append('lat', lat.toString());
    }
    if (lng !== null) {
      data.append('lng', lng.toString());
    }

    try {
      await productsApi.createProduct(data);
      router.push('/beranda');
    } catch (err: any) {
      setError(err.message || 'Gagal memposting produk');
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

  return (
    <div className="relative min-h-screen bg-gr-paper py-12 px-4 sm:px-6 lg:px-8">
      <BgPattern />
      <FilmGrain />
      
      <div className="relative z-10 mx-auto max-w-4xl">
        <header className="mb-12 text-center select-none">
          <h1 className="font-display text-5xl font-medium tracking-tight text-gr-ink">
            Post Hasil Panen
          </h1>
          <p className="mt-4 font-sans text-gr-ink-soft italic">
            "Kejujuran adalah benih dari kepercayaan pelanggan."
          </p>
        </header>

        <form onSubmit={handleSubmit} autoComplete="off" className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          {/* Polaroid Photo Preview Section */}
          <div className="flex flex-col items-center justify-start space-y-6">
            <div 
              className={cn(
                "relative bg-white/60 dark:bg-white/10 backdrop-blur-sm p-4 pb-16 border border-gr-line rounded-sm  transition-transform duration-300 hover:rotate-1",
                !previewUrl && "flex aspect-[4/5] w-full max-w-sm items-center justify-center border border-dashed border-gr-line bg-transparent"
              )}
            >
              {previewUrl ? (
                <>
                  <div className="relative aspect-square w-full overflow-hidden bg-black/5 border border-gr-line rounded-sm">
                    <img 
                      src={previewUrl} 
                      alt="Preview" 
                      className="h-full w-full object-cover grayscale-[0.2] contrast-[1.1]"
                    />
                  </div>
                  <button 
                    type="button"
                    onClick={removePhoto}
                    className="absolute -right-2 -top-2 rounded-sm bg-gr-down p-1.5 text-gr-chalk  hover:bg-gr-down/90 border border-gr-down"
                  >
                    <X size={16} />
                  </button>
                  <div className="absolute bottom-4 left-0 w-full text-center">
                    <span className="font-mono text-xs uppercase tracking-widest text-gr-ink-soft font-bold opacity-40">
                      GROVE SHOT #001
                    </span>
                  </div>
                </>
              ) : (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="group flex cursor-pointer flex-col items-center space-y-4 text-gr-ink-soft/60 transition-colors hover:text-gr-board"
                >
                  <div className="rounded-sm border border-gr-line p-6 bg-white/20 backdrop-blur-sm transition-transform group-hover:scale-105 ">
                    <Camera size={44} className="text-gr-ink-soft" />
                  </div>
                  <span className="font-mono text-xs uppercase tracking-widest font-bold">
                    Klik untuk Ambil Foto
                  </span>
                </div>
              )}
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange}
            />
          </div>

          {/* Form Content */}
          <div className="space-y-6 rounded-sm bg-white/60 dark:bg-white/10 p-8 border border-gr-line  backdrop-blur-sm text-gr-ink">
            {error && (
              <div className="rounded-sm bg-gr-down/10 p-4 text-sm text-gr-down border border-gr-down/20 font-sans">
                {error}
              </div>
            )}

            <div className="space-y-5">
              
              {/* Nama Komoditas */}
              <div className="relative" ref={dropdownRef}>
                <label className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold">
                  Nama Komoditas
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="Contoh: Cabai Rawit Merah"
                  className="mt-2 block w-full bg-white/40 border border-gr-line hover:border-gr-ink-soft/40 px-3 py-2 text-sm text-gr-ink focus:outline-none focus:border-gr-board/50 rounded-sm transition-all"
                  value={formData.name}
                  onChange={handleInputChange}
                  onFocus={() => {
                    const filtered = allCommodities.filter(item => 
                      item.toLowerCase().includes(formData.name.toLowerCase())
                    );
                    setFilteredCommodities(filtered.length > 0 ? filtered : allCommodities);
                    setShowDropdown(true);
                  }}
                />
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

              <div className="grid grid-cols-2 gap-6">
                {/* Harga Referensi */}
                <div>
                  <label className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold">
                    Harga Referensi (PIHPS)
                  </label>
                  <div className="mt-2 block w-full bg-white/20 border border-gr-line px-3 py-2 text-sm text-gr-board font-mono font-bold rounded-sm h flex items-center">
                    {refPrice !== null ? `Rp ${refPrice.toLocaleString('id-ID')}/kg` : '-'}
                  </div>
                </div>
                
                {/* Jumlah */}
                <div>
                  <label className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold">
                    Jumlah (KG)
                  </label>
                  <input
                    name="quantity_kg"
                    type="number"
                    step="0.1"
                    required
                    autoComplete="off"
                    placeholder="0.0"
                    className="mt-2 block w-full bg-white/40 border border-gr-line hover:border-gr-ink-soft/40 px-3 py-2 text-sm text-gr-ink font-mono focus:outline-none focus:border-gr-board/50 rounded-sm transition-all"
                    value={formData.quantity_kg}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              {/* Harga per KG */}
              <div>
                <label className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold">
                  Harga per KG (IDR)
                </label>
                <div className="relative mt-2">
                  <span className="absolute left-3 top-2.5 font-mono text-sm text-gr-ink-soft/50 font-bold">Rp</span>
                  <CurrencyInput
                    name="price_per_kg"
                    required
                    placeholder="0"
                    className="block w-full bg-white/40 border border-gr-line hover:border-gr-ink-soft/40 pl-9 pr-3 py-2 text-sm text-gr-ink font-mono font-bold focus:outline-none focus:border-gr-board/50 rounded-sm transition-all"
                    value={formData.price_per_kg}
                    onValueChange={(val) => setFormData(prev => ({ ...prev, price_per_kg: val }))}
                  />
                </div>
              </div>

              {/* Asisten Harga Adil (Price Fair Assistant) Box */}
              {refPrice !== null && formData.price_per_kg && (
                <div className="mt-2 font-sans text-xs">
                  {parseFloat(formData.price_per_kg) < 0.75 * refPrice && (
                    <div className="rounded-sm bg-gr-down/10 p-4 text-gr-down border border-gr-down/20 flex gap-2 items-start ">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <span className="font-mono uppercase tracking-wider text-[10px] font-bold block">Peringatan: Harga Terlalu Murah</span>
                        <p className="mt-1 leading-relaxed text-xs">
                          Harga pasar rata-rata saat ini adalah <strong>Rp {refPrice.toLocaleString('id-ID')}/kg</strong>. Anda menjual jauh di bawah pasar seharga <strong>Rp {parseFloat(formData.price_per_kg).toLocaleString('id-ID')}/kg</strong>. Anda bisa meningkatkan harga hingga <strong>Rp {Math.round(0.85 * refPrice).toLocaleString('id-ID')}/kg</strong> dan tetap kompetitif tanpa merugikan hasil kerja keras Anda.
                        </p>
                      </div>
                    </div>
                  )}
                  {parseFloat(formData.price_per_kg) > 1.20 * refPrice && (
                    <div className="rounded-sm bg-gr-board/10 p-4 text-gr-board border border-gr-board/20 flex gap-2 items-start ">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5 animate-pulse" />
                      <div>
                        <span className="font-mono uppercase tracking-wider text-[10px] font-bold block">Peringatan: Harga Cukup Tinggi</span>
                        <p className="mt-1 leading-relaxed text-xs">
                          Harga Anda (<strong>Rp {parseFloat(formData.price_per_kg).toLocaleString('id-ID')}/kg</strong>) berada di atas harga pasar rata-rata (<strong>Rp {refPrice.toLocaleString('id-ID')}/kg</strong>). Produk Anda mungkin membutuhkan waktu lebih lama untuk laku oleh pembeli.
                        </p>
                      </div>
                    </div>
                  )}
                  {parseFloat(formData.price_per_kg) >= 0.75 * refPrice && parseFloat(formData.price_per_kg) <= 1.20 * refPrice && (
                    <div className="rounded-sm bg-gr-up/10 p-4 text-gr-up border border-gr-up/20 flex gap-2 items-start ">
                      <CheckCircle size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <span className="font-mono uppercase tracking-wider text-[10px] font-bold block">Harga Adil & Kompetitif</span>
                        <p className="mt-1 leading-relaxed text-xs">
                          Harga Anda kompetitif dengan rata-rata harga acuan harga pasar wilayah saat ini (<strong>Rp {refPrice.toLocaleString('id-ID')}/kg</strong>).
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Lokasi Produk */}
              <div className="pt-2">
                <label className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold">
                  Lokasi Produk
                </label>
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleGetLocation}
                      disabled={locating}
                      className="px-4 py-2 border border-gr-line hover:border-gr-ink text-xs font-mono uppercase tracking-wider bg-white/40 hover:bg-white/60 text-gr-ink rounded-sm transition-all duration-200  cursor-pointer"
                    >
                      {locating ? 'Mencari...' : 'Gunakan Lokasi Saat Ini'}
                    </button>
                    {locationStatus && (
                      <span className="font-mono text-[10px] text-gr-board font-semibold">
                        {locationStatus}
                      </span>
                    )}
                  </div>
                  <span className="font-sans text-[10px] text-gr-ink-soft italic">
                    Kalau tidak diisi, produk akan pakai lokasi profil kamu.
                  </span>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gr-board text-gr-chalk border border-gr-board hover:bg-gr-board/90 font-mono text-xs font-bold uppercase tracking-widest py-4 rounded-sm transition-all  cursor-pointer"
            >
              {loading ? 'Mengunggah...' : 'Publish Hasil Panen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
