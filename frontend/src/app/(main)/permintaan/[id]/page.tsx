'use client';

import React, { useState, useEffect, use } from 'react';
import { demandRequestsApi } from '@/lib/api/demand-requests';
import { authApi } from '@/lib/api/auth';
import { referencePricesApi } from '@/lib/api/reference-prices';
import { BASE_URL, WS_BASE_URL } from '@/lib/api/client';
import { BgPattern } from '@/components/effects/bg-pattern';
import { FilmGrain } from '@/components/effects/film-grain';
import { Glow } from '@/components/effects/glow';
import { ArrowLeft, Calendar, Loader2, ClipboardCheck, Users, MapPin, Tag, CheckCircle, CheckCircle2, Info, MessageSquare, Truck, Store, Clock } from 'lucide-react';
import { reverseGeocode as fetchAddress } from '@/lib/utils/geocode';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { conversationsApi } from '@/lib/api/conversations';
import { provinceCentroids } from '@/lib/data/province-centroids';
import { RatingBadge } from '@/components/ratings/rating-badge';
import { cn } from '@/lib/utils';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { formatWIBDateTime, formatWIBDate } from '@/lib/utils/date';

export default function DemandRequestDetailPage({ params }: { params: React.Usable<{ id: string }> }) {
  const resolvedParams = use(params);
  const { id } = resolvedParams;

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


  const router = useRouter();
  const [chatLoading, setChatLoading] = useState(false);

  const handleContactBuyer = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (!request || !request.buyer_id) return;
    setChatLoading(true);
    try {
      const res = await conversationsApi.createConversation(undefined, undefined, request.buyer_id);
      if (res && res.conversation_id) {
        router.push(`/chat/${res.conversation_id}`);
      } else {
        throw new Error('Gagal memulai percakapan');
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memulai chat dengan pembeli');
    } finally {
      setChatLoading(false);
    }
  };

  const handleContactSeller = async (tx?: any) => {
    if (!user) {
      router.push('/login');
      return;
    }
    const activeTx = tx || request?.match_transaction;
    if (!request || !activeTx || !activeTx.seller_id) return;
    setChatLoading(true);
    try {
      const res = await conversationsApi.createConversation(
        activeTx.product_id || undefined,
        activeTx.seller_id,
        undefined
      );
      if (res && res.conversation_id) {
        const url = activeTx.product_id 
          ? `/chat/${res.conversation_id}?product_id=${activeTx.product_id}`
          : `/chat/${res.conversation_id}`;
        router.push(url);
      } else {
        throw new Error('Gagal memulai percakapan');
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memulai chat dengan penjual');
    } finally {
      setChatLoading(false);
    }
  };

  const handleContactPetani = async (petaniId: string) => {
    if (!user) {
      router.push('/login');
      return;
    }
    setChatLoading(true);
    try {
      const res = await conversationsApi.createConversation(undefined, petaniId, undefined);
      if (res && res.conversation_id) {
        router.push(`/chat/${res.conversation_id}`);
      } else {
        throw new Error('Gagal memulai percakapan');
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memulai chat dengan petani/peternak');
    } finally {
      setChatLoading(false);
    }
  };

  const [user, setUser] = useState<any | null>(null);
  const [request, setRequest] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isRequestBuyer = user && user.role === 'PEMBELI' && request && request.buyer_id === user.id;
  const isMatchedSeller = user && user.role === 'PETANI' && request && request.match_transaction && request.match_transaction.seller_id === user.id;
  
  // Commitment Form State (for Farmers)
  const [commitQty, setCommitQty] = useState('');
  const [submittingCommit, setSubmittingCommit] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState(false);
  const [confirmCommitOpen, setConfirmCommitOpen] = useState(false);

  // Escrow & Matching states
  const [matching, setMatching] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [checkingOutTxId, setCheckingOutTxId] = useState<string | null>(null);
  const [confirmingTxId, setConfirmingTxId] = useState<string | null>(null);
  const [cancellingTxId, setCancellingTxId] = useState<string | null>(null);
  const [confirmCancelTx, setConfirmCancelTx] = useState<any | null>(null);
  const [confirmMatchOpen, setConfirmMatchOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  const [customMatchQty, setCustomMatchQty] = useState<number>(0);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  // User location & Reference price states
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [refPrice, setRefPrice] = useState<number | null>(null);
  const [refPriceRegion, setRefPriceRegion] = useState<string>('');
  const [addressName, setAddressName] = useState<string>('');

  const requestLocation = () => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLat(position.coords.latitude);
          setLng(position.coords.longitude);
        },
        (err) => {
          console.warn("Detail page geolocation error:", err.message);
        },
        { timeout: 8000 }
      );
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
      console.error('Failed to fetch ref price in detail page:', err);
      setRefPrice(null);
      setRefPriceRegion('');
    }
  };

  // Detect location on mount
  useEffect(() => {
    requestLocation();
  }, []);

  // Fetch reference price when commodity name or coordinates change
  useEffect(() => {
    if (request && request.commodity_name) {
      fetchReferencePrice(request.commodity_name, lat, lng);
    }
  }, [request?.commodity_name, lat, lng]);

  // 1. Fetch auth user & demand request details
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch current user details if logged in (non-blocking)
        authApi.getMe().then(setUser).catch(() => setUser(null));
        
        const data = await demandRequestsApi.getDemandRequestById(id);
        setRequest(data);
      } catch (err: any) {
        console.error('Failed to fetch request detail:', err);
        setError('Gagal memuat detail permintaan hasil panen.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  // Reverse geocode request coordinates when request detail is loaded
  useEffect(() => {
    if (request && request.latitude && request.longitude) {
      const fallbackProv = getClosestProvince(request.latitude, request.longitude);
      setAddressName(fallbackProv);

      fetchAddress(request.latitude, request.longitude).then((result) => {
        if (result) setAddressName(result.full || result.short);
      });
    }
  }, [request]);

  // Fetch candidates for matching
  useEffect(() => {
    if (
      id &&
      isRequestBuyer &&
      request &&
      request.status !== 'DIBATALKAN' &&
      request.status !== 'KEDALUWARSA' &&
      request.quantity_kg_committed < request.quantity_kg_needed
    ) {
      const fetchCandidates = async () => {
        try {
          setLoadingCandidates(true);
          const res = await demandRequestsApi.getDemandMatchingCandidates(id);
          setCandidates(res);
          setCurrentPage(1);
        } catch (err) {
          console.error("Failed to fetch matching candidates:", err);
        } finally {
          setLoadingCandidates(false);
        }
      };
      fetchCandidates();
    }
  }, [id, isRequestBuyer, request?.status, request?.quantity_kg_committed, request?.quantity_kg_needed]);

  // 2. Connect to WebSocket for real-time updates
  useEffect(() => {
    if (!id || loading || error) return;

    const wsUrl = `${WS_BASE_URL}/ws/demand-requests/${id}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.quantity_kg_committed !== undefined ||
          data.payment_status !== undefined ||
          data.escrow_status !== undefined ||
          data.status !== undefined
        ) {
          try {
            const freshData = await demandRequestsApi.getDemandRequestById(id);
            if (freshData) {
              setRequest(freshData);
              return;
            }
          } catch (fetchErr) {
            console.error("Failed to fetch fresh demand details on WS update:", fetchErr);
          }

          setRequest((prev: any) => {
            if (!prev) return null;
            return {
              ...prev,
              status: data.status !== undefined ? data.status : prev.status,
              quantity_kg_committed: data.quantity_kg_committed !== undefined ? data.quantity_kg_committed : prev.quantity_kg_committed,
              num_petani_committed: data.num_petani_committed !== undefined ? data.num_petani_committed : prev.num_petani_committed,
            };
          });
        }
      } catch (err) {
        console.error('Failed to parse websocket message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error(`WebSocket connection error to URL (${wsUrl}):`, err);
    };

    return () => {
      ws.close();
    };
  }, [id, loading, error]);

  const handleCommitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCommitSuccess(false);
    setError('');

    const qty = parseFloat(commitQty);
    if (isNaN(qty) || qty <= 0) {
      setError('Masukkan jumlah komitmen valid yang lebih besar dari 0');
      return;
    }

    const remainingKg = Math.max(0, request.quantity_kg_needed - request.quantity_kg_committed);
    if (qty > remainingKg) {
      setError(`Jumlah komitmen tidak boleh melebihi sisa kebutuhan (${remainingKg.toLocaleString('id-ID')} kg)`);
      return;
    }

    setConfirmCommitOpen(true);
  };

  const handleExecuteCommit = async () => {
    setConfirmCommitOpen(false);
    const qty = parseFloat(commitQty);
    if (isNaN(qty) || qty <= 0) return;

    setSubmittingCommit(true);
    try {
      await demandRequestsApi.commitSupply(id, qty);
      setCommitSuccess(true);
      setCommitQty('');
      router.push('/pesanan?tab=demands');
    } catch (err: any) {
      setError(err.message || 'Gagal mengirimkan komitmen supply');
    } finally {
      setSubmittingCommit(false);
    }
  };

  const handleMatch = async (productId: string, quantityKg?: number) => {
    try {
      setMatching(productId);
      setError('');
      await demandRequestsApi.matchDemandRequest(id, productId, quantityKg);
      const updatedData = await demandRequestsApi.getDemandRequestById(id);
      setRequest(updatedData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal mencocokkan permintaan dengan produk petani/peternak terpilih');
    } finally {
      setMatching(null);
    }
  };

  const handlePilihClick = (cand: any) => {
    setSelectedCandidate(cand);
    const maxQty = Math.min(cand.quantity_kg, Math.max(0, request.quantity_kg_needed - request.quantity_kg_committed));
    setCustomMatchQty(maxQty);
    setConfirmMatchOpen(true);
  };

  const handleConfirmMatch = async () => {
    if (!selectedCandidate) return;
    const productId = selectedCandidate.product_id;
    setConfirmMatchOpen(false);
    await handleMatch(productId, customMatchQty);
  };

  const handleCheckout = async (transactionId?: string) => {
    try {
      setCheckingOutTxId(transactionId || 'general');
      setError('');
      const successUrl = `${window.location.origin}/permintaan/${id}?status=success`;
      const failureUrl = `${window.location.origin}/permintaan/${id}?status=failed`;
      const res = await demandRequestsApi.checkoutDemand(id, successUrl, failureUrl, transactionId);
      if (res.invoice_url) {
        window.location.href = res.invoice_url;
      } else {
        setError('Gagal membuat tautan pembayaran');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal memulai checkout pembayaran');
    } finally {
      setCheckingOutTxId(null);
    }
  };

  const handleConfirmReceived = async (transactionId?: string) => {
    try {
      setConfirmingTxId(transactionId || 'general');
      setError('');

      // Optimistic state update so "Dana Dicairkan" appears instantly
      if (transactionId) {
        setRequest((prev: any) => {
          if (!prev) return prev;
          const updatedTxs = (prev.match_transactions || []).map((t: any) =>
            t.id === transactionId ? { ...t, escrow_status: 'released' } : t
          );
          return { ...prev, match_transactions: updatedTxs };
        });
      }

      await demandRequestsApi.confirmDemandReceived(id, transactionId);
      const updatedData = await demandRequestsApi.getDemandRequestById(id);
      if (updatedData) {
        setRequest(updatedData);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal mengonfirmasi penerimaan barang');
      // Rollback with fresh data if failed
      const freshData = await demandRequestsApi.getDemandRequestById(id).catch(() => null);
      if (freshData) setRequest(freshData);
    } finally {
      setConfirmingTxId(null);
    }
  };

  const [updatingFulfillmentTxId, setUpdatingFulfillmentTxId] = useState<string | null>(null);

  const handleUpdateFulfillment = async (txId: string, targetStatus: 'SIAP_DIANTAR' | 'SIAP_DIAMBIL') => {
    try {
      setUpdatingFulfillmentTxId(txId);
      setError('');
      await demandRequestsApi.updateFulfillmentStatus(id, targetStatus, txId);
      const updatedData = await demandRequestsApi.getDemandRequestById(id);
      if (updatedData) {
        setRequest(updatedData);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal memperbarui status kesiapan produk');
    } finally {
      setUpdatingFulfillmentTxId(null);
    }
  };

  const handleCancelTransaction = async () => {
    if (!confirmCancelTx) return;
    const txId = confirmCancelTx.id;
    const txQty = confirmCancelTx.quantity_kg;
    setConfirmCancelTx(null);
    setCancellingTxId(txId);
    setError('');
    try {
      // Optimistic UI update: remove transaction and reduce volume immediately
      setRequest((prev: any) => {
        if (!prev) return prev;
        const updatedTxs = (prev.match_transactions || []).filter((t: any) => t.id !== txId);
        const newCommitted = Math.max(0, (prev.quantity_kg_committed || 0) - txQty);
        return {
          ...prev,
          match_transactions: updatedTxs,
          quantity_kg_committed: newCommitted,
          status: newCommitted < prev.quantity_kg_needed ? 'TERBUKA' : prev.status,
        };
      });

      await demandRequestsApi.cancelDemandTransaction(id, txId);
      const freshData = await demandRequestsApi.getDemandRequestById(id);
      if (freshData) {
        setRequest(freshData);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal membatalkan transaksi');
      const freshData = await demandRequestsApi.getDemandRequestById(id).catch(() => null);
      if (freshData) setRequest(freshData);
    } finally {
      setCancellingTxId(null);
    }
  };

  const handleCancelRequest = async () => {
    setConfirmCancelOpen(false);
    setCancelling(true);
    setError('');
    try {
      await demandRequestsApi.cancelDemandRequest(id);
      const updatedData = await demandRequestsApi.getDemandRequestById(id);
      setRequest(updatedData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Gagal membatalkan permintaan');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gr-paper">
        <Loader2 className="h-10 w-10 text-gr-board animate-spin opacity-60" />
      </div>
    );
  }

  if (error && !request) {
    return (
      <main className="relative min-h-[calc(100vh-80px)] bg-gr-paper py-16 px-4 sm:px-6 lg:px-8 flex flex-col justify-center items-center">
        <BgPattern />
        <div className="relative z-10 max-w-md w-full bg-white/80 border border-gr-line p-8 rounded-sm text-center ">
          <h2 className="font-display text-2xl font-semibold text-gr-ink mb-3">Error</h2>
          <p className="font-sans text-sm text-gr-ink-soft mb-6">{error}</p>
          <Link
            href={user?.role === 'PEMBELI' ? "/permintaan-saya" : "/beranda"}
            className="inline-flex items-center gap-2 bg-gr-board text-gr-chalk hover:bg-gr-board/90 font-mono text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-sm  transition-all"
          >
            {user?.role === 'PEMBELI' ? "Kembali ke Ajukan Permintaan" : "Kembali ke Beranda"}
          </Link>
        </div>
      </main>
    );
  }

  const needed = request.quantity_kg_needed;
  const committed = request.quantity_kg_committed;
  const progressPercent = Math.min(100, Math.round((committed / needed) * 100));
  const remainingKg = Math.max(0, needed - committed);

  const formattedDeadline = formatWIBDate(request.deadline);

  return (
    <main className="relative min-h-[calc(100vh-80px)] bg-gr-paper py-16 px-4 sm:px-6 lg:px-8">
      <BgPattern />

      <div className="relative z-10 mx-auto max-w-5xl">
        {/* Back navigation */}
        <div className="mb-6">
          <Link
            href={user?.role === 'PEMBELI' ? "/permintaan-saya" : "/beranda"}
            className="inline-flex items-center gap-2 font-mono text-xs uppercase font-bold tracking-wider text-gr-ink-soft hover:text-gr-ink transition-colors"
          >
            <ArrowLeft size={12} />
            {user?.role === 'PEMBELI' ? "Kembali ke Ajukan Permintaan" : "Kembali ke Beranda"}
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Info Columns (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            <header className="mb-6">
              <span className="font-mono text-[10px] uppercase tracking-widest text-gr-down font-bold block mb-2 select-none">
                {request.category || 'Hasil Bumi'}
              </span>
              <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-gr-ink">
                {request.commodity_name}
              </h1>
              <p className="mt-2 font-mono text-xs font-bold text-gr-ink-soft/70">
                Request ID: {request.id.slice(0, 8)}
              </p>
            </header>
 
            {/* Consolidated Request Detail Container */}
            <div className="rounded-sm border border-gr-line bg-white/80 backdrop-blur-md overflow-hidden">
              {/* Progress Bar Section (Editorial Ticker/Data-Panel style) */}
              <div className="p-6 sm:p-8 border-b border-gr-line bg-[#FAF9F5]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                {/* Left side: Serif Percentage & Volume Progress */}
                <div className="flex items-center gap-6 shrink-0">
                  <div className="space-y-1">
                    <div className="font-display text-4xl sm:text-5xl font-bold text-gr-board leading-none">
                      {progressPercent}%
                    </div>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft/70 font-bold block">
                      Kuota Terpenuhi
                    </span>
                  </div>
 
                  <div className="h-8 w-[1px] bg-gr-line/35 shrink-0" />
 
                  <div className="space-y-1">
                    <div className="font-mono text-xl font-bold text-gr-ink leading-none">
                      {Math.round(committed).toLocaleString('id-ID')} <span className="text-xs text-gr-ink-soft font-normal">dari</span> {Math.round(needed).toLocaleString('id-ID')} <span className="text-[10px] text-gr-ink-soft font-bold tracking-wider">KG</span>
                    </div>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft/70 font-bold block">
                      Volume Pemenuhan
                    </span>
                  </div>
                </div>
 
                {/* Right side: Petani committed count */}
                <div className="space-y-1 sm:text-right shrink-0">
                  <div className="font-mono text-xl font-bold text-gr-ink leading-none">
                    {request.num_petani_committed && request.num_petani_committed > 0 ? (
                      <span>{request.num_petani_committed} Petani/Peternak</span>
                    ) : (
                      <span className="text-sm font-sans text-gr-ink-soft italic font-normal">Belum ada komitmen masuk</span>
                    )}
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft/70 font-bold block">
                    Mitra Tani/Peternak Berkomitmen
                  </span>
                </div>
 
                {remainingKg > 0 && request.status === 'TERBUKA' && (
                  <div className="hidden">
                    {/* Kept internally to preserve code functionality but layout is driven by stat block */}
                  </div>
                )}
              </div>
 
              {/* Request Detail Section */}
              <div className="p-6 sm:p-8 space-y-5">
                <div className="border-b border-gr-line/45 pb-3">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold block">Rincian Permintaan</span>
                </div>
                
                <div className="font-sans text-sm">
                  {/* Row 1: Deadline & Lokasi */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pl-4 border-l-2 border-gr-board/15">
                    <div className="space-y-1">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft/75 font-semibold block mb-0.5">Deadline Pemenuhan</span>
                      <p className="text-gr-ink font-semibold flex items-center gap-2">
                        <Calendar size={14} strokeWidth={2} className="text-gr-board/60 pointer-events-none" />
                        {formattedDeadline}
                      </p>
                    </div>
 
                    <div className="space-y-1">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft/75 font-semibold block mb-0.5">Lokasi Penerimaan</span>
                      <p className="text-gr-ink font-semibold flex items-start gap-2">
                        <MapPin size={14} strokeWidth={2} className="text-gr-board/60 mt-0.5 shrink-0" />
                        <span className="leading-snug">
                          {request.latitude && request.longitude
                            ? (addressName || getClosestProvince(request.latitude, request.longitude))
                            : 'Lokasi tidak diketahui'}
                        </span>
                      </p>
                    </div>
                  </div>
 
                  {/* Row 2: Harga Penawaran & Harga Acuan */}
                  <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-10 gap-y-6 pt-5 border-t border-gr-line/35 pl-4 border-l-2 border-gr-board/15">
                    <div className="space-y-1">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft/75 font-semibold block mb-0.5">Harga Penawaran</span>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <div className="flex items-baseline gap-1 font-display whitespace-nowrap">
                          <span className="text-2xl font-bold text-gr-ink leading-none">
                            Rp {request.price_per_kg ? Math.round(request.price_per_kg).toLocaleString('id-ID') : '-'}
                          </span>
                          <span className="text-gr-ink-soft/70 text-[10px] font-bold">/ KG</span>
                        </div>
                        {refPrice !== null && (
                          (() => {
                            const priceDevPercent = Math.round(((request.price_per_kg - refPrice) / refPrice) * 100);
                            if (priceDevPercent === 0) return null;
                            return (
                              <span className={cn(
                                "text-xs font-bold flex items-center gap-0.5 leading-none shrink-0",
                                priceDevPercent > 0 ? "text-gr-down" : "text-gr-up"
                              )}>
                                <span>{priceDevPercent > 0 ? '▲' : '▼'}</span>
                                <span>{priceDevPercent > 0 ? '+' : ''}{priceDevPercent}% vs acuan</span>
                              </span>
                            );
                          })()
                        )}
                      </div>
                    </div>

                    {refPrice !== null && (
                      <div className="space-y-1 animate-fade-in">
                        <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft/75 font-semibold block mb-0.5">Harga Acuan ({refPriceRegion})</span>
                        <div className="flex items-baseline gap-1 font-display whitespace-nowrap">
                          <span className="text-lg font-bold text-gr-ink-soft leading-none">
                            Rp {Math.round(refPrice).toLocaleString('id-ID')}
                          </span>
                          <span className="text-[10px] text-gr-ink-soft/60 font-bold">/ KG</span>
                        </div>
                      </div>
                    )}
                  </div>
 
                  {/* Row 3: Status Permintaan */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-5 border-t border-gr-line/35 pl-4 border-l-2 border-gr-board/15">
                    <div className="space-y-1">
                      <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft/75 font-semibold block mb-0.5">Status Permintaan</span>
                      <div className="pt-0.5 flex flex-wrap items-center gap-3">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider border font-mono ${
                          request.status === 'TERBUKA' 
                            ? 'bg-gr-board/10 text-gr-board border-gr-board/20'
                            : request.status === 'TERPENUHI'
                            ? 'bg-gr-up/10 text-gr-up border-gr-up/20'
                            : request.status === 'DIBATALKAN'
                            ? 'bg-gr-down/10 text-gr-down border-gr-down/20'
                            : 'bg-gr-paper text-gr-ink-soft border-gr-line'
                        }`}>
                          {request.status}
                        </span>

                        {isRequestBuyer && request.status === 'TERBUKA' && request.quantity_kg_committed === 0 && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setConfirmCancelOpen(true)}
                            disabled={cancelling}
                            className="font-mono text-[9px] font-bold uppercase tracking-wider h-7 px-3 cursor-pointer shrink-0"
                          >
                            {cancelling ? (
                              <>
                                <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" />
                                Proses...
                              </>
                            ) : (
                              'Batalkan Permintaan'
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
 
                  {/* Row 4: Footer Notice & System Metadata */}
                  <div className="pt-5 border-t border-gr-line/35 pl-4 border-l-2 border-gr-board/15">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-gr-ink-soft/60">
                      <span className="w-1.5 h-1.5 rounded-full bg-gr-up animate-pulse" />
                      <span>Terakhir diperbarui: {formatWIBDateTime(request.updated_at || request.created_at)}</span>
                    </div>
                  </div>
                </div>

                {user && user.role === 'PETANI' && request.buyer_name && (
                  <div className="pt-6 border-t border-gr-line">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold block mb-3">
                      Informasi Kontak Pembeli
                    </span>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 py-2">
                      <div className="font-sans text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-gr-ink font-semibold text-base">{request.buyer_name}</span>
                          <div className="flex items-center justify-center shrink-0">
                            <RatingBadge
                              avgRating={request.buyer_rating_avg}
                              ratingCount={request.buyer_rating_count}
                              size="sm"
                              newLabel="Pembeli Baru"
                              countSuffix="permintaan"
                            />
                          </div>
                        </div>
                        <p className="text-gr-ink-soft/70 text-xs mt-0.5">{request.buyer_phone || 'Tidak ada nomor telepon'}</p>
                      </div>
                      {request.buyer_id && (
                        <button
                          onClick={handleContactBuyer}
                          disabled={chatLoading}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-sm bg-gr-board text-gr-chalk hover:bg-gr-board/90 font-mono text-xs font-bold uppercase tracking-wider transition-all  cursor-pointer disabled:opacity-50"
                        >
                          {chatLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MessageSquare className="h-4 w-4" />
                          )}
                          <span>Chat Pembeli</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Commit actions for Farmers & Commitments log (1/3 width) */}
          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
            {/* Buyer Match & Escrow Panel — one card per matched transaction */}
            {user && user.role === 'PEMBELI' && request.buyer_id === user.id && (request.match_transactions || []).length > 0 && (() => {
              const txs: any[] = request.match_transactions || [];
              const isPartial = request.status === 'TERBUKA' && request.quantity_kg_committed < request.quantity_kg_needed;
              return (
                <div className="rounded-sm border border-gr-line bg-white/80 overflow-hidden">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-gr-line flex items-center justify-between">
                    <div>
                      <span className="bg-gr-up/10 border border-gr-up/20 px-2 py-0.5 font-mono text-[9px] uppercase font-bold tracking-wider text-gr-up rounded-xs inline-block mb-0.5">
                        Telah Dicocokkan
                      </span>
                      <h3 className="font-display text-base font-semibold text-gr-ink">
                        Transaksi Rekening Bersama <span className="font-mono text-xs text-gr-ink-soft">({txs.length} petani/peternak)</span>
                      </h3>
                    </div>
                    {isPartial && (
                      <div className="text-right">
                        <div className="font-mono font-bold text-sm text-gr-ink">{Math.round(request.quantity_kg_committed)} KG</div>
                        <div className="font-mono text-[9px] text-gr-ink-soft uppercase tracking-wide">terpenuhi</div>
                      </div>
                    )}
                  </div>

                  {/* One row per transaction */}
                  <div className="divide-y divide-gr-line">
                    {txs.map((tx: any, idx: number) => (
                      <div key={tx.id} className="p-4 space-y-3">
                        {/* Farmer info row */}
                        <div className="flex items-center justify-between text-xs font-sans">
                          <div>
                            <div className="font-semibold text-gr-ink">{tx.seller_name}</div>
                            <div className="text-gr-ink-soft font-mono">{tx.quantity_kg} KG · Rp {Math.round(tx.price_per_kg).toLocaleString('id-ID')}/KG</div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-gr-ink text-sm">Rp {Math.round(tx.amount).toLocaleString('id-ID')}</div>
                            <span className={cn(
                              "font-mono text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-xs border",
                              tx.payment_status === 'paid'
                                ? "bg-gr-up/10 text-gr-up border-gr-up/20"
                                : "bg-gr-down/10 text-gr-down border-gr-down/20"
                            )}>
                              {tx.payment_status === 'paid' ? 'LUNAS' : 'PENDING'}
                            </span>
                          </div>
                        </div>

                        {/* Escrow status pill & Fulfillment info */}
                        {tx.escrow_status && tx.escrow_status !== 'not_started' && (
                          <div className={cn(
                            "text-center py-2 px-3 rounded-xs text-[10px] font-mono font-bold uppercase tracking-wider border",
                            tx.escrow_status === 'held' && "bg-amber-500/10 text-amber-800 border-amber-500/20",
                            tx.escrow_status === 'released' && "bg-gr-up/10 text-gr-up border-gr-up/20",
                            tx.escrow_status === 'disputed' && "bg-gr-down/10 text-gr-down border-gr-down/20"
                          )}>
                            {tx.escrow_status === 'held' && 'Dana Diamankan (Rekber)'}
                            {tx.escrow_status === 'released' && 'Dana Dicairkan'}
                            {tx.escrow_status === 'disputed' && 'Sengketa — Ditangguhkan'}
                          </div>
                        )}

                        {tx.payment_status === 'paid' && tx.escrow_status === 'held' && (
                          <div className="p-3 rounded-xs border border-gr-line bg-[#FAF9F5] space-y-1.5">
                            {tx.fulfillment_status === 'SIAP_DIANTAR' ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-blue-900 font-mono text-[10px] font-bold uppercase tracking-wider">
                                  <Truck size={14} className="text-blue-700 shrink-0" />
                                  <span>Produk Siap Diantar Petani</span>
                                </div>
                                <p className="font-sans text-[11px] text-gr-ink-soft leading-tight">
                                  Petani telah mengonfirmasi bahwa produk siap diantar ke lokasi Anda.
                                </p>
                              </div>
                            ) : tx.fulfillment_status === 'SIAP_DIAMBIL' ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-emerald-900 font-mono text-[10px] font-bold uppercase tracking-wider">
                                  <Store size={14} className="text-emerald-700 shrink-0" />
                                  <span>Produk Siap Diambil</span>
                                </div>
                                <p className="font-sans text-[11px] text-gr-ink-soft leading-tight">
                                  Produk sudah siap untuk diambil di lokasi petani.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-amber-900 font-mono text-[10px] font-bold uppercase tracking-wider">
                                  <Clock size={14} className="text-amber-700 shrink-0 animate-pulse" />
                                  <span>Menunggu Kesiapan Petani</span>
                                </div>
                                <p className="font-sans text-[11px] text-gr-ink-soft leading-tight">
                                  Petani sedang menyiapkan produk hasil panen.
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-2">
                          {isRequestBuyer && tx.payment_status !== 'paid' && (
                            <>
                              <Button
                                disabled={checkingOutTxId === tx.id || cancellingTxId === tx.id}
                                onClick={() => handleCheckout(tx.id)}
                                className="flex-1 bg-gr-board hover:bg-gr-board/90 text-gr-chalk font-mono text-[10px] font-bold uppercase tracking-wider py-2 rounded-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                {checkingOutTxId === tx.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Bayar'}
                              </Button>
                              <Button
                                variant="destructive"
                                disabled={checkingOutTxId === tx.id || cancellingTxId === tx.id}
                                onClick={() => setConfirmCancelTx(tx)}
                                className="px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider rounded-sm transition-all cursor-pointer flex items-center justify-center gap-1"
                              >
                                {cancellingTxId === tx.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Batal'}
                              </Button>
                            </>
                          )}
                          {isRequestBuyer && tx.payment_status === 'paid' && tx.escrow_status === 'held' && (
                            <Button
                              disabled={confirmingTxId === tx.id}
                              onClick={() => handleConfirmReceived(tx.id)}
                              className="flex-1 bg-gr-board hover:bg-gr-board/90 text-gr-chalk font-mono text-[10px] font-bold uppercase tracking-wider py-2 rounded-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              {confirmingTxId === tx.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Konfirmasi Diterima'}
                            </Button>
                          )}
                          {isRequestBuyer && tx.seller_id && (
                            <button
                              onClick={() => handleContactSeller(tx)}
                              disabled={chatLoading}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-sm border border-gr-line hover:border-gr-ink bg-white/40 hover:bg-white/60 font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink transition-all cursor-pointer disabled:opacity-50"
                              title="Chat Petani/Peternak"
                            >
                              {chatLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
                              <span>Chat</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Grand total row */}
                  {txs.length > 1 && (
                    <div className="px-4 py-3 bg-gr-paper/60 border-t border-gr-line flex justify-between items-center">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-gr-ink-soft font-bold">Total Semua Transaksi</span>
                      <span className="font-mono font-bold text-gr-ink text-sm">
                        Rp {txs.reduce((sum: number, tx: any) => sum + tx.amount, 0).toLocaleString('id-ID')}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {isRequestBuyer && request.quantity_kg_committed < request.quantity_kg_needed && request.status !== 'DIBATALKAN' && request.status !== 'KEDALUWARSA' && (
              loadingCandidates ? (
                      <div className="rounded-sm border border-gr-line bg-white/80 p-6 overflow-hidden space-y-4">
                        {(request.match_transactions || []).length > 0 && (
                          <div className="bg-[#D9A74A]/10 border border-[#D9A74A]/30 rounded-sm px-3 py-2 font-mono text-[10px] text-[#7A5C1E] uppercase tracking-wider">
                            Masih butuh {Math.round(request.quantity_kg_needed - request.quantity_kg_committed)} KG lagi — cari petani/peternak tambahan
                          </div>
                        )}
                        <h3 className="font-display text-xl font-semibold text-gr-ink flex items-center gap-2">
                          <Users size={16} strokeWidth={2} className="text-gr-board" />
                          Kandidat Produk Petani/Peternak
                        </h3>
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-6 w-6 animate-spin text-gr-board" />
                          <span className="text-xs text-gr-ink-soft ml-2">Mencari kandidat terbaik...</span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-sm border border-gr-line bg-white/80 p-6 overflow-hidden space-y-4">
                        {(request.match_transactions || []).length > 0 && (
                          <div className="bg-[#D9A74A]/10 border border-[#D9A74A]/30 rounded-sm px-3 py-2 font-mono text-[10px] text-[#7A5C1E] uppercase tracking-wider">
                            Masih butuh {Math.round(request.quantity_kg_needed - request.quantity_kg_committed)} KG lagi — cari petani/peternak tambahan
                          </div>
                        )}
                        <h3 className="font-display text-xl font-semibold text-gr-ink flex items-center gap-2">
                          <Users size={16} strokeWidth={2} className="text-gr-board" />
                          Kandidat Produk Petani/Peternak
                        </h3>
                        <p className="font-sans text-[11px] text-gr-ink-soft leading-relaxed">
                          Berikut adalah daftar produk petani/peternak yang cocok secara harga dan kemiripan komoditas dengan permintaan Anda. Silakan pilih salah satu untuk bertransaksi via Rekening Bersama (Rekber).
                        </p>

                        {candidates.length === 0 ? (
                          <div className="text-center py-6 px-4 border border-dashed border-gr-line rounded-sm bg-gr-paper/30">
                            <p className="text-xs font-sans text-gr-ink-soft">
                              Tidak ada produk petani/peternak yang cocok (harga ≤ Rp {Math.round(request.price_per_kg).toLocaleString('id-ID')}/KG & cocok secara embedding) saat ini.
                            </p>
                          </div>
                        ) : (() => {
                          const candidatesPerPage = 2;
                          const totalPages = Math.ceil(candidates.length / candidatesPerPage);
                          const currentCandidates = candidates.slice(
                            (currentPage - 1) * candidatesPerPage,
                            currentPage * candidatesPerPage
                          );
                          return (
                            <div className="space-y-3">
                              <div className="space-y-2.5">
                                {currentCandidates.map((cand) => {
                                  const similarityPercentage = Math.round((1 - cand.distance_score) * 100);
                                  return (
                                    <div key={cand.product_id} className="py-4 border-b border-gr-line/45 last:border-b-0 flex flex-col gap-3.5 relative overflow-hidden">
                                      {/* Product Title & Match Badge */}
                                      <div className="flex justify-between items-start gap-2">
                                        <div className="min-w-0 flex-1">
                                          <h4 className="font-display font-semibold text-xs text-gr-ink line-clamp-2" title={cand.product_name}>{cand.product_name}</h4>
                                          <p className="text-[10px] text-gr-ink-soft font-sans mt-0.5">Petani/Peternak: {cand.seller_name}</p>
                                        </div>
                                        <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-xs bg-gr-up/10 text-gr-up border border-gr-up/20 shrink-0">
                                          {similarityPercentage}% Match
                                        </span>
                                      </div>

                                      {/* Stock & Price info */}
                                      <div className="grid grid-cols-2 gap-4 text-xs font-sans border-t border-b border-gr-line/45 py-2">
                                        <div>
                                          <span className="text-[10px] text-gr-ink-soft block">Stok Tersedia:</span>
                                          <span className="font-semibold text-gr-ink font-mono">{cand.quantity_kg} KG</span>
                                        </div>
                                        <div>
                                          <span className="text-[10px] text-gr-ink-soft block">Harga per KG:</span>
                                          <span className="font-semibold text-gr-ink font-mono">Rp {Math.round(cand.price_per_kg).toLocaleString('id-ID')}</span>
                                        </div>
                                      </div>

                                      {/* Action Buttons */}
                                      <div className="grid grid-cols-2 gap-2">
                                        <a
                                          href={`/produk/${cand.product_id}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="h-8 rounded-xs border border-gr-line text-gr-ink hover:bg-gr-paper font-mono text-[9px] font-bold uppercase tracking-wider flex items-center justify-center transition-all cursor-pointer"
                                        >
                                          Detail
                                        </a>
                                        <Button
                                          disabled={matching !== null}
                                          onClick={() => handlePilihClick(cand)}
                                          size="sm"
                                          className="h-8 bg-gr-board hover:bg-gr-board/90 text-gr-chalk font-mono text-[9px] font-bold uppercase tracking-wider rounded-xs  cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                                        >
                                          {matching === cand.product_id ? (
                                            <>
                                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                              Proses...
                                            </>
                                          ) : (
                                            'Pilih'
                                          )}
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Pagination Controls */}
                              {totalPages > 1 && (
                                <div className="flex items-center justify-between pt-2 border-t border-gr-line/50 text-[10px] font-sans text-gr-ink-soft">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                    className="h-6 px-2 text-[9px] font-bold uppercase tracking-wider text-gr-ink hover:bg-gr-paper border border-gr-line disabled:opacity-45"
                                  >
                                    Sebelumnya
                                  </Button>
                                  
                                  {/* Numbered circles indicator */}
                                  <div className="flex justify-center items-center gap-1 mx-2">
                                    {Array.from({ length: totalPages }).map((_, idx) => {
                                      const pageNum = idx + 1;
                                      return (
                                        <button
                                          key={pageNum}
                                          onClick={() => setCurrentPage(pageNum)}
                                          className={cn(
                                            "h-4 w-4 rounded-sm flex items-center justify-center text-[9px] font-mono font-bold transition-all duration-200 cursor-pointer border",
                                            currentPage === pageNum
                                              ? "bg-gr-board text-gr-chalk border-gr-board"
                                              : "bg-white text-gr-ink-soft border-gr-line hover:border-gr-ink hover:text-gr-ink"
                                          )}
                                          aria-label={`Halaman ${pageNum}`}
                                        >
                                          {pageNum}
                                        </button>
                                      );
                                    })}
                                  </div>

                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                    className="h-6 px-2 text-[9px] font-bold uppercase tracking-wider text-gr-ink hover:bg-gr-paper border border-gr-line disabled:opacity-45"
                                  >
                                    Selanjutnya
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )
            )}

            {/* Farmer Readiness Action Panel for Matched Transactions */}
            {user && user.role === 'PETANI' && (() => {
              const myTxs = (request.match_transactions || []).filter((t: any) => t.seller_id === user.id);
              if (myTxs.length === 0) return null;
              return (
                <div className="space-y-3">
                  {myTxs.map((myTx: any) => {
                    const isPaid = myTx.payment_status === 'paid';
                    const isCompleted = myTx.escrow_status === 'released' || myTx.fulfillment_status === 'SELESAI';
                    const isHeld = isPaid && myTx.escrow_status === 'held' && !isCompleted;
                    return (
                      <div key={myTx.id} className="rounded-sm border border-gr-line bg-white/80 p-5 space-y-3 overflow-hidden">
                        <div className="flex items-center justify-between border-b border-gr-line/40 pb-2">
                          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-gr-board">
                            Status Transaksi Supply ({myTx.quantity_kg} KG)
                          </span>
                          <span className={cn(
                            "font-mono text-[9px] font-bold uppercase px-2 py-0.5 rounded-xs border",
                            isCompleted ? "bg-gr-up/10 text-gr-up border-gr-up/20" : isPaid ? "bg-amber-500/10 text-amber-700 border-amber-500/20" : "bg-gr-paper text-gr-ink-soft border-gr-line"
                          )}>
                            {isCompleted ? 'SELESAI (DANA DICAIRKAN)' : isPaid ? 'LUNAS (REKBER)' : 'MENUNGGU PEMBAYARAN'}
                          </span>
                        </div>

                        {isHeld ? (
                          <div className="space-y-3">
                            <p className="font-sans text-xs text-gr-ink leading-relaxed">
                              {myTx.fulfillment_status === 'SIAP_DIANTAR'
                                ? '✅ Anda telah mengonfirmasi bahwa produk siap diantar ke pembeli.'
                                : myTx.fulfillment_status === 'SIAP_DIAMBIL'
                                ? '✅ Anda telah mengonfirmasi bahwa produk siap diambil di lokasi Anda.'
                                : 'Pembeli telah membayar. Silakan konfirmasi kesiapan produk untuk pembeli:'}
                            </p>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={updatingFulfillmentTxId === myTx.id}
                                onClick={() => handleUpdateFulfillment(myTx.id, 'SIAP_DIANTAR')}
                                className={cn(
                                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-sm font-mono text-[10px] uppercase font-bold tracking-wider transition-all cursor-pointer border",
                                  myTx.fulfillment_status === 'SIAP_DIANTAR'
                                    ? "bg-blue-700 text-white border-blue-700 shadow-xs"
                                    : "bg-white hover:bg-blue-50 text-blue-900 border-blue-300"
                                )}
                              >
                                <Truck size={13} />
                                <span>{myTx.fulfillment_status === 'SIAP_DIANTAR' ? 'Siap Diantar (Aktif)' : 'Siap Diantar'}</span>
                              </button>

                              <button
                                type="button"
                                disabled={updatingFulfillmentTxId === myTx.id}
                                onClick={() => handleUpdateFulfillment(myTx.id, 'SIAP_DIAMBIL')}
                                className={cn(
                                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-sm font-mono text-[10px] uppercase font-bold tracking-wider transition-all cursor-pointer border",
                                  myTx.fulfillment_status === 'SIAP_DIAMBIL'
                                    ? "bg-emerald-700 text-white border-emerald-700 shadow-xs"
                                    : "bg-white hover:bg-emerald-50 text-emerald-900 border-emerald-300"
                                )}
                              >
                                <Store size={13} />
                                <span>{myTx.fulfillment_status === 'SIAP_DIAMBIL' ? 'Siap Diambil (Aktif)' : 'Siap Diambil'}</span>
                              </button>
                            </div>
                            {updatingFulfillmentTxId === myTx.id && (
                              <div className="flex items-center justify-center gap-1.5 text-xs text-gr-ink-soft font-mono">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-gr-board" />
                                <span>Memperbarui status...</span>
                              </div>
                            )}
                          </div>
                        ) : isCompleted ? (
                          <div className="flex items-center gap-2 text-gr-up font-mono text-xs font-bold uppercase">
                            <CheckCircle2 size={15} />
                            <span>Transaksi Selesai & Dana Telah Dicairkan</span>
                          </div>
                        ) : (
                          <p className="font-sans text-xs text-gr-ink-soft">
                            Menunggu pembeli menyelesaikan pembayaran invoice escrow.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Farmer Commitment Action Panel */}
            {user && user.role === 'PETANI' && request.status === 'TERBUKA' && (
              <div className="rounded-none border border-gr-line bg-white/80 p-5 space-y-4 shadow-xs">
                {/* Header Ticket Style */}
                <div className="flex flex-col gap-1 pb-3 border-b border-dashed border-gr-line">
                  <div className="flex justify-between items-center font-mono text-[9px] font-bold tracking-widest">
                    <span className="text-gr-board flex items-center gap-1">
                      <ClipboardCheck size={12} className="stroke-[2.5]" />
                      // KOMITMEN PASOKAN
                    </span>
                    <span className="text-gr-ink-soft/50 font-medium">
                      SISA {remainingKg} KG
                    </span>
                  </div>
                  <h3 className="font-display text-xl font-bold text-gr-ink leading-tight mt-0.5">
                    Bantu Penuhi Pasokan
                  </h3>
                </div>

                <p className="font-sans text-xs text-gr-ink-soft leading-relaxed">
                  Apakah Anda memiliki produk ini atau sanggup menyediakannya? Masukkan kuantitas pasokan yang siap Anda kirimkan.
                </p>

                {commitSuccess && (
                  <div className="rounded-none bg-gr-up/10 p-3 text-xs text-gr-up border border-gr-up/30 flex items-center gap-2 font-mono">
                    <CheckCircle size={14} className="shrink-0" />
                    <span>Komitmen berhasil dikirim ke pemohon!</span>
                  </div>
                )}

                {error && (
                  <div className="rounded-none bg-gr-down/10 p-3 text-xs text-gr-down border border-gr-down/30 font-mono">
                    {error}
                  </div>
                )}

                <form onSubmit={handleCommitSubmit} className="space-y-3.5">
                  <div>
                    <label className="block font-mono text-[8px] font-bold uppercase tracking-widest text-gr-ink mb-1">
                      Jumlah Pasokan (KG)
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        step="any"
                        min="0.1"
                        placeholder="Contoh: 50"
                        value={commitQty}
                        onChange={(e) => setCommitQty(e.target.value)}
                        className="w-full border border-gr-line bg-white/90 px-3 py-2 text-xs font-mono font-bold text-gr-ink focus:outline-none focus:border-gr-board rounded-none placeholder:font-sans placeholder:text-gr-ink-soft/40"
                      />
                      <span className="absolute right-3 font-mono text-[10px] font-bold text-gr-ink-soft/50">
                        KG
                      </span>
                    </div>
                  </div>

                  {/* Quick Presets */}
                  {remainingKg > 0 && (
                    <div className="flex gap-1.5">
                      {[
                        { label: '25%', val: Math.max(1, Math.round(remainingKg * 0.25)) },
                        { label: '50%', val: Math.max(1, Math.round(remainingKg * 0.5)) },
                        { label: 'Semua', val: remainingKg }
                      ].map((preset, pIdx) => {
                        if (preset.val <= 0) return null;
                        const isSelected = commitQty === preset.val.toString();
                        return (
                          <button
                            key={pIdx}
                            type="button"
                            onClick={() => setCommitQty(preset.val.toString())}
                            className={cn(
                              "flex-1 font-mono text-[9px] font-bold py-1 px-1.5 rounded-none border transition-all cursor-pointer",
                              isSelected
                                ? "bg-gr-board text-gr-chalk border-gr-board"
                                : "bg-white hover:bg-gr-board/10 hover:border-gr-board/40 text-gr-ink-soft hover:text-gr-board border-gr-line"
                            )}
                          >
                            {preset.label} ({preset.val} kg)
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Live Estimated Revenue */}
                  {parseFloat(commitQty) > 0 && (
                    <div className="p-2.5 bg-[#FAF9F5] border border-dashed border-gr-line flex justify-between items-center text-[10px] font-mono">
                      <span className="text-gr-ink-soft/70 uppercase tracking-wider font-bold">Total Estimasi:</span>
                      <span className="font-bold text-gr-board text-xs">
                        Rp {Math.round(parseFloat(commitQty) * (request.price_per_kg || 0)).toLocaleString('id-ID')}
                      </span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={submittingCommit}
                    className="w-full bg-gr-board hover:bg-gr-board/90 text-gr-chalk border border-gr-ink/40 font-mono text-[10px] font-bold uppercase tracking-widest py-3 rounded-none transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2"
                  >
                    {submittingCommit ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      'Kirim Pasokan'
                    )}
                  </Button>
                </form>
              </div>
            )}

            {/* Commitment History Log */}
            <div className="pt-6 border-t border-gr-line max-h-[400px] flex flex-col">
              <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-gr-ink-soft mb-4">
                Riwayat Komitmen ({request.commitments?.length || 0})
              </h3>
              
              <div className="overflow-y-auto space-y-2 flex-1 pr-1 custom-scrollbar">
                {request.commitments && request.commitments.length > 0 ? (
                  request.commitments.map((commit: any) => {
                    const commitDate = formatWIBDateTime(commit.committed_at, false);
                    const isBuyer = user?.role === 'PEMBELI';
                    return (
                      <div 
                        key={commit.id}
                        className="py-3 border-b border-gr-line/45 last:border-b-0 flex justify-between items-center bg-transparent"
                      >
                        <div>
                          {isBuyer && commit.petani_name && (
                            <p className="font-sans text-xs font-semibold text-gr-ink mb-0.5">
                              {commit.petani_name}
                            </p>
                          )}
                          <p className="font-mono text-xs font-bold text-gr-up">
                            +{commit.quantity_kg_committed} KG
                          </p>
                          <p className="font-sans text-[10px] text-gr-ink-soft/70 mt-0.5 font-mono">
                            {commitDate}
                          </p>
                        </div>
                        {isBuyer && commit.petani_id ? (
                          <button
                            onClick={() => handleContactPetani(commit.petani_id)}
                            disabled={chatLoading}
                            className="p-2 rounded-sm bg-gr-board text-gr-chalk hover:bg-gr-board/90 transition-all cursor-pointer  disabled:opacity-50"
                            title="Chat Petani/Peternak"
                          >
                            {chatLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MessageSquare className="h-4 w-4" />
                            )}
                          </button>
                        ) : (
                          <Tag size={14} className="text-gr-ink-soft/40" />
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="border border-dashed border-gr-line/60 bg-white/20 p-6 rounded-sm text-center flex flex-col items-center justify-center">
                    <Users className="h-6 w-6 text-gr-ink-soft/40 mb-2" />
                    <p className="text-gr-ink-soft text-xs font-sans italic">
                      Belum ada komitmen masuk
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedCandidate && (
        <ConfirmModal
          isOpen={confirmMatchOpen}
          onClose={() => setConfirmMatchOpen(false)}
          onConfirm={handleConfirmMatch}
          title="Konfirmasi Pembelian"
          confirmText="Konfirmasi"
          cancelText="Batal"
          variant="info"
          isLoading={matching !== null}
          description={
            <div className="space-y-3">
              <p className="font-sans text-xs text-gr-ink-soft leading-relaxed">
                Apakah Anda yakin ingin memilih hasil panen ini untuk memenuhi permintaan Anda? Tentukan jumlah volume yang ingin Anda penuhi:
              </p>
              <div className="bg-[#FAF9F5] border border-gr-line p-3.5 space-y-3 rounded-xs">
                <div className="font-mono text-[10px] text-gr-text-primary space-y-1.5">
                  <div className="flex justify-between gap-4">
                    <span className="text-gr-text-primary/60">PRODUK:</span>
                    <span className="font-bold text-gr-text-primary uppercase truncate max-w-[160px]" title={selectedCandidate.product_name}>
                      {selectedCandidate.product_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gr-text-primary/60">HARGA:</span>
                    <span className="font-bold text-gr-text-primary">
                      Rp {Math.round(selectedCandidate.price_per_kg).toLocaleString('id-ID')} / KG
                    </span>
                  </div>
                </div>

                {/* Volume Slider Section */}
                <div className="space-y-2 border-t border-dashed border-gr-line/30 pt-3">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-[9px] text-gr-text-primary/60 uppercase font-bold tracking-wider">VOLUME PEMENUHAN:</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step={0.1}
                        value={customMatchQty || ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          const maxVal = Math.min(selectedCandidate.quantity_kg, Math.max(0, request.quantity_kg_needed - request.quantity_kg_committed));
                          if (!isNaN(val)) {
                            setCustomMatchQty(Math.max(0.1, Math.min(val, maxVal)));
                          } else {
                            setCustomMatchQty(0);
                          }
                        }}
                        className="w-16 px-1.5 py-0.5 border border-gr-line bg-white text-right font-mono font-bold text-xs text-gr-ink rounded-sm focus:outline-none focus:border-gr-board"
                        min={0.1}
                        max={Math.min(selectedCandidate.quantity_kg, Math.max(0, request.quantity_kg_needed - request.quantity_kg_committed))}
                      />
                      <span className="font-mono font-bold text-xs text-gr-ink">KG</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-gr-ink-soft select-none">0.1</span>
                    <input
                      type="range"
                      min={0.1}
                      max={Math.min(selectedCandidate.quantity_kg, Math.max(0, request.quantity_kg_needed - request.quantity_kg_committed))}
                      step={0.1}
                      value={customMatchQty || 0.1}
                      onChange={(e) => setCustomMatchQty(parseFloat(e.target.value) || 0.1)}
                      className="flex-1 h-1 bg-gr-line rounded-lg appearance-none cursor-pointer accent-gr-board"
                    />
                    <span className="font-mono text-[9px] text-gr-ink-soft select-none">
                      {Math.round(Math.min(selectedCandidate.quantity_kg, Math.max(0, request.quantity_kg_needed - request.quantity_kg_committed)))}
                    </span>
                  </div>
                  <div className="flex justify-between text-[9px] font-sans text-gr-ink-soft/75 leading-normal">
                    <span>Stok Tersedia: {selectedCandidate.quantity_kg} KG</span>
                    <span>Sisa Kebutuhan: {Math.max(0, request.quantity_kg_needed - request.quantity_kg_committed)} KG</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-gr-line/30 pt-2.5 flex justify-between text-xs font-sans">
                  <span className="text-gr-text-primary font-bold">TOTAL ESTIMASI:</span>
                  <span className="font-bold text-gr-green font-mono">
                    Rp {Math.round(selectedCandidate.price_per_kg * (customMatchQty || 0)).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
              <p className="font-sans text-[10px] text-gr-orange leading-normal">
                * Transaksi Rekening Bersama (Rekber) ini akan membuat transaksi pembayaran baru dan memotong stok produk petani/peternak secara otomatis.
              </p>
            </div>
          }
        />
      )}

      {confirmCancelOpen && (
        <ConfirmModal
          isOpen={confirmCancelOpen}
          onClose={() => setConfirmCancelOpen(false)}
          onConfirm={handleCancelRequest}
          title="Batalkan Permintaan"
          confirmText="Ya, Batalkan"
          cancelText="Kembali"
          variant="danger"
          isLoading={cancelling}
          description={
            <div className="space-y-2">
              <p className="font-sans text-xs text-gr-ink-soft leading-relaxed">
                Apakah Anda yakin ingin membatalkan permintaan ini? Tindakan ini bersifat permanen dan status permintaan akan diubah menjadi <span className="font-mono font-bold text-gr-down">DIBATALKAN</span>.
              </p>
              <div className="bg-[#FAF9F5] border border-gr-line p-3 rounded-xs font-mono text-[10px] space-y-1">
                <div className="flex justify-between flex-wrap gap-x-4">
                  <span className="text-gr-text-primary/60">KOMODITAS:</span>
                  <span className="font-bold text-gr-text-primary uppercase truncate max-w-[180px]" title={request.commodity_name}>
                    {request.commodity_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gr-text-primary/60">VOL KEBUTUHAN:</span>
                  <span className="font-bold text-gr-text-primary">{request.quantity_kg_needed} KG</span>
                </div>
              </div>
            </div>
          }
        />
      )}

      {confirmCancelTx && (
        <ConfirmModal
          isOpen={!!confirmCancelTx}
          onClose={() => setConfirmCancelTx(null)}
          onConfirm={handleCancelTransaction}
          title="Batalkan Pencocokan"
          confirmText="Ya, Batalkan"
          cancelText="Kembali"
          variant="danger"
          isLoading={cancellingTxId === confirmCancelTx.id}
          description={
            <div className="space-y-2">
              <p className="font-sans text-xs text-gr-ink-soft leading-relaxed">
                Apakah Anda yakin ingin membatalkan transaksi pencocokan ini? Stok hasil panen petani sebesar <strong className="text-gr-ink font-mono">{confirmCancelTx.quantity_kg} KG</strong> akan dikembalikan secara otomatis.
              </p>
              <div className="bg-[#FAF9F5] border border-gr-line p-3 rounded-xs font-mono text-[10px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-gr-text-primary/60">PETANI/PETERNAK:</span>
                  <span className="font-bold text-gr-text-primary">{confirmCancelTx.seller_name || 'Petani'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gr-text-primary/60">VOLUME PEMBATALAN:</span>
                  <span className="font-bold text-gr-text-primary">{confirmCancelTx.quantity_kg} KG</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gr-text-primary/60">TOTAL TAGIHAN:</span>
                  <span className="font-bold text-gr-text-primary">Rp {Math.round(confirmCancelTx.amount).toLocaleString('id-ID')}</span>
                </div>
              </div>
            </div>
          }
        />
      )}

      {confirmCommitOpen && (
        <ConfirmModal
          isOpen={confirmCommitOpen}
          onClose={() => !submittingCommit && setConfirmCommitOpen(false)}
          onConfirm={handleExecuteCommit}
          title="Konfirmasi Pasokan"
          confirmText="Kirim Pasokan"
          cancelText="Batal"
          variant="info"
          isLoading={submittingCommit}
          description={
            <div className="space-y-3">
              <p className="font-sans text-xs text-gr-ink-soft leading-relaxed">
                Apakah Anda yakin ingin mengirim komitmen pasokan komoditas ini kepada pembeli?
              </p>
              <div className="bg-[#FAF9F5] border border-dashed border-gr-line p-3.5 space-y-2 rounded-none font-mono text-[10px]">
                <div className="flex justify-between items-center">
                  <span className="text-gr-ink-soft/60">PEMOHON:</span>
                  <span className="font-bold text-gr-ink uppercase">{request.buyer_name || 'Pembeli'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gr-ink-soft/60">KOMODITAS:</span>
                  <span className="font-bold text-gr-ink uppercase">{request.commodity_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gr-ink-soft/60">VOLUME PASOKAN:</span>
                  <span className="font-bold text-gr-board">{commitQty} KG</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gr-ink-soft/60">HARGA PENAWARAN:</span>
                  <span className="font-bold text-gr-ink">Rp {Math.round(request.price_per_kg).toLocaleString('id-ID')} / KG</span>
                </div>
                <div className="border-t border-dashed border-gr-line/50 pt-2 flex justify-between items-center text-xs">
                  <span className="text-gr-ink font-bold">TOTAL ESTIMASI:</span>
                  <span className="font-bold text-gr-board font-mono">
                    Rp {Math.round((request.price_per_kg || 0) * (parseFloat(commitQty) || 0)).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
              <p className="font-sans text-[10px] text-gr-ink-soft/70 leading-normal">
                * Komitmen Anda akan langsung diberitahukan kepada pemohon untuk pencocokan pesanan dan pembayaran rekening bersama (escrow).
              </p>
            </div>
          }
        />
      )}

    </main>
  );

}
