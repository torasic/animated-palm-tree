'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { productsApi } from '@/lib/api/products';
import { authApi } from '@/lib/api/auth';
import { searchApi as semanticSearchApi } from '@/lib/api/search';
import { ProductCard } from '@/components/products/product-card';
import { BgPattern } from '@/components/effects/bg-pattern';
import { FilmGrain } from '@/components/effects/film-grain';
import { Glow } from '@/components/effects/glow';
import { SearchBar } from '@/components/search/search-bar';
import { Loader2, ChevronLeft, ChevronRight, MapPin, User } from 'lucide-react';
import { PersonalGreeting } from '@/components/personal-greeting';
import { SellerRatingBadge } from '@/components/ratings/seller-rating-badge';
import { provinceCentroids } from '@/lib/data/province-centroids';
import Link from 'next/link';
import Image from 'next/image';

function BerandaContent() {
  const [products, setProducts] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [pageProducts, setPageProducts] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [locationError, setLocationError] = useState<string | null>(null); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [user, setUser] = useState<any | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars

  // Search details states
  const [searchQuery, setSearchQuery] = useState('');
  const [matchingFarmers, setMatchingFarmers] = useState<any[]>([]);

  // Pagination states
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const LIMIT = 12;

  const totalPages = Math.ceil(totalCount / LIMIT);
  const hasMore = page < totalPages;
  const hasPrev = page > 1;

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

  const getPageNumbers = () => {
    const pages = [];
    const maxDisplayed = 5;
    
    let startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, startPage + maxDisplayed - 1);
    
    if (endPage - startPage < maxDisplayed - 1) {
      startPage = Math.max(1, endPage - maxDisplayed + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  const requestLocation = () => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
          setLocationError(null);
        },
        (error) => {
          console.warn("Geolocation warning:", error.message);
          if (error.code === error.PERMISSION_DENIED) {
            setLocationError("Aktifkan izin lokasi untuk melihat produk terdekat dari kamu.");
          } else {
            setLocationError("Gagal mengambil lokasi. Pastikan GPS/lokasi browser aktif.");
          }
        },
        { timeout: 5000 }
      );
    } else {
      setLocationError("Browser Anda tidak mendukung layanan lokasi geolokasi.");
    }
  };

  const fetchProducts = useCallback(async (pageNum: number) => {
    // Defer state update to next microtask to prevent react-hooks/set-state-in-effect warning
    await Promise.resolve();
    setIsLoading(true);
    try {
      const skip = (pageNum - 1) * LIMIT;
      // Fetch products and total count concurrently
      const [productsData, countData] = await Promise.all([
        productsApi.getProducts(skip, LIMIT),
        productsApi.getProductsCount()
      ]);
      setPageProducts(productsData);
      setProducts(productsData);
      setTotalCount(countData.count || 0);
      setPage(pageNum);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setIsLoading(false);
    }
  }, [LIMIT]);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await authApi.getMe();
        setUser(data);
      } catch (err) { // eslint-disable-line @typescript-eslint/no-unused-vars
        setUser(null);
      }
    };
    fetchUser();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProducts(1);
    requestLocation();
  }, [fetchProducts]);

  const handleSearchResults = useCallback(async (results: any[], query: string) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    setIsSearchActive(true);
    setSearchQuery(query);
    try {
      const farmersData = await authApi.getFarmers(query);
      setMatchingFarmers(farmersData);

      if (farmersData.length > 0) {
        // If the query matches a farmer profile, fetch products from those farmers
        const productsPromises = farmersData.slice(0, 3).map((f: any) => 
          productsApi.getProducts(0, 100, f.id).catch(() => [])
        );
        const productsResults = await Promise.all(productsPromises);
        setProducts(productsResults.flat());
      } else {
        // Otherwise, show semantic search results of products
        setProducts(results);
      }
    } catch (error) {
      console.error('Failed to fetch matching farmers:', error);
      setMatchingFarmers([]);
      setProducts(results);
    }
  }, []);

  const handleSearchFarmers = useCallback(async (query: string) => {
    setIsSearchActive(true);
    setSearchQuery(query);
    setIsSearching(true);
    try {
      const farmersData = await authApi.getFarmers(query);
      setMatchingFarmers(farmersData);

      let productsData: any[] = [];
      if (farmersData.length > 0) {
        const productsPromises = farmersData.slice(0, 3).map((f: any) => 
          productsApi.getProducts(0, 100, f.id).catch(() => [])
        );
        const productsResults = await Promise.all(productsPromises);
        productsData = productsResults.flat();
      } else {
        productsData = await semanticSearchApi.semanticSearch(query).catch(() => []);
      }
      setProducts(productsData);
    } catch (error) {
      console.error('Failed to search farmers/products:', error);
      setMatchingFarmers([]);
      setProducts([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleClearSearch = useCallback(() => {
    setIsSearchActive(false);
    setSearchQuery('');
    setMatchingFarmers([]);
    setProducts(pageProducts);
  }, [pageProducts]);

  return (
    <main className="relative flex-1 bg-gr-paper py-10 overflow-hidden">
      <BgPattern />
      <FilmGrain />
      <Glow color="var(--gr-board)" position="top" className="opacity-5 scale-110 pointer-events-none" />
      
      <div className="relative z-10 w-full font-sans">
        <header className="mb-8 text-center lg:text-left">
          <PersonalGreeting />
          
          <div className="mt-4 flex flex-col gap-2 w-full max-w-md">
            <SearchBar 
              onResults={handleSearchResults} 
              onLoading={setIsSearching} 
              onClear={handleClearSearch} 
              onSearchFarmers={handleSearchFarmers}
            />
            <div className="flex justify-start px-2">
              <Link 
                href="/pusat-niaga" 
                className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-gr-board hover:underline transition-all cursor-pointer"
              >
                Lihat Peta Acuan Harga
              </Link>
            </div>
          </div>

          <div className="mt-12 h-px w-full bg-gradient-to-r from-gr-board/30 via-gr-line to-transparent" />
        </header>

        {(isLoading || isSearching) ? (
          <div className="flex flex-col items-center justify-center py-32">
            <Loader2 className="h-12 w-12 text-gr-green animate-spin opacity-50" />
            <span className="mt-4 font-mono text-xs uppercase tracking-widest text-gr-text-primary/30">
              {isSearching ? 'Mencari hasil terdekat...' : 'Memuat produk...'}
            </span>
          </div>
        ) : (products.length > 0 || matchingFarmers.length > 0) ? (
          <>
            {/* Store search results banner/matching farmers display */}
            {isSearchActive && matchingFarmers.length > 0 && (
              <div className="mb-8 bg-[#FAF9F5] border border-gr-line p-5 rounded-sm  animate-in fade-in duration-200">
                <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft mb-4 font-bold border-b border-gr-line/40 pb-2">
                  <span>Petani/Peternak berkaitan dengan "{searchQuery}"</span>
                </div>
                <div className="space-y-3.5">
                  {matchingFarmers.slice(0, 3).map((farmer) => (
                    <Link 
                      href={`/petani/${farmer.id}`}
                      key={farmer.id} 
                      className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-4 sm:p-5 bg-white/80 border border-gr-line rounded-sm hover:border-gr-ink-soft/40 transition-all duration-200 group"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1 min-w-0">
                        {/* Avatar & Name Info */}
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div 
                            className="relative h-12 w-12 rounded-sm bg-white p-0.5 border border-gr-line shrink-0"
                            style={{ borderColor: farmer.theme_color || '#1b4332' }}
                          >
                            <div className="h-full w-full rounded-sm bg-gr-paper/40 overflow-hidden flex items-center justify-center text-gr-text-primary font-display text-sm font-bold uppercase">
                              {farmer.avatar_url ? (
                                <Image 
                                  src={farmer.avatar_url} 
                                  alt={farmer.full_name} 
                                  width={48} 
                                  height={48} 
                                  className="h-full w-full object-cover rounded-sm" 
                                />
                              ) : (
                                <span className="font-display font-bold text-gr-ink opacity-40">
                                  {farmer.full_name.charAt(0)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Name & Region */}
                          <div>
                            <h3 className="font-display text-sm font-bold text-gr-text-primary group-hover:text-gr-board transition-colors">
                              {farmer.full_name}
                            </h3>
                            <span className="flex items-center gap-0.5 font-sans font-semibold text-gr-text-primary/60 text-[10px] mt-0.5">
                              <MapPin size={10} style={{ color: farmer.theme_color || '#1b4332' }} /> 
                              {farmer.latitude && farmer.longitude ? getClosestProvince(farmer.latitude, farmer.longitude) : 'Nasional'}
                            </span>
                          </div>
                        </div>

                        {/* Detailed Merchant Stats */}
                        <div className="flex items-center gap-5 sm:gap-6 flex-wrap font-mono text-[9px] uppercase text-gr-ink-soft sm:ml-4 border-t sm:border-t-0 border-gr-line/30 pt-2 sm:pt-0">
                          <div className="h-6 w-px bg-gr-line/70 hidden md:block" />
                          <div>
                            <span className="block font-bold text-gr-ink font-sans text-xs">
                              ★ {farmer.seller_rating_avg ? farmer.seller_rating_avg.toFixed(1) : '0.0'}
                            </span>
                            <span className="block text opacity-65 mt-0.5">Penilaian</span>
                          </div>
                          <div className="h-6 w-px bg-gr-line/70 hidden sm:block" />
                          <div>
                            <span className="block font-bold text-gr-ink font-sans text-xs">
                              {farmer.seller_rating_count || 0}
                            </span>
                            <span className="block text opacity-65 mt-0.5">Ulasan</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="shrink-0 self-end sm:self-center">
                        <div
                          className="inline-flex items-center gap-1.5 text-white font-mono text-[10px] uppercase tracking-widest py-2 px-4 rounded-sm transition-all group-hover:opacity-90 "
                          style={{ backgroundColor: farmer.theme_color || '#1b4332' }}
                        >
                          Kunjungi Profil
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Products listings */}
            {products.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
                {products.map((product: any, index: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                  <ProductCard key={product.id} product={product} index={index} />
                ))}
              </div>
            ) : isSearchActive && (
              <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-gr-line/40 rounded-sm bg-white/20">
                <p className="font-sans text-sm text-gr-text-primary/45 italic">
                  Tidak ada produk hasil panen yang cocok dengan pencarian Anda dari petani ini.
                </p>
              </div>
            )}

            {!isSearchActive && totalPages > 1 && (
              <div className="mt-12 flex flex-wrap justify-center items-center gap-4">
                <button
                  onClick={() => page > 1 && fetchProducts(page - 1)}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-4 py-2 rounded-sm border border-gr-line bg-white/40 hover:bg-white/85 text-gr-ink font-mono text-xs uppercase tracking-wider transition-all duration-300 hover:border-gr-ink hover:translate-x disabled:translate-x-0 disabled:opacity-30 disabled:pointer-events-none disabled:border-gr-line/40 disabled:bg-white/15 cursor-pointer  animate-fade-in"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Sebelumnya
                </button>
                
                {/* Page Numbers */}
                <div className="flex items-center gap-1.5">
                  {getPageNumbers().map((p) => (
                    <button
                      key={p}
                      onClick={() => p !== page && fetchProducts(p)}
                      className={`flex items-center justify-center min-w-8 h-8 rounded-sm border text-xs font-mono font-bold tracking-wider transition-all duration-300 cursor-pointer  ${
                        p === page
                          ? 'border-gr-board bg-gr-board text-gr-chalk'
                          : 'border-gr-line/60 bg-white/20 text-gr-ink hover:bg-white/60 hover:border-gr-ink'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                
                <button
                  onClick={() => hasMore && fetchProducts(page + 1)}
                  disabled={!hasMore}
                  className="flex items-center gap-1 px-4 py-2 rounded-sm border border-gr-line bg-white/40 hover:bg-white/85 text-gr-ink font-mono text-xs uppercase tracking-wider transition-all duration-300 hover:border-gr-ink hover:translate-x disabled:translate-x-0 disabled:opacity-30 disabled:pointer-events-none disabled:border-gr-line/40 disabled:bg-white/15 cursor-pointer  animate-fade-in"
                >
                  Berikutnya
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-white/10 rounded-sm bg-white/2">
            <span className="font-display text-3xl text-gr-text-primary/20">
              Tidak ada hasil yang ditemukan
            </span>
            <p className="mt-4 font-sans text-sm text-gr-text-primary/40">
              Coba kata kunci lain atau telusuri produk populer.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

import { Suspense } from 'react';

export default function BerandaPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gr-bg">
        <Loader2 className="h-12 w-12 text-gr-green animate-spin opacity-50" />
      </div>
    }>
      <BerandaContent />
    </Suspense>
  );
}
