'use client';

import React, { useState, useEffect, use } from 'react';
import { authApi } from '@/lib/api/auth';
import { productsApi } from '@/lib/api/products';
import { ratingsApi } from '@/lib/api/ratings';
import Image from 'next/image';
import { BgPattern } from '@/components/effects/bg-pattern';
import { FilmGrain } from '@/components/effects/film-grain';
import { Glow } from '@/components/effects/glow';
import { SellerRatingBadge } from '@/components/ratings/seller-rating-badge';
import { ProductCard } from '@/components/products/product-card';
import { provinceCentroids } from '@/lib/data/province-centroids';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Loader2,
  MapPin,
  MessageSquare,
  Tag,
  Info,
  Star,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { conversationsApi } from '@/lib/api/conversations';

export default function FarmerProfilePage({ params }: { params: React.Usable<{ id: string }> }) {
  const resolvedParams = use(params);
  const { id } = resolvedParams;

  const [farmer, setFarmer] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [products, setProducts] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [ratings, setRatings] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [ratingsAvg, setRatingsAvg] = useState<number>(0);
  const [ratingsCount, setRatingsCount] = useState<number>(0);
  
  const [currentUser, setCurrentUser] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const [chatLoading, setChatLoading] = useState(false);

  // Editing States
  const [isEditing, setIsEditing] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const productsPerPage = 6;

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

  useEffect(() => {
    const fetchFarmerData = async () => {
      try {
        const [farmerData, productsData, ratingsData, meData] = await Promise.all([
          authApi.getUserById(id),
          productsApi.getProducts(0, 100, id),
          ratingsApi.getUserRatingsAsSeller(id).catch(() => null),
          authApi.getMe().catch(() => null)
        ]);

        if (farmerData.role !== 'PETANI') {
          throw new Error('Pengguna ini bukan merupakan petani/peternak mitra Grove.');
        }

        setFarmer(farmerData);
        setProducts(productsData);
        setCurrentPage(1);
        setCurrentUser(meData);
        setEditBio(farmerData.bio || '');

        if (ratingsData) {
          setRatings(ratingsData.ratings || []);
          setRatingsAvg(ratingsData.average || 0);
          setRatingsCount(ratingsData.count || 0);
        }
      } catch (err) {
        console.error('Failed to load farmer profile:', err);
        const errMsg = err instanceof Error ? err.message : 'Gagal memuat profil petani/peternak.';
        setError(errMsg);
      } finally {
        setLoading(false);
      }
    };

    fetchFarmerData();
  }, [id]);

  const handleSaveChanges = async () => {
    setSavingEdit(true);
    try {
      const updatedUser = await authApi.updateProfile({
        bio: editBio
      });
      setFarmer((prev: any) => ({
        ...prev,
        bio: updatedUser.bio
      }));
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update profile:', err);
      const errMsg = err instanceof Error ? err.message : 'Gagal memperbarui profil';
      alert(errMsg);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleContactFarmer = async () => {
    if (!currentUser) {
      router.push('/login');
      return;
    }

    setChatLoading(true);
    try {
      const res = await conversationsApi.createConversation(undefined, id);
      if (res && res.conversation_id) {
        router.push(`/chat/${res.conversation_id}`);
      } else {
        throw new Error('Gagal memulai percakapan');
      }
    } catch (err) {
      console.error('Failed to initiate chat:', err);
      const errMsg = err instanceof Error ? err.message : 'Gagal memulai chat dengan penjual';
      alert(errMsg);
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gr-bg">
        <BgPattern />
        <Loader2 className="h-12 w-12 text-gr-green animate-spin opacity-50" />
      </div>
    );
  }

  if (error || !farmer) {
    return (
      <main className="relative min-h-[calc(100vh-80px)] bg-gr-bg py-16 px-4 sm:px-6 lg:px-8 flex flex-col justify-center items-center">
        <BgPattern />
        <div className="relative z-10 max-w-md w-full bg-white/85 border border-gr-line p-8 rounded-sm text-center ">
          <h2 className="font-display text-2xl font-semibold text-gr-text-primary mb-3">Profil Tidak Ditemukan</h2>
          <p className="font-sans text-sm text-gr-text-primary/60 mb-6">{error || 'Data profil petani/peternak tidak dapat ditampilkan.'}</p>
          <Link
            href="/beranda"
            className="inline-flex items-center gap-2 bg-gr-board text-gr-chalk hover:opacity-90 font-mono text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-sm  transition-all"
          >
            <ArrowLeft size={12} /> Kembali ke Beranda
          </Link>
        </div>
      </main>
    );
  }

  const isOwner = currentUser && currentUser.id === farmer.id;
  const locationLabel = farmer.latitude && farmer.longitude
    ? getClosestProvince(farmer.latitude, farmer.longitude)
    : 'Nasional';

  const defaultBio = 'Petani/Peternak mitra terdaftar Grove yang berdedikasi menghasilkan produk pangan segar berkualitas premium secara berkelanjutan dari lahan lokal langsung ke meja makan Anda. Berkomitmen menjaga kelestarian alam dan transparansi harga pasar.';
  const farmerBio = farmer.bio || defaultBio;

  // Pagination calculation
  const indexOfLastProduct = currentPage * productsPerPage;
  const indexOfFirstProduct = indexOfLastProduct - productsPerPage;
  const currentProducts = products.slice(indexOfFirstProduct, indexOfLastProduct);
  const totalPages = Math.ceil(products.length / productsPerPage);

  const getPageNumbers = () => {
    const pages = [];
    const maxDisplayed = 5;
    
    let startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + maxDisplayed - 1);
    
    if (endPage - startPage < maxDisplayed - 1) {
      startPage = Math.max(1, endPage - maxDisplayed + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    // Smooth scroll to top of products list
    const el = document.getElementById('available-harvest');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <main className="relative min-h-screen bg-gr-bg pt-8 pb-24 px-4 sm:px-6 lg:px-8">
      <BgPattern />
      <FilmGrain />
      <Glow color="#2d6a4f" position="top" className="opacity-8 pointer-events-none scale-105" />

      <div className="relative z-10 mx-auto max-w-5xl">
        {/* Back Link & Customize mode toggle button */}
        <div className="mb-6 flex justify-between items-center">
          <Link
            href="/beranda"
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-gr-text-primary/45 hover:text-gr-text-primary transition-colors"
          >
            ← Kembali ke Beranda
          </Link>

          {isOwner && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="inline-flex items-center gap-1.5 border border-gr-line bg-white hover:bg-gr-paper text-gr-ink font-mono text-[10px] uppercase tracking-widest px-4 py-2 rounded-sm transition-all  hover:border-gr-ink-soft/40 cursor-pointer"
            >
              {isEditing ? 'Batal Edit' : 'Edit Profil'}
            </button>
          )}
        </div>

        {/* Clean, Theme-compliant Banner Header */}
        <div className="bg-[#FAF9F5] border border-gr-line p-6 rounded-sm  mb-8 flex flex-col sm:flex-row gap-5 items-center justify-between relative overflow-hidden transition-all duration-300">
          {/* Subtle themed side bar stripe */}
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-gr-board" />

          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Themed ring avatar */}
            <div className="relative group shrink-0">
              <div 
                className="relative h-14 w-14 rounded-sm bg-white p-0.5 border border-gr-line  transition-transform duration-300 group-hover:scale-102"
              >
                <div className="relative h-full w-full rounded-sm bg-gr-paper/50 overflow-hidden flex items-center justify-center text-gr-text-primary font-display text-lg font-bold uppercase">
                  {farmer.avatar_url ? (
                    <Image 
                      src={farmer.avatar_url} 
                      alt={farmer.full_name} 
                      width={56} 
                      height={56} 
                      className="h-full w-full object-cover rounded-sm" 
                    />
                  ) : (
                    <span className="font-display font-bold text-gr-ink opacity-40">
                      {farmer.full_name.charAt(0)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="min-w-0">
              <h1 className="font-display text-xl font-semibold tracking-tight text-gr-text-primary truncate max-w-[340px]" title={farmer.full_name}>
                {farmer.full_name}
              </h1>

              <div className="flex items-center gap-2.5 font-mono text-[9px] text-gr-text-primary/50 uppercase mt-0.5 flex-wrap">
                <span className="flex items-center gap-1 font-sans font-semibold text-gr-text-primary">
                  <MapPin size={10} className="text-gr-board" /> {locationLabel}
                </span>
                <span>•</span>
                <SellerRatingBadge avgRating={ratingsAvg} ratingCount={ratingsCount} size="sm" showCount={true} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {!isOwner && (
              <button
                onClick={handleContactFarmer}
                disabled={chatLoading}
                className="inline-flex items-center gap-1.5 bg-gr-board text-gr-chalk font-mono text-[10px] uppercase tracking-widest py-2.5 px-5 rounded-sm  hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {chatLoading ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Memproses...
                  </>
                ) : (
                  <>
                    <MessageSquare size={12} /> Chat Petani/Peternak
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 2-Column Dashboard Layout: 9/12 for Products, 3/12 for Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: Available Products (9/12 width) */}
          <section id="available-harvest" className="lg:col-span-9 space-y-6 scroll-mt-6">
            <div className="flex items-center justify-between border-b border-gr-line pb-3">
              <h2 className="font-display text-lg font-semibold text-gr-text-primary flex items-center gap-2">
                <Tag size={16} className="text-gr-board" /> Hasil Panen Tersedia
              </h2>
              <span className="font-mono text-[9px] uppercase tracking-widest text-gr-text-primary/45">
                {products.length} produk terdaftar
              </span>
            </div>

            {products.length === 0 ? (
              <div className="text-center py-16 bg-[#FAF9F5]/40 border border-dashed border-gr-line/50 rounded-sm">
                <Info className="h-8 w-8 text-gr-text-primary/20 mx-auto mb-2" />
                <p className="font-sans text-sm text-gr-text-primary/40 italic">
                  Belum ada produk hasil panen yang didaftarkan saat ini.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {currentProducts.map((product, idx) => (
                    <div key={product.id} className="h-full">
                      <ProductCard product={product} index={idx} />
                    </div>
                  ))}
                </div>

                {/* Clear & Highly Readable Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex flex-wrap justify-center items-center gap-3 pt-5 border-t border-gr-line/30 font-sans text-xs font-semibold text-gr-ink">
                    <button
                      onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="flex items-center gap-1 px-4 py-2 border border-gr-line bg-white/40 hover:bg-white/85 text-gr-ink font-mono text-[10px] uppercase tracking-widest rounded-sm transition-all duration-300 hover:border-gr-ink hover:translate-x disabled:translate-x-0 disabled:opacity-20 disabled:pointer-events-none disabled:border-gr-line/40 disabled:bg-white/15 cursor-pointer "
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Sebelumnya
                    </button>
                    
                    {/* Page Numbers */}
                    <div className="flex items-center gap-1.5">
                      {getPageNumbers().map((p) => (
                        <button
                          key={p}
                          onClick={() => p !== currentPage && handlePageChange(p)}
                          className={`flex items-center justify-center min-w-8 h-8 rounded-sm border text-[10px] font-mono font-bold tracking-wider transition-all duration-300 cursor-pointer  ${
                            p === currentPage
                              ? 'border-gr-board bg-gr-board text-gr-chalk'
                              : 'border-gr-line/60 bg-white/20 text-gr-ink hover:bg-white/65 hover:border-gr-ink'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    
                    <button
                      onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="flex items-center gap-1 px-4 py-2 border border-gr-line bg-white/40 hover:bg-white/85 text-gr-ink font-mono text-[10px] uppercase tracking-widest rounded-sm transition-all duration-300 hover:border-gr-ink hover:translate-x disabled:translate-x-0 disabled:opacity-20 disabled:pointer-events-none disabled:border-gr-line/40 disabled:bg-white/15 cursor-pointer "
                    >
                      Selanjutnya
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* RIGHT COLUMN: Sidebar (Bio, Reviews) (3/12 width) */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* 1. Farmer Bio Card - Theme Compliant */}
            <div className="bg-[#FAF9F5] border border-gr-line p-5 rounded-sm  space-y-4">
              <h3 className="font-display text-sm font-semibold text-gr-text-primary border-b border-gr-line/50 pb-2">
                Tentang Petani/Peternak
              </h3>

              {isEditing ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block font-mono text uppercase tracking-widest text-gr-text-primary/45 font-bold">
                      Deskripsi / Bio Petani/Peternak
                    </label>
                    <textarea
                      rows={5}
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      maxLength={1000}
                      placeholder={defaultBio}
                      className="w-full bg-white border border-gr-line focus:outline-none focus:ring-1 focus:ring-gr-board/20 p-2.5 font-sans text-xs text-gr-text-primary rounded-sm transition-all "
                    />
                    <span className="block text-right font-mono text text-gr-text-primary/30">
                      {editBio.length}/1000
                    </span>
                  </div>

                  <Button
                    onClick={handleSaveChanges}
                    disabled={savingEdit}
                    className="w-full bg-gr-board text-gr-chalk hover:opacity-90 font-mono text-[10px] uppercase tracking-widest py-2.5 rounded-sm  transition-all flex items-center justify-center gap-1 cursor-pointer font-bold"
                  >
                    {savingEdit ? <Loader2 size={10} className="animate-spin" /> : 'Simpan'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="font-sans text-xs text-gr-text-primary/70 leading-relaxed">
                    {farmerBio}
                  </p>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-2 text-center pt-2 border-t border-gr-line/45">
                    <div>
                      <span className="block font-mono text-base font-bold text-gr-text-primary">
                        {products.length}
                      </span>
                      <span className="font-mono text uppercase tracking-wider text-gr-text-primary/40 block mt-0.5 leading-none">
                        Produk
                      </span>
                    </div>
                    <div>
                      <span className="block font-mono text-base font-bold text-gr-text-primary">
                        {ratingsCount}
                      </span>
                      <span className="font-mono text uppercase tracking-wider text-gr-text-primary/40 block mt-0.5 leading-none">
                        Ulasan
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Commented Reviews List Card */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gr-line pb-2">
                <h3 className="font-display text-sm font-semibold text-gr-text-primary flex items-center gap-1.5">
                  <Star size={15} className="text-gr-board" /> Ulasan Pembeli
                </h3>
                <span className="font-mono text-[9px] uppercase tracking-widest text-gr-text-primary/40">
                  Avg: {ratingsAvg > 0 ? ratingsAvg.toFixed(1) : '-'}
                </span>
              </div>

              {ratings.length === 0 ? (
                <div className="p-6 text-center bg-[#FAF9F5]/40 border border-dashed border-gr-line/50 rounded-sm space-y-1">
                  <Star className="h-5 w-5 text-gr-text-primary/10 mx-auto" />
                  <p className="font-sans text-[11px] text-gr-text-primary/40 italic">
                    Belum ada ulasan dari pembeli.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5 max-h-[400px] overflow-y-auto pr-1.5 custom-scrollbar">
                  {ratings.map((review) => {
                    const ratingDate = new Date(review.created_at).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    });
                    return (
                      <div
                        key={review.id}
                        className="bg-white/80 border border-gr-line p-4 rounded-sm  space-y-2.5 hover:border-gr-ink-soft/30 transition-all duration-200 relative"
                      >
                        {/* Top: Name & Date */}
                        <div className="flex justify-between items-center gap-2">
                          <span className="font-sans text-xs font-bold text-gr-text-primary truncate">
                            {review.rater_name || 'Pembeli Anonim'}
                          </span>
                          <span className="font-mono text text-gr-text-primary/30 uppercase shrink-0">
                            {ratingDate}
                          </span>
                        </div>

                        {/* Stars */}
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              size={10}
                              style={{
                                fill: s <= review.score ? '#f59e0b' : 'transparent',
                                color: s <= review.score ? '#f59e0b' : '#d1d5db',
                              }}
                            />
                          ))}
                        </div>

                        {/* Comment */}
                        {review.comment ? (
                          <p className="font-sans text-[11px] text-gr-text-primary/75 leading-relaxed italic bg-[#FAF9F5]/40 border border-gr-line/45 p-2.5 rounded-sm">
                            &quot;{review.comment}&quot;
                          </p>
                        ) : (
                          <p className="font-sans text-[10px] text-gr-text-primary/30 italic">
                            Tidak menulis komentar.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

        </div>
      </div>
    </main>
  );
}
