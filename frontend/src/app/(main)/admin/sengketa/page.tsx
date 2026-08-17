'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { adminApi, AdminDisputeResolvePayload } from '@/lib/api/admin';
import { conversationsApi } from '@/lib/api/conversations';
import { Button } from '@/components/ui/button';
import { BgPattern } from '@/components/effects/bg-pattern';
import { FilmGrain } from '@/components/effects/film-grain';
import { 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  Package, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  User, 
  CreditCard, 
  Loader2, 
  ArrowRight, 
  RefreshCw, 
  Search,
  Phone,
  Building,
  RotateCcw,
  MessageSquare,
  LogIn,
  Lock,
  LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { formatWIBDate } from '@/lib/utils/date';

export default function AdminDisputesPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [isForbidden, setIsForbidden] = useState<boolean>(false);
  const [forbiddenMessage, setForbiddenMessage] = useState<string | null>(null);
  
  const [disputes, setDisputes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Resolution modal state
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [resolveAction, setResolveAction] = useState<'REFUND_BUYER' | 'RELEASE_SELLER'>('REFUND_BUYER');
  const [adminNote, setAdminNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null);

  // Check login authentication and load disputes
  useEffect(() => {
    const initPage = async () => {
      setIsAuthChecking(true);
      setIsForbidden(false);
      try {
        const user = await authApi.getMe();
        if (user && user.id) {
          setCurrentUser(user);
          await loadDisputes(statusFilter);
        } else {
          setCurrentUser(null);
        }
      } catch (err: any) {
        console.error('Auth error:', err);
        setCurrentUser(null);
      } finally {
        setIsAuthChecking(false);
      }
    };

    initPage();
  }, []);

  const loadDisputes = async (filter = statusFilter) => {
    setIsLoading(true);
    setResolveError(null);
    try {
      const data = await adminApi.getDisputedOrders(filter);
      setDisputes(data);
      setIsForbidden(false);
    } catch (err: any) {
      console.error('Failed to load disputes:', err);
      if (err.status === 403 || err.message?.includes('Akses ditolak') || err.message?.includes('Forbidden')) {
        setIsForbidden(true);
        setForbiddenMessage(err.message || 'Hanya akun Administrator resmi yang diizinkan mengakses panel ini.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (filter: 'pending' | 'all') => {
    setStatusFilter(filter);
    loadDisputes(filter);
  };

  const handleOpenResolveModal = (order: any) => {
    setSelectedOrder(order);
    setResolveAction('REFUND_BUYER');
    setAdminNote('');
    setResolveError(null);
  };

  const handleExecuteResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setIsSubmitting(true);
    setResolveError(null);
    try {
      const payload: AdminDisputeResolvePayload = {
        action: resolveAction,
        admin_note: adminNote.trim() || undefined,
      };
      await adminApi.resolveDispute(selectedOrder.id, payload);
      setSuccessMessage(`Sengketa pesanan #${selectedOrder.id.slice(0, 8)} berhasil diselesaikan (${resolveAction === 'REFUND_BUYER' ? 'Refund Pembeli' : 'Cairkan ke Penjual'}).`);
      setSelectedOrder(null);
      await loadDisputes(statusFilter);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('Resolution failed:', err);
      setResolveError(err.message || 'Gagal mengeksekusi penyelesaian sengketa');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartInAppChat = async (targetUserId: string, productId?: string, isSeller = false) => {
    try {
      setChatLoadingId(targetUserId);
      const res = await conversationsApi.createConversation(
        productId,
        isSeller ? targetUserId : undefined,
        !isSeller ? targetUserId : undefined
      );
      if (res && res.conversation_id) {
        router.push(`/chat/${res.conversation_id}`);
      } else {
        throw new Error('Gagal memulai percakapan');
      }
    } catch (err: any) {
      console.error('Failed to open chat:', err);
      alert(err.message || 'Gagal membuka ruang chat');
    } finally {
      setChatLoadingId(null);
    }
  };

  const filteredDisputes = disputes.filter((order) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      order.id.toLowerCase().includes(query) ||
      (order.product_name && order.product_name.toLowerCase().includes(query)) ||
      (order.buyer_name && order.buyer_name.toLowerCase().includes(query)) ||
      (order.seller_name && order.seller_name.toLowerCase().includes(query)) ||
      (order.complaint_reason && order.complaint_reason.toLowerCase().includes(query)) ||
      (order.complaint_description && order.complaint_description.toLowerCase().includes(query))
    );
  });

  const pendingCount = disputes.filter(
    (d) => d.status === 'KOMPLAIN_DIPROSES' || d.status === 'MASA_KOMPLAIN'
  ).length;

  return (
    <main className="relative flex-1 bg-gr-paper min-h-[calc(100vh-76px)] flex flex-col py-8 px-4 sm:px-6 lg:px-8">
      <BgPattern />
      <FilmGrain />

      <div className="relative max-w-6xl mx-auto w-full space-y-6 z-10">
        {/* TOP HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gr-line pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-amber-700 text-white rounded-sm shadow-xs">
                <ShieldCheck size={18} />
              </span>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-gr-ink">
                Pusat Sengketa & Mediasi Escrow
              </h1>
            </div>
            <p className="font-sans text-xs text-gr-ink-soft">
              Panel khusus Administrator untuk mediasi obrolan langsung, verifikasi bukti komplain, dan eksekusi resolusi dana escrow.
            </p>
          </div>

          {currentUser && !isForbidden && (
            <div className="flex items-center gap-3 self-start sm:self-auto">
              <span className="font-mono text-xs text-gr-ink-soft px-2.5 py-1 bg-white border border-gr-line rounded-sm">
                Login: <strong>{currentUser.email}</strong>
              </span>
              <Button
                variant="ghost"
                onClick={() => loadDisputes()}
                disabled={isLoading}
                className="border border-gr-line bg-white hover:bg-gr-paper font-mono text-xs font-bold uppercase tracking-wider px-3.5 py-2 rounded-sm cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw size={13} className={cn(isLoading && "animate-spin")} />
                <span>Segarkan</span>
              </Button>
            </div>
          )}
        </div>

        {/* SUCCESS MESSAGE BANNER */}
        <AnimatePresence>
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 bg-emerald-50 text-emerald-900 border border-emerald-300 rounded-sm text-xs flex items-center justify-between gap-3 shadow-xs"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
                <span className="font-sans font-medium">{successMessage}</span>
              </div>
              <button 
                onClick={() => setSuccessMessage(null)}
                className="text-emerald-700 hover:text-emerald-950 font-mono text-xs cursor-pointer"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* VIEW 1: AUTH LOADING */}
        {isAuthChecking ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white border border-gr-line rounded-sm">
            <Loader2 className="h-8 w-8 text-gr-board animate-spin opacity-60 mb-2" />
            <p className="font-mono text-xs text-gr-ink-soft">Memeriksa hak akses administrator...</p>
          </div>
        ) : !currentUser ? (
          /* VIEW 2: NOT LOGGED IN */
          <div className="max-w-md mx-auto my-12 bg-white border border-gr-line rounded-sm p-8 shadow-md text-center space-y-6">
            <div className="inline-flex p-3 bg-amber-100/80 text-amber-900 rounded-full">
              <Lock size={28} />
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-2xl font-bold text-gr-ink">
                Masuk dengan Akun Admin
              </h2>
              <p className="font-sans text-xs text-gr-ink-soft">
                Silakan masuk dengan akun Administrator Grove Anda untuk mengakses pengelolaan sengketa.
              </p>
            </div>

            <Link href="/login" className="block">
              <Button className="w-full bg-gr-board hover:bg-gr-board/90 text-gr-chalk font-mono text-xs font-bold uppercase tracking-wider py-2.5 rounded-sm cursor-pointer flex items-center justify-center gap-2">
                <LogIn size={15} />
                <span>Masuk Sekarang</span>
              </Button>
            </Link>
          </div>
        ) : isForbidden ? (
          /* VIEW 3: LOGGED IN BUT NOT ADMIN ACCOUNT */
          <div className="max-w-md mx-auto my-12 bg-white border border-red-200 rounded-sm p-8 shadow-md text-center space-y-6">
            <div className="inline-flex p-3 bg-red-100 text-red-900 rounded-full">
              <ShieldAlert size={28} />
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-2xl font-bold text-red-950">
                Akses Terbatas untuk Admin
              </h2>
              <p className="font-sans text-xs text-gr-ink-soft leading-relaxed">
                Akun yang sedang aktif (<strong>{currentUser.email}</strong>) bukan merupakan akun Administrator resmi yang terdaftar untuk mengelola sengketa.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link href="/beranda" className="flex-1">
                <Button variant="ghost" className="w-full border border-gr-line font-mono text-xs font-bold uppercase tracking-wider py-2 rounded-sm cursor-pointer">
                  Ke Beranda
                </Button>
              </Link>
              <Link href="/login" className="flex-1">
                <Button className="w-full bg-gr-board hover:bg-gr-board/90 text-gr-chalk font-mono text-xs font-bold uppercase tracking-wider py-2 rounded-sm cursor-pointer">
                  Ganti Akun
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          /* VIEW 4: AUTHORIZED ADMIN DASHBOARD */
          <div className="space-y-6">
            {/* CONTROLS & FILTER BAR */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-4 border border-gr-line rounded-sm">
              {/* Tab Filters */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleFilterChange('pending')}
                  className={cn(
                    "px-3.5 py-2 rounded-sm font-mono text-xs font-bold uppercase tracking-wider transition-all border cursor-pointer flex items-center gap-2",
                    statusFilter === 'pending'
                      ? "bg-amber-700 text-white border-amber-700"
                      : "bg-white text-gr-ink-soft border-gr-line hover:text-gr-ink"
                  )}
                >
                  <AlertTriangle size={13} />
                  <span>Menunggu Resolusi</span>
                  {pendingCount > 0 && (
                    <span className={cn(
                      "px-1.5 py-0.2 rounded-full text-[10px]",
                      statusFilter === 'pending' ? "bg-white text-amber-900" : "bg-amber-100 text-amber-900"
                    )}>
                      {pendingCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => handleFilterChange('all')}
                  className={cn(
                    "px-3.5 py-2 rounded-sm font-mono text-xs font-bold uppercase tracking-wider transition-all border cursor-pointer",
                    statusFilter === 'all'
                      ? "bg-gr-board text-gr-chalk border-gr-board"
                      : "bg-white text-gr-ink-soft border-gr-line hover:text-gr-ink"
                  )}
                >
                  <span>Semua Sengketa & Histori</span>
                </button>
              </div>

              {/* Search Box */}
              <div className="relative w-full sm:w-72">
                <Search size={14} className="absolute left-3 top-2.5 text-gr-ink-soft/60" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari ID, nama pembeli, petani..."
                  className="w-full pl-9 pr-3 py-1.5 border border-gr-line rounded-sm text-xs font-sans focus:outline-none focus:border-gr-board bg-white"
                />
              </div>
            </div>

            {/* DISPUTES LIST */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 bg-white border border-gr-line rounded-sm">
                <Loader2 className="h-8 w-8 text-gr-board animate-spin opacity-60 mb-2" />
                <p className="font-mono text-xs text-gr-ink-soft">Memuat data sengketa...</p>
              </div>
            ) : filteredDisputes.length > 0 ? (
              <div className="space-y-5">
                {filteredDisputes.map((order) => {
                  const isPending = order.status === 'KOMPLAIN_DIPROSES' || order.status === 'MASA_KOMPLAIN';
                  const totalBill = order.price_per_kg ? order.price_per_kg * order.quantity_kg : 0;

                  return (
                    <div
                      key={order.id}
                      className={cn(
                        "bg-white border rounded-sm transition-all overflow-hidden shadow-xs",
                        isPending ? "border-amber-500/40 hover:border-amber-500" : "border-gr-line"
                      )}
                    >
                      {/* CARD HEADER */}
                      <div className="bg-[#FAF9F5] px-5 py-3 border-b border-gr-line flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3">
                          <span className="font-sans font-bold text-gr-ink">
                            No. Pesanan <span className="font-mono text-gr-board">#{order.id.slice(0, 8)}</span>
                          </span>
                          <span className="text-gr-line">|</span>
                          <span className="text-gr-ink-soft font-sans">
                            {formatWIBDate(order.created_at)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-sm border font-mono text-[10px] font-bold uppercase tracking-wider",
                            isPending ? "bg-amber-500/10 text-amber-800 border-amber-500/30" :
                            order.status === 'SELESAI' ? "bg-emerald-50 text-emerald-800 border-emerald-300" :
                            "bg-red-50 text-red-800 border-red-300"
                          )}>
                            {isPending ? 'Dalam Peninjauan Sengketa' : order.status}
                          </span>

                          <span className="px-2 py-0.5 bg-gr-paper text-gr-ink-soft border border-gr-line rounded-sm font-mono text-[10px] font-bold uppercase tracking-wider">
                            Escrow: {order.escrow_status || 'NOT_STARTED'}
                          </span>
                        </div>
                      </div>

                      {/* CARD BODY */}
                      <div className="p-6 space-y-6">
                        {/* PRODUCT & COMPLAINT SUMMARY */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          {/* Col 1: Product Info */}
                          <div className="flex items-start gap-4">
                            <div className="h-16 w-16 shrink-0 rounded-sm border border-gr-line bg-gr-paper overflow-hidden">
                              {order.product_photo_url ? (
                                <img
                                  src={order.product_photo_url}
                                  alt={order.product_name}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-gr-ink-soft/40">
                                  <Package size={24} />
                                </div>
                              )}
                            </div>
                            <div className="space-y-1">
                              <h3 className="font-display text-lg font-bold text-gr-ink capitalize">
                                {order.product_name || 'Hasil Panen'}
                              </h3>
                              <p className="font-mono text-xs text-gr-ink-soft">
                                {order.quantity_kg} KG @ Rp {Math.round(order.price_per_kg || 0).toLocaleString('id-ID')}
                              </p>
                              <p className="font-display font-bold text-gr-board text-base">
                                Total: Rp {Math.round(totalBill).toLocaleString('id-ID')}
                              </p>
                            </div>
                          </div>

                          {/* Col 2: Parties Involved & In-App Chat Buttons */}
                          <div className="space-y-3 border-t lg:border-t-0 lg:border-l border-gr-line pt-4 lg:pt-0 lg:pl-6 text-xs font-sans">
                            {/* Buyer Contact & Chat */}
                            <div className="space-y-1.5">
                              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink-soft block">
                                Pihak Pembeli
                              </span>
                              <p className="font-bold text-gr-ink">{order.buyer_name || 'Pembeli'}</p>
                              {order.buyer_phone && (
                                <p className="text-gr-ink-soft flex items-center gap-1.5 text-[11px]">
                                  <Phone size={11} /> {order.buyer_phone}
                                </p>
                              )}
                              <div className="pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleStartInAppChat(order.buyer_id, order.product_id, false)}
                                  disabled={chatLoadingId === order.buyer_id}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-gr-board bg-white text-gr-board hover:bg-gr-board/10 font-sans text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                                >
                                  {chatLoadingId === order.buyer_id ? (
                                    <Loader2 size={12} className="animate-spin" />
                                  ) : (
                                    <MessageSquare size={12} />
                                  )}
                                  <span>Chat dengan Pembeli</span>
                                </button>
                              </div>
                            </div>

                            {/* Seller Contact & Chat */}
                            <div className="space-y-1.5 pt-3 border-t border-gr-line/60">
                              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink-soft block">
                                Pihak Petani / Penjual
                              </span>
                              <p className="font-bold text-gr-ink">{order.seller_name || 'Petani'}</p>
                              {order.seller_phone && (
                                <p className="text-gr-ink-soft flex items-center gap-1.5 text-[11px]">
                                  <Phone size={11} /> {order.seller_phone}
                                </p>
                              )}
                              <div className="pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleStartInAppChat(order.seller_id, order.product_id, true)}
                                  disabled={chatLoadingId === order.seller_id}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-gr-board bg-white text-gr-board hover:bg-gr-board/10 font-sans text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                                >
                                  {chatLoadingId === order.seller_id ? (
                                    <Loader2 size={12} className="animate-spin" />
                                  ) : (
                                    <MessageSquare size={12} />
                                  )}
                                  <span>Chat dengan Petani</span>
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Col 3: Complaint Detail */}
                          <div className="border-t lg:border-t-0 lg:border-l border-gr-line pt-4 lg:pt-0 lg:pl-6 space-y-2">
                            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                              <AlertTriangle size={12} className="text-amber-600" />
                              Detail Keluhan Pembeli
                            </span>
                            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-sm text-xs space-y-1.5">
                              <p className="font-bold text-amber-950">
                                Alasan: <span className="font-normal text-amber-900">{order.complaint_reason || '-'}</span>
                              </p>
                              <p className="italic text-amber-900/90 leading-relaxed">
                                "{order.complaint_description || '-'}"
                              </p>
                              {order.complained_at && (
                                <p className="text-[10px] text-amber-800/70 font-mono pt-1">
                                  Diajukan: {formatWIBDate(order.complained_at)}
                                </p>
                              )}
                            </div>

                            {order.admin_note && (
                              <div className="p-2.5 bg-gr-paper border border-gr-line rounded-sm text-xs space-y-0.5">
                                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink-soft block">
                                  Catatan Keputusan Admin:
                                </span>
                                <p className="font-sans text-gr-ink">{order.admin_note}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* RESOLUTION ACTION FOOTER */}
                        {isPending && (
                          <div className="pt-4 border-t border-gr-line flex flex-wrap items-center justify-between gap-3 bg-amber-50/40 -mx-6 -mb-6 p-4">
                            <span className="text-xs font-sans text-amber-950 font-medium flex items-center gap-2">
                              <ShieldAlert size={15} className="text-amber-700 shrink-0" />
                              Lakukan mediasi via Chat dengan kedua pihak sebelum menentukan keputusan sengketa.
                            </span>

                            <Button
                              onClick={() => handleOpenResolveModal(order)}
                              className="bg-amber-700 hover:bg-amber-800 text-white font-mono text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-sm cursor-pointer shadow-xs flex items-center gap-1.5"
                            >
                              <ShieldCheck size={14} />
                              <span>Eksekusi Resolusi Sengketa</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-gr-line rounded-sm bg-white p-8">
                <CheckCircle2 className="h-12 w-12 text-emerald-600/40 mb-3" />
                <h3 className="font-display text-xl font-bold text-gr-ink">
                  Tidak Ada Sengketa Ditemukan
                </h3>
                <p className="font-sans text-xs text-gr-ink-soft max-w-sm mt-1">
                  {statusFilter === 'pending'
                    ? 'Saat ini tidak ada pesanan yang sedang bersengketa atau menunggu tindakan admin.'
                    : 'Belum ada riwayat pesanan bersengketa dalam sistem.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL EKSEKUSI RESOLUSI SENGKETA */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-xl bg-white rounded-sm border border-gr-line p-6 shadow-2xl space-y-5"
          >
            <div className="space-y-1 border-b border-gr-line pb-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-bold text-gr-ink flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-amber-700" />
                  Resolusi Sengketa Transaksi
                </h3>
                <span className="font-mono text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-xs border border-amber-300">
                  #{selectedOrder.id.slice(0, 8)}
                </span>
              </div>
              <p className="font-sans text-xs text-gr-ink-soft">
                Tentukan keputusan akhir untuk transaksi ini setelah mengumpulkan bukti dari pembeli dan petani.
              </p>
            </div>

            {/* Transaction Brief */}
            <div className="p-3 bg-gr-paper border border-gr-line rounded-sm text-xs space-y-1 font-sans">
              <div className="flex justify-between">
                <span className="text-gr-ink-soft">Produk:</span>
                <span className="font-bold text-gr-ink">{selectedOrder.product_name} ({selectedOrder.quantity_kg} KG)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gr-ink-soft">Total Nilai Escrow:</span>
                <span className="font-mono font-bold text-gr-board">
                  Rp {Math.round((selectedOrder.price_per_kg || 0) * selectedOrder.quantity_kg).toLocaleString('id-ID')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gr-ink-soft">Keluhan Pembeli:</span>
                <span className="font-medium text-amber-900">{selectedOrder.complaint_reason} - "{selectedOrder.complaint_description}"</span>
              </div>
            </div>

            <form onSubmit={handleExecuteResolution} className="space-y-4 pt-1">
              {/* Action Decision Selection */}
              <div className="space-y-2">
                <label className="block font-mono text-xs font-bold uppercase tracking-wider text-gr-ink">
                  Pilih Keputusan Admin <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => setResolveAction('REFUND_BUYER')}
                    className={cn(
                      "p-3.5 rounded-sm border cursor-pointer transition-all space-y-1.5",
                      resolveAction === 'REFUND_BUYER'
                        ? "bg-red-50/80 border-red-500 text-red-950 ring-1 ring-red-500"
                        : "bg-white border-gr-line hover:border-gr-ink-soft/40 text-gr-ink"
                    )}
                  >
                    <div className="flex items-center justify-between font-bold text-xs">
                      <span>Refund ke Pembeli</span>
                      <span className={cn(
                        "h-3.5 w-3.5 rounded-full border flex items-center justify-center",
                        resolveAction === 'REFUND_BUYER' ? "border-red-600 bg-red-600" : "border-gr-line"
                      )}>
                        {resolveAction === 'REFUND_BUYER' && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </span>
                    </div>
                    <p className="text-[11px] text-gr-ink-soft leading-snug">
                      Batalkan pesanan, kembalikan dana escrow ke pembeli, dan kembalikan stok produk.
                    </p>
                  </div>

                  <div
                    onClick={() => setResolveAction('RELEASE_SELLER')}
                    className={cn(
                      "p-3.5 rounded-sm border cursor-pointer transition-all space-y-1.5",
                      resolveAction === 'RELEASE_SELLER'
                        ? "bg-emerald-50/80 border-emerald-600 text-emerald-950 ring-1 ring-emerald-600"
                        : "bg-white border-gr-line hover:border-gr-ink-soft/40 text-gr-ink"
                    )}
                  >
                    <div className="flex items-center justify-between font-bold text-xs">
                      <span>Cairkan ke Penjual</span>
                      <span className={cn(
                        "h-3.5 w-3.5 rounded-full border flex items-center justify-center",
                        resolveAction === 'RELEASE_SELLER' ? "border-emerald-600 bg-emerald-600" : "border-gr-line"
                      )}>
                        {resolveAction === 'RELEASE_SELLER' && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </span>
                    </div>
                    <p className="text-[11px] text-gr-ink-soft leading-snug">
                      Selesaikan pesanan dan cairkan dana escrow ke rekening bank petani/penjual.
                    </p>
                  </div>
                </div>
              </div>

              {/* Admin Note Field */}
              <div className="space-y-1.5">
                <label className="block font-mono text-xs font-bold uppercase tracking-wider text-gr-ink">
                  Catatan Investigasi / Hasil Mediasi (Opsional)
                </label>
                <textarea
                  rows={3}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Catatan hasil diskusi dengan pembeli dan petani terkait keputusan..."
                  className="w-full border border-gr-line rounded-sm p-2.5 text-xs font-sans focus:outline-none focus:border-gr-board resize-none"
                />
              </div>

              {/* Error Box */}
              {resolveError && (
                <div className="p-3 bg-red-50 text-red-900 border border-red-200 rounded-sm text-xs flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  <span className="font-sans">{resolveError}</span>
                </div>
              )}

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gr-line">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setSelectedOrder(null)}
                  disabled={isSubmitting}
                  className="border border-gr-line font-mono text-xs font-bold uppercase tracking-wider px-4 py-2 cursor-pointer"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className={cn(
                    "text-white font-mono text-xs font-bold uppercase tracking-wider px-5 py-2 cursor-pointer flex items-center gap-2 shadow-xs",
                    resolveAction === 'REFUND_BUYER'
                      ? "bg-red-700 hover:bg-red-800"
                      : "bg-emerald-700 hover:bg-emerald-800"
                  )}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Memproses Keputusan...
                    </>
                  ) : (
                    resolveAction === 'REFUND_BUYER' ? 'Eksekusi Refund Pembeli' : 'Eksekusi Pencairan Penjual'
                  )}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </main>
  );
}
