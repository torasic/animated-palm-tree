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
import { cn } from '@/lib/utils';
import { ArrowLeft, Loader2, AlertTriangle, CheckCircle, Save } from 'lucide-react';
import Link from 'next/link';

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

export default function EditProductPage({ params }: { params: React.Usable<{ id: string }> }) {
  const resolvedParams = React.use(params);
  const { id } = resolvedParams;
  const router = useRouter();

  const [loadingProduct, setLoadingProduct] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [product, setProduct] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    category: 'BERAS',
    quantity_kg: '',
    price_per_kg: '',
    status: 'TERSEDIA'
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Autocomplete & Price Advisor States
  const [allCommodities, setAllCommodities] = useState<string[]>([]);
  const [filteredCommodities, setFilteredCommodities] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [refPrice, setRefPrice] = useState<number | null>(null);

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

  // Fetch commodities list and product details
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Load PIHPS commodities
        const commoditiesRes = await referencePricesApi.getReferencePrices(1, 1);
        if (commoditiesRes.distinct_commodities) {
          setAllCommodities(commoditiesRes.distinct_commodities);
        }

        // Load current product & current user info
        const [prodData, userData] = await Promise.all([
          productsApi.getProductById(id),
          authApi.getMe()
        ]);

        // Authorization check: Must be seller and roles check
        if (userData.role !== 'PETANI' || userData.id !== prodData.seller_id) {
          router.replace('/beranda');
          return;
        }

        setProduct(prodData);
        setFormData({
          name: prodData.name,
          category: prodData.category,
          quantity_kg: prodData.quantity_kg.toString(),
          price_per_kg: prodData.price_per_kg.toString(),
          status: prodData.status
        });
        
        // Populate reference price
        if (prodData.reference_price_per_kg) {
          setRefPrice(prodData.reference_price_per_kg);
        }

        setCheckingAuth(false);
        setLoadingProduct(false);
      } catch (err) {
        console.error('Failed to load data for edit page:', err);
        router.replace('/beranda');
      }
    };
    fetchData();
  }, [id, router]);

  const fetchReferencePrice = async (commodity: string, region: string) => {
    try {
      const regionSearch = region || 'Nasional';
      const [regionRes, nationalRes] = await Promise.all([
        referencePricesApi.getReferencePrices(1, 1, commodity, regionSearch),
        regionSearch !== 'Nasional' ? referencePricesApi.getReferencePrices(1, 1, commodity, 'Nasional') : null
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

  // Reactively fetch reference price when commodity name changes
  useEffect(() => {
    if (formData.name && product) {
      const matched = allCommodities.find(c => c.toLowerCase() === formData.name.trim().toLowerCase());
      if (matched) {
        fetchReferencePrice(matched, product.region);
        return;
      }
    }
    setRefPrice(null);
  }, [formData.name, allCommodities, product]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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

    try {
      await productsApi.updateProduct(id, {
        name: formData.name,
        category: formData.category,
        quantity_kg: parseFloat(formData.quantity_kg),
        price_per_kg: parseFloat(formData.price_per_kg),
        status: formData.status
      });
      router.push(`/produk/${id}`);
    } catch (err: any) {
      setError(err.message || 'Gagal memperbarui produk');
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth || loadingProduct) {
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
        <div className="mb-6">
          <Link 
            href={`/produk/${id}`}
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-gr-ink-soft hover:text-gr-board transition-colors"
          >
            ← Kembali ke Detail Produk
          </Link>
        </div>

        <header className="mb-12 text-center select-none">
          <h1 className="font-display text-5xl font-medium tracking-tight text-gr-ink">
            Edit Hasil Panen
          </h1>
          <p className="mt-4 font-sans text-gr-ink-soft italic">
            Perbarui data produk penawaran Anda di pasar Grove.
          </p>
        </header>

        <form onSubmit={handleSubmit} autoComplete="off" className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          {/* Polaroid Image View Section (ReadOnly) */}
          <div className="flex flex-col items-center justify-start space-y-6">
            <div className="bg-[#FAF9F5] p-4 pb-14  rotate-1 hover:rotate-0 transition-all duration-500 w-full max-w-[320px] flex flex-col justify-start border border-gr-line/14 rounded-sm">
              <div className="aspect-square w-full overflow-hidden bg-black/5 rounded-xs border border-gr-line/5">
                <img 
                  src={product.photo_url || '/placeholder-crop.jpg'} 
                  alt={product.name} 
                  className="h-full w-full object-cover grayscale-[0.1] contrast-[1.05]"
                />
              </div>
              <div className="mt-4 pt-3 border-t border-dashed border-gr-line/20 font-mono text-[9px] text-gr-ink-soft space-y-1 text-center w-full">
                <span className="font-mono text-[10px] uppercase tracking-widest text-gr-ink-soft/40 font-bold">
                  FOTO PRODUK TERUNGGAH
                </span>
                <p className="text text-gr-ink-soft/30 italic">Foto produk tidak dapat diubah setelah diposting.</p>
              </div>
            </div>
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

              {/* Status & Kategori Grid */}
              <div className="grid grid-cols-2 gap-6">
                {/* Status Penjualan */}
                <div>
                  <label className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold">
                    Status Penjualan
                  </label>
                  <select
                    name="status"
                    className="mt-2 block w-full bg-white/40 border border-gr-line hover:border-gr-ink-soft/40 px-3 py-2 text-sm text-gr-ink focus:outline-none focus:border-gr-board/50 rounded-sm transition-all"
                    value={formData.status}
                    onChange={handleInputChange}
                  >
                    <option value="TERSEDIA">TERSEDIA</option>
                    <option value="TERJUAL">TERJUAL</option>
                    <option value="DITUTUP">DITUTUP</option>
                  </select>
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

              {/* Harga Referensi & Harga per KG Grid */}
              <div className="grid grid-cols-2 gap-6">
                {/* Harga Referensi */}
                <div>
                  <label className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold">
                    Harga Referensi
                  </label>
                  <div className="mt-2 block w-full bg-white/20 border border-gr-line px-3 py-2 text-sm text-gr-board font-mono font-bold rounded-sm h flex items-center">
                    {refPrice !== null ? `Rp ${refPrice.toLocaleString('id-ID')}/kg` : '-'}
                  </div>
                </div>

                {/* Harga per KG */}
                <div>
                  <label className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold">
                    Harga per KG
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
              </div>

              {/* Price Fair Assistant Box */}
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
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
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
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gr-board text-gr-chalk border border-gr-board hover:bg-gr-board/90 font-mono text-xs font-bold uppercase tracking-widest py-4 rounded-sm transition-all  flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Simpan Perubahan
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
