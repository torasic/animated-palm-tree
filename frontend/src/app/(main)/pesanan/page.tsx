'use client';

import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ordersApi, useOrderSocket } from '@/lib/api/orders';
import { demandRequestsApi, useDemandSocket } from '@/lib/api/demand-requests';
import { productsApi } from '@/lib/api/products';
import { authApi } from '@/lib/api/auth';
import { conversationsApi } from '@/lib/api/conversations';
import { Button } from '@/components/ui/button';
import { RatingForm } from '@/components/ratings/rating-form';
import { BgPattern } from '@/components/effects/bg-pattern';
import { RatingBadge } from '@/components/ratings/rating-badge';
import { FilmGrain } from '@/components/effects/film-grain';
import { Package, Clock, CheckCircle2, Truck, XCircle, Loader2, ShoppingBag, ClipboardList, Tag, Trash2, AlertTriangle, ShieldCheck, History, CreditCard, Banknote, User, Users, Edit, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { Pagination } from '@/components/ui/pagination';

function OrdersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [user, setUser] = useState<any | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'incoming' | 'purchases' | 'history' | 'demands' | 'products'>('incoming');
  const [page, setPage] = useState(1);
  const [limitGrid, setLimitGrid] = useState(6);
  const [limitList, setLimitList] = useState(10);

  const loadOrders = async (userRole: string, tab: 'incoming' | 'purchases' | 'history' | 'demands' | 'products', currentUser?: any) => {
    setIsLoading(true);
    try {
      const FETCH_LIMIT = 100; // Large limit to safely fetch all items for client-side pagination (backend max is 100)
      let data: any[] = [];

      const activeUser = currentUser || user;
      const userId = activeUser?.id;

      if (tab === 'products') {
        data = await productsApi.getMyProducts();
      } else if (tab === 'demands') {
        data = await demandRequestsApi.getCommittedDemandRequests();
        if (userRole === 'PETANI') {
          // Hide matched demands from the "demands" tab for farmers
          data = data.filter((d: any) => !d.match_transaction);
        }
      } else if (userRole === 'PETANI' && (tab === 'incoming' || tab === 'history')) {
        const [incomingOrders, committedDemands] = await Promise.all([
          ordersApi.getIncomingOrders(0, FETCH_LIMIT),
          demandRequestsApi.getCommittedDemandRequests()
        ]);

        const matchedDemands = committedDemands
          .filter((d: any) => d.match_transaction && d.match_transaction.seller_id === userId)
          .map((d: any) => ({ ...d, isDemand: true }));

        data = [...incomingOrders, ...matchedDemands];
      } else if (tab === 'history') {
        if (userRole === 'PETANI') {
          data = await ordersApi.getIncomingOrders(0, FETCH_LIMIT);
        } else {
          data = await ordersApi.getMyPurchases(0, FETCH_LIMIT);
        }
      } else if (userRole === 'PETANI') {
        if (tab === 'incoming') {
          data = await ordersApi.getIncomingOrders(0, FETCH_LIMIT);
        } else {
          data = await ordersApi.getMyPurchases(0, FETCH_LIMIT);
        }
      } else {
        data = await ordersApi.getMyPurchases(0, FETCH_LIMIT);
      }

      setOrders(data);
    } catch (err) {
      console.error('Failed to load orders/products:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserAndOrders = async () => {
    try {
      const userData = await authApi.getMe();
      setUser(userData);
      
      const queryTab = searchParams.get('tab');
      const queryPage = searchParams.get('page');
      
      const initialTab = (queryTab as any) || (userData.role === 'PETANI' ? 'incoming' : 'purchases');
      const initialPage = queryPage ? parseInt(queryPage, 10) : 1;
      
      setActiveTab(initialTab);
      setPage(initialPage);
      
      await loadOrders(userData.role, initialTab, userData);
    } catch (err: any) {
      if (err.status !== 401) {
        console.error('Failed to get user/orders:', err);
      }
      router.replace('/login');
    }
  };

  useEffect(() => {
    fetchUserAndOrders();
  }, []);

  // Synchronize state from URL params
  useEffect(() => {
    if (!user) return;
    const queryTab = searchParams.get('tab') as any;
    const queryPage = searchParams.get('page');
    
    const targetTab = queryTab || (user.role === 'PETANI' ? 'incoming' : 'purchases');
    const targetPage = queryPage ? parseInt(queryPage, 10) : 1;
    
    if (targetTab !== activeTab) {
      setActiveTab(targetTab);
      loadOrders(user.role, targetTab, user);
    }
    setPage(targetPage);
  }, [searchParams, user]);

  const handleTabChange = (tab: 'incoming' | 'purchases' | 'history' | 'demands' | 'products') => {
    if (!user) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    params.set('page', '1');
    params.delete('status'); // Clear success/failed status when navigating between tabs
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', activeTab);
    params.set('page', newPage.toString());
    params.delete('status'); // Clear success/failed status when changing pages
    router.push(`${pathname}?${params.toString()}`);
    
    // Smooth scroll to top of list container
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleLimitChange = (newLimit: number) => {
    if (activeTab === 'products') {
      setLimitGrid(newLimit);
    } else {
      setLimitList(newLimit);
    }
    
    // Reset to page 1 in state and URL when items per page limit changes
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', activeTab);
    params.set('page', '1');
    params.delete('status'); // Clear success/failed status when changing limit
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleUpdate = () => {
    if (!user) return;
    loadOrders(user.role, activeTab, user);
  };

  const getFilteredData = () => {
    if (activeTab === 'products') {
      return orders;
    }
    if (activeTab === 'demands') {
      return orders;
    }
    if (activeTab === 'incoming') {
      return orders.filter(o => {
        if (o.isDemand) {
          const escrowStatus = o.match_transaction?.escrow_status;
          return escrowStatus !== 'released' && escrowStatus !== 'refunded';
        }
        return o.status !== 'SELESAI' && o.status !== 'DIBATALKAN';
      });
    }
    if (activeTab === 'purchases') {
      return orders.filter(o => o.status !== 'SELESAI' && o.status !== 'DIBATALKAN');
    }
    if (activeTab === 'history') {
      return orders.filter(o => {
        if (o.isDemand) {
          const escrowStatus = o.match_transaction?.escrow_status;
          return escrowStatus === 'released' || escrowStatus === 'refunded';
        }
        return o.status === 'SELESAI' || o.status === 'DIBATALKAN';
      });
    }
    return [];
  };

  const getEmptyState = () => {
    if (activeTab === 'incoming') {
      return {
        title: 'Tidak Ada Pesanan Masuk Aktif',
        desc: 'Belum ada pesanan baru masuk dari pembeli.'
      };
    } else if (activeTab === 'purchases') {
      return {
        title: 'Tidak Ada Pesanan Aktif',
        desc: 'Semua transaksi Anda telah selesai atau dibatalkan. Kunjungi Riwayat & Ulasan untuk menilai pesanan.'
      };
    } else if (activeTab === 'products') {
      return {
        title: 'Kamu belum melisting produk',
        desc: 'Mulai tawarkan hasil panenmu di marketplace melalui halaman Jual.'
      };
    } else if (activeTab === 'history') {
      return {
        title: 'Belum Ada Riwayat Pesanan',
        desc: 'Pesanan yang telah selesai atau dibatalkan akan muncul di sini.'
      };
    } else {
      return {
        title: 'Belum ada permintaan diterima',
        desc: user?.role === 'PETANI'
          ? 'Belum ada permintaan masuk yang dikomit atau dicocokkan.'
          : 'Belum ada petani/peternak yang menyetujui/berkomitmen pada permintaan hasil panen/ternakmu.'
      };
    }
  };

  const filteredData = getFilteredData();
  const totalItems = filteredData.length;
  const itemsPerPage = activeTab === 'products' ? limitGrid : limitList;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  // Safe page indexing
  const currentPage = Math.max(1, Math.min(page, totalPages || 1));

  const displayedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const emptyState = getEmptyState();

  return (
    <main className="relative flex-1 bg-gr-paper lg:h-[calc(100vh-76px)] lg:max-h-[calc(100vh-76px)] lg:overflow-hidden flex flex-col">
      <BgPattern />
      <FilmGrain />

      <div className="relative z-10 w-full h-full flex flex-col min-h-0 px-4 sm:px-8 py-6 max-w-[1100px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 flex-1 min-h-0 items-stretch overflow-hidden">
          
          {/* COLUMN 1: Masthead & Vertical Tab Selectors (Left) */}
          <div className="flex flex-col lg:border-r lg:border-dashed lg:border-gr-line/40 lg:pr-8 h-full space-y-6 shrink-0">
            <div className="space-y-4">
              <header className="select-none">
                <span className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-gr-board">
                  Transaksi
                </span>
                <h1 className="mt-2 font-display text-4xl font-semibold text-gr-ink leading-tight">
                  Daftar Pesanan
                </h1>
                <p className="mt-2 font-sans text-xs text-gr-ink-soft leading-relaxed">
                  Kelola pesanan masuk, pembelian hasil panen, supply, dan listing marketplace aktif secara terpusat.
                </p>
              </header>
              <div className="h-px bg-gradient-to-r from-gr-line via-gr-line/45 to-transparent" />
            </div>

            {/* Vertical Index Tabs */}
            {user && (
              <div className="flex flex-col space-y-3">
                {user.role === 'PETANI' && (
                  <button
                    onClick={() => handleTabChange('incoming')}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3 rounded-sm font-mono text-xs font-bold uppercase tracking-wider transition-all duration-200 border cursor-pointer",
                      activeTab === 'incoming'
                        ? "bg-gr-board text-gr-chalk border-gr-board "
                        : "bg-white/40 text-gr-ink-soft border-gr-line hover:text-gr-ink hover:bg-white/60"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Package size={14} />
                      Pesanan Masuk
                    </span>
                    <span className="text-[10px] opacity-60">→</span>
                  </button>
                )}
                <button
                  onClick={() => handleTabChange('purchases')}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-sm font-mono text-xs font-bold uppercase tracking-wider transition-all duration-200 border cursor-pointer",
                    activeTab === 'purchases'
                      ? "bg-gr-board text-gr-chalk border-gr-board "
                      : "bg-white/40 text-gr-ink-soft border-gr-line hover:text-gr-ink hover:bg-white/60"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <ShoppingBag size={14} />
                    Pesanan Saya
                  </span>
                  <span className="text-[10px] opacity-60">→</span>
                </button>

                <button
                  onClick={() => handleTabChange('history')}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-sm font-mono text-xs font-bold uppercase tracking-wider transition-all duration-200 border cursor-pointer",
                    activeTab === 'history'
                      ? "bg-gr-board text-gr-chalk border-gr-board "
                      : "bg-white/40 text-gr-ink-soft border-gr-line hover:text-gr-ink hover:bg-white/60"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <History size={14} />
                    Riwayat & Ulasan
                  </span>
                  <span className="text-[10px] opacity-60">→</span>
                </button>

                <button
                  onClick={() => handleTabChange('demands')}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-sm font-mono text-xs font-bold uppercase tracking-wider transition-all duration-200 border cursor-pointer",
                    activeTab === 'demands'
                      ? "bg-gr-board text-gr-chalk border-gr-board "
                      : "bg-white/40 text-gr-ink-soft border-gr-line hover:text-gr-ink hover:bg-white/60"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <ClipboardList size={14} />
                    Permintaan Terpenuhi
                  </span>
                  <span className="text-[10px] opacity-60">→</span>
                </button>

                {user.role === 'PETANI' && (
                  <button
                    onClick={() => handleTabChange('products')}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3 rounded-sm font-mono text-xs font-bold uppercase tracking-wider transition-all duration-200 border cursor-pointer",
                      activeTab === 'products'
                        ? "bg-gr-board text-gr-chalk border-gr-board "
                        : "bg-white/40 text-gr-ink-soft border-gr-line hover:text-gr-ink hover:bg-white/60"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Tag size={14} />
                      Produk Saya
                    </span>
                    <span className="text-[10px] opacity-60">→</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* COLUMN 2: Scrollable Active Content List (Right) */}
          <div 
            ref={scrollContainerRef}
            className="flex-1 min-w-0 h-full overflow-y-auto pr-1.5 custom-scrollbar pb-6"
          >
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-32">
                <Loader2 className="h-10 w-10 text-gr-board animate-spin opacity-60" />
              </div>
            ) : filteredData.length > 0 ? (
              <div className="w-full space-y-6">
                <AnimatePresence mode="popLayout">
                  {activeTab === 'products' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                      {displayedData.map((product) => (
                        <FarmerProductCard 
                          key={product.id} 
                          product={product} 
                          onUpdate={handleUpdate} 
                        />
                      ))}
                    </div>
                  ) : activeTab === 'demands' ? (
                    <div className="space-y-6">
                      {displayedData.map((demand, index) => (
                        <DemandCard 
                          key={demand.id} 
                          demand={demand} 
                          index={index} 
                          onUpdate={handleUpdate} 
                          role={user?.role}
                        />
                      ))}
                    </div>
                  ) : activeTab === 'incoming' ? (
                    <div className="space-y-6">
                      {displayedData.map((item, index) => (
                        item.isDemand ? (
                          <DemandCard 
                            key={item.id} 
                            demand={item} 
                            index={index} 
                            onUpdate={handleUpdate} 
                            role={user?.role}
                          />
                        ) : (
                          <OrderCard 
                            key={item.id} 
                            order={item} 
                            index={index} 
                            onUpdate={handleUpdate} 
                            isIncoming={true}
                          />
                        )
                      ))}
                    </div>
                  ) : activeTab === 'purchases' ? (
                    <div className="space-y-6">
                      {displayedData.map((order, index) => (
                        <OrderCard 
                          key={order.id} 
                          order={order} 
                          index={index} 
                          onUpdate={handleUpdate} 
                          isIncoming={false}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {displayedData.map((item, index) => (
                        item.isDemand ? (
                          <DemandCard 
                            key={item.id} 
                            demand={item} 
                            index={index} 
                            onUpdate={handleUpdate} 
                            role={user?.role}
                          />
                        ) : (
                          <OrderCard 
                            key={item.id} 
                            order={item} 
                            index={index} 
                            onUpdate={handleUpdate} 
                            isIncoming={user?.role === 'PETANI'}
                          />
                        )
                      ))}
                    </div>
                  )}
                </AnimatePresence>

                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  itemsPerPage={itemsPerPage}
                  onPageChange={handlePageChange}
                  onLimitChange={handleLimitChange}
                  limitOptions={activeTab === 'products' ? [6, 12, 24] : [10, 20, 50]}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-gr-line rounded-sm bg-white/40 p-8  w-full">
                <Package className="h-12 w-12 text-gr-ink-soft/30 mb-4" />
                <span className="font-display text-2xl font-semibold text-gr-ink">
                  {emptyState.title}
                </span>
                <p className="mt-2 font-sans text-sm text-gr-ink-soft max-w-xs">
                  {emptyState.desc}
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </main>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={
      <main className="relative flex-1 bg-gr-paper lg:h-[calc(100vh-76px)] lg:max-h-[calc(100vh-76px)] lg:overflow-hidden flex flex-col justify-center items-center">
        <Loader2 className="h-10 w-10 text-gr-board animate-spin opacity-60" />
      </main>
    }>
      <OrdersPageContent />
    </Suspense>
  );
}

function OrderCard({ 
  order, 
  index, 
  onUpdate, 
  isIncoming 
}: { 
  order: any; 
  index: number; 
  onUpdate: () => void; 
  isIncoming: boolean; 
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [buyerConfirmedAt, setBuyerConfirmedAt] = useState<string | null>(order.buyer_confirmed_at);
  const [hasBuyerRated, setHasBuyerRated] = useState<boolean>(order.has_buyer_rated);
  const router = useRouter();
  const [chatLoading, setChatLoading] = useState(false);

  const handleContact = async () => {
    try {
      setChatLoading(true);
      let res;
      if (isIncoming) {
        // Current user is seller, want to chat with buyer
        res = await conversationsApi.createConversation(order.product_id, undefined, order.buyer_id);
      } else {
        // Current user is buyer, want to chat with seller
        res = await conversationsApi.createConversation(order.product_id, order.seller_id, undefined);
      }
      if (res && res.conversation_id) {
        router.push(`/chat/${res.conversation_id}`);
      } else {
        throw new Error('Gagal memulai percakapan');
      }
    } catch (err: any) {
      console.error('Failed to start chat:', err);
      alert(err.message || 'Gagal memulai chat dengan pengguna');
    } finally {
      setChatLoading(false);
    }
  };
  
  const liveData = useOrderSocket(order.id);
  const liveStatus = liveData.status;
  const currentStatus = liveStatus || order.status;
  const currentPaymentStatus = liveData.payment_status || order.payment_status;
  const currentEscrowStatus = liveData.escrow_status || order.escrow_status;
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const handleConfirmSuccess = async () => {
    try {
      setIsConfirming(true);
      const updatedOrder = await ordersApi.confirmOrderSuccess(order.id);
      setBuyerConfirmedAt(updatedOrder.buyer_confirmed_at);
      onUpdate();
    } catch (err) {
      console.error('Failed to confirm success:', err);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCheckout = async () => {
    try {
      setIsCheckingOut(true);
      const successUrl = `${window.location.origin}/pesanan?status=success`;
      const failureUrl = `${window.location.origin}/pesanan?status=failed`;
      const res = await ordersApi.checkoutOrder(order.id, successUrl, failureUrl);
      if (res.invoice_url) {
        window.location.href = res.invoice_url;
      } else {
        alert('Gagal membuat link pembayaran');
      }
    } catch (err: any) {
      console.error(err);
      alert(`Gagal memulai proses checkout pembayaran: ${err.message || err}`);
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleEscrowConfirmReceived = async () => {
    try {
      setIsConfirming(true);
      await ordersApi.confirmOrderReceived(order.id);
      setBuyerConfirmedAt(new Date().toISOString());
      onUpdate();
    } catch (err: any) {
      console.error(err);
      alert(`Gagal mengonfirmasi penerimaan barang: ${err.message || err}`);
    } finally {
      setIsConfirming(false);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status.toUpperCase()) {
      case 'DIPESAN': 
      case 'MENUNGGU_KONFIRMASI':
        return { icon: Clock, pillStyle: 'bg-gr-board/10 text-gr-board border-gr-board/20', label: 'Menunggu Konfirmasi' };
      case 'DIKONFIRMASI': 
      case 'DIPROSES':
        return { icon: CheckCircle2, pillStyle: 'bg-gr-up/10 text-gr-up border-gr-up/20', label: 'Diproses' };
      case 'SIAP_DIAMBIL': 
        return { icon: Truck, pillStyle: 'bg-gr-board/10 text-gr-board border-gr-board/20', label: 'Siap Diambil' };
      case 'DIKIRIM':
        return { icon: Truck, pillStyle: 'bg-gr-board/10 text-gr-board border-gr-board/20', label: 'Dikirim' };
      case 'DITERIMA':
        return { icon: CheckCircle2, pillStyle: 'bg-gr-up/10 text-gr-up border-gr-up/20', label: 'Diterima' };
      case 'SELESAI': 
        return { icon: CheckCircle2, pillStyle: 'bg-gr-paper text-gr-ink-soft border-gr-line', label: 'Selesai' };
      case 'BATAL': 
      case 'DIBATALKAN':
        return { icon: XCircle, pillStyle: 'bg-gr-down/10 text-gr-down border-gr-down/20', label: 'Dibatalkan' };
      default: 
        return { icon: Package, pillStyle: 'bg-gr-paper text-gr-ink border-gr-line', label: status };
    }
  };

  const config = getStatusConfig(currentStatus);
  const StatusIcon = config.icon;

  const handleStatusChange = async (newStatus: string) => {
    try {
      setIsUpdating(true);
      await ordersApi.updateOrderStatus(order.id, newStatus);
      onUpdate();
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const formattedDate = new Date(order.created_at).toLocaleDateString('id-ID', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });

  const contactName = isIncoming ? order.buyer_name : order.seller_name;
  const contactRoleLabel = isIncoming ? 'Pembeli' : 'Penjual/Petani/Peternak';
  const basePrice = (order.price_per_kg || 0) * (order.quantity_kg || 0);
  const estimatedAdminFee = Math.round(basePrice * 0.02);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="group relative rounded-sm bg-white border border-gr-line   hover:border-gr-board/30 transition-all duration-200 overflow-hidden"
    >
      {/* 1. ELEGANT TOP HEADER BAR */}
      <div className="bg-[#FAF9F5] px-5 py-3 border-b border-gr-line flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-sans font-bold text-gr-ink text-xs">
            No. Pesanan <span className="font-mono text-gr-board">#{order.id.slice(0, 8)}</span>
          </span>
          <span className="text-gr-line">|</span>
          <span className="font-sans text-gr-ink-soft text-xs">
            {formattedDate}
          </span>
          {liveStatus && (
            <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-gr-up animate-pulse font-bold bg-gr-up/10 px-2 py-0.5 rounded-xs border border-gr-up/20">
              <span className="h-1.5 w-1.5 rounded-full bg-gr-up" />
              Live
            </span>
          )}
        </div>

        <div className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-sm border text-[10px] font-sans font-bold uppercase tracking-wider ",
          (currentStatus === 'MENUNGGU_KONFIRMASI' || currentStatus === 'DIPESAN') && "bg-amber-500/5 text-amber-800 border-amber-500/20",
          (currentStatus === 'DIKONFIRMASI' || currentStatus === 'DIPROSES' || currentStatus === 'DITERIMA') && "bg-emerald-50 text-emerald-800 border-[#C8E6C9]",
          (currentStatus === 'SELESAI') && "bg-gr-board/5 text-gr-board border-gr-line",
          (currentStatus === 'BATAL' || currentStatus === 'DIBATALKAN') && "bg-red-50 text-gr-down border-gr-down/20"
        )}>
          <span className={cn(
            "h-1.5 w-1.5 rounded-full shrink-0",
            (currentStatus === 'MENUNGGU_KONFIRMASI' || currentStatus === 'DIPESAN') ? "bg-amber-500 animate-pulse" :
            (currentStatus === 'BATAL' || currentStatus === 'DIBATALKAN') ? "bg-gr-down" : "bg-gr-up"
          )} />
          <span>{config.label}</span>
        </div>
      </div>

      {/* 2. CARD CONTENT BODY: Product Photo, Info, Total, and Toggle Button */}
      <div className="p-5 flex flex-col sm:flex-row items-center justify-between gap-5">
        <div className="flex items-center gap-4 flex-1 min-w-0 w-full">
          {/* Product Thumbnail */}
          <Link
            href={`/produk/${order.product_id}`}
            className="relative h-20 w-20 sm:h-22 sm:w-22 shrink-0 overflow-hidden rounded-sm border border-gr-line bg-gr-paper/80  hover:border-gr-board/40 transition-all group/thumb"
          >
            {order.product_photo_url ? (
              <img
                src={order.product_photo_url}
                alt={order.product_name || 'Hasil Panen'}
                className="h-full w-full object-cover transition-transform duration-300 group-hover/thumb:scale-105"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                  if (fallback) fallback.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={cn(
              "flex h-full w-full flex-col items-center justify-center text-gr-ink-soft/40 bg-gr-paper p-2 text-center",
              order.product_photo_url ? "hidden" : ""
            )}>
              <Package size={28} className="text-gr-board/50" />
            </div>
          </Link>

          {/* Product Title & Details */}
          <div className="flex-1 min-w-0">
            <Link href={`/produk/${order.product_id}`} className="hover:underline decoration-gr-board/40">
              <h3 className="font-display text-2xl font-normal tracking-tight text-gr-ink capitalize truncate" title={order.product_name || 'Hasil Panen'}>
                {order.product_name || 'Hasil Panen'}
              </h3>
            </Link>
            
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap font-mono text-xs text-gr-ink-soft">
              <span className="font-bold text-gr-ink">
                {order.quantity_kg} KG
              </span>
              {order.price_per_kg && (
                <span>
                  @ Rp {Math.round(order.price_per_kg).toLocaleString('id-ID')} / KG
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Total Price (Toggle Action is now full-width at the bottom of the card) */}
        <div className="text-left sm:text-right w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-gr-line/40 shrink-0">
          <span className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold mb-0.5">Total Tagihan</span>
          <span className="font-display text-2xl font-bold text-gr-board">
            {order.price_per_kg ? `Rp ${Math.round(order.price_per_kg * order.quantity_kg).toLocaleString('id-ID')}` : '-'}
          </span>
        </div>
      </div>

      {/* 3. EXPANDED DETAILS SECTION */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-gr-line p-6 space-y-6"
          >
            {/* Cancellation Banner if canceled */}
            {currentStatus === 'DIBATALKAN' && order.cancellation_reason && (
              <div className="p-3 bg-gr-down/10 text-gr-down border border-gr-down/20 rounded-sm text-xs flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="font-sans leading-relaxed">
                  <p className="font-bold">Pesanan Dibatalkan:</p>
                  <p className="mt-0.5 opacity-90">
                    {order.cancellation_reason === 'TIMEOUT_PENGAMBILAN' && 'Pembatalan otomatis karena batas waktu pengambilan habis.'}
                    {order.cancellation_reason === 'PETANI_MENOLAK' && 'Pesanan ditolak oleh penjual/petani/peternak.'}
                    {order.cancellation_reason === 'TIMEOUT_KONFIRMASI' && 'Dibatalkan otomatis oleh sistem karena penjual tidak memberikan konfirmasi pesanan tepat waktu.'}
                    {order.cancellation_reason === 'TIMEOUT_PENGAMBILAN' && 'Dibatalkan otomatis oleh sistem karena barang tidak diambil tepat waktu.'}
                  </p>
                </div>
              </div>
            )}

            {/* SECTION A: STATUS PEMBAYARAN & INFORMASI KONTAK */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              {/* Payment Status Details */}
              <div className="space-y-4">
                <h4 className="font-mono text-[10px] font-bold uppercase tracking-widest text-gr-ink-soft flex items-center gap-2">
                  <ShieldCheck size={13} />
                  Status Transaksi
                </h4>
                <div className="space-y-2.5 pt-1 text-xs font-sans">
                  <div className="flex items-center justify-between">
                    <span className="text-gr-ink-soft">Status Pembayaran</span>
                    <div className="flex items-center gap-1.5 font-bold">
                      <span className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        currentPaymentStatus === 'paid' ? "bg-gr-up" : "bg-amber-500 animate-pulse"
                      )} />
                      <span className={cn(
                        "font-sans text-xs",
                        currentPaymentStatus === 'paid' ? "text-gr-up" : "text-amber-700"
                      )}>
                        {currentPaymentStatus === 'paid' ? 'Lunas' : 'Belum Dibayar'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gr-ink-soft">Status Pesanan</span>
                    <span className="font-bold text-gr-ink">{config.label}</span>
                  </div>
                </div>
              </div>

              {/* Farmer Contact Info */}
              <div className="space-y-4">
                <h4 className="font-mono text-[10px] font-bold uppercase tracking-widest text-gr-ink-soft flex items-center gap-2">
                  <User size={13} />
                  Kontak {contactRoleLabel}
                </h4>
                <div className="space-y-2.5 pt-1 text-xs font-sans">
                  <div className="flex items-center justify-between">
                    <span className="text-gr-ink-soft">Nama</span>
                    <span className="font-bold text-gr-ink">{contactName || 'Petani/Peternak'}</span>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={handleContact}
                      disabled={chatLoading}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-sm border border-gr-board text-gr-board hover:bg-gr-board/10 font-sans text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                    >
                      {chatLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <MessageSquare size={13} />
                      )}
                      <span>Chat {isIncoming ? 'Pembeli' : 'Petani/Peternak'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION B: PAYMENT OPTIONS LIST */}
            {currentStatus !== 'DIBATALKAN' && (
              <div className="space-y-3">
                <h4 className="font-mono text-[10px] font-bold uppercase tracking-widest text-gr-ink-soft flex items-center gap-2">
                  <CreditCard size={13} />
                  Pilihan Pembayaran
                </h4>
 
                <div className="space-y-3 text-xs font-sans">
                  {/* Option 1: Payment Gateway Rekber */}
                  <div className="flex items-center gap-3">
                    <CreditCard size={16} className="text-gr-ink-soft shrink-0" />
                    <div className="space-y-0.5">
                      <span className="font-bold text-gr-ink block">Transfer Bank & QRIS (Rekening Bersama)</span>
                      <p className="text-gr-ink-soft text-xs leading-relaxed">
                        Dana ditahan secara aman oleh sistem dan diteruskan setelah Anda mengonfirmasi penerimaan barang. Perkiraan biaya admin/gerbang pembayaran sebesar <strong className="font-semibold text-gr-ink">Rp {Math.round(estimatedAdminFee).toLocaleString('id-ID')}</strong> (2% dari total tagihan).
                      </p>
                    </div>
                  </div>
 
                  {/* Option 2: Cash / COD */}
                  <div className="flex items-center gap-3">
                    <Banknote size={16} className="text-gr-ink-soft shrink-0" />
                    <div className="space-y-0.5">
                      <span className="font-bold text-gr-ink block">Pembayaran Tunai (Cash / COD)</span>
                      <p className="text-gr-ink-soft text-xs leading-relaxed">
                        Dapat dibayar tunai langsung saat penimbangan & serah terima barang. <strong className="font-semibold text-gr-ink">Tanpa biaya admin tambahan (Gratis biaya transaksi)</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION C: ACTION FOOTER */}
            {!isIncoming && (
              <div className="pt-2 border-t border-gr-line flex flex-wrap items-center justify-end gap-3">
                {currentPaymentStatus !== 'paid' && (currentStatus === 'MENUNGGU_KONFIRMASI' || currentStatus === 'DIPESAN') && (
                  <Button
                    disabled={isUpdating}
                    variant="ghost"
                    onClick={() => handleStatusChange('DIBATALKAN')}
                    className="border border-gr-down/40 text-gr-down hover:bg-gr-down/10 bg-white font-mono text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-sm cursor-pointer transition-all "
                  >
                    {isUpdating ? 'Memproses...' : 'Batalkan Pesanan'}
                  </Button>
                )}

                {currentPaymentStatus !== 'paid' && currentStatus !== 'DIBATALKAN' && (
                  <Button
                    disabled={isCheckingOut}
                    onClick={handleCheckout}
                    className="bg-gr-board hover:bg-gr-board/90 text-gr-chalk border border-gr-board font-mono text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-sm cursor-pointer  transition-all flex items-center justify-center gap-2"
                  >
                    {isCheckingOut ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Memproses Pembayaran...
                      </>
                    ) : (
                      'Bayar Online (QRIS / VA)'
                    )}
                  </Button>
                )}

                {currentPaymentStatus === 'paid' && currentEscrowStatus === 'held' && !buyerConfirmedAt && (
                  <Button
                    disabled={isConfirming}
                    onClick={handleEscrowConfirmReceived}
                    className="bg-gr-board hover:bg-gr-board/90 text-gr-chalk font-mono text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-sm cursor-pointer  transition-all"
                  >
                    {isConfirming ? 'Memproses...' : 'Konfirmasi Barang Diterima'}
                  </Button>
                )}

                {currentPaymentStatus !== 'paid' && (currentStatus === 'SIAP_DIAMBIL' || currentStatus === 'DIKIRIM') && !buyerConfirmedAt && (
                  <Button
                    disabled={isConfirming}
                    onClick={handleConfirmSuccess}
                    className="bg-gr-board hover:bg-gr-board/90 text-gr-chalk font-mono text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-sm cursor-pointer  transition-all"
                  >
                    {isConfirming ? 'Memproses...' : 'Konfirmasi Barang Diterima'}
                  </Button>
                )}

                {buyerConfirmedAt && !hasBuyerRated && (
                  <div className="w-full pt-2">
                    <RatingForm
                      transactionType="PRODUCT_PURCHASE"
                      referenceId={order.id}
                      onSuccess={() => {
                        setHasBuyerRated(true);
                        onUpdate();
                      }}
                      label="Nilai Penjual (Petani/Peternak)"
                    />
                  </div>
                )}

                {hasBuyerRated && (
                  <div className="flex items-center gap-2 text-gr-up text-xs font-mono font-bold uppercase tracking-wider">
                    <CheckCircle2 size={16} />
                    <span>Rating Telah Dikirim</span>
                  </div>
                )}
              </div>
            )}

            {/* Farmer actions */}
            {isIncoming && currentStatus !== 'SELESAI' && currentStatus !== 'BATAL' && currentStatus !== 'DIBATALKAN' && (
              <div className="flex flex-wrap gap-3 pt-3 border-t border-gr-line">
                {(currentStatus === 'DIPESAN' || currentStatus === 'MENUNGGU_KONFIRMASI') && (
                  <>
                    <Button
                      disabled={isUpdating}
                      onClick={() => handleStatusChange('DIPROSES')}
                      className="bg-gr-board hover:bg-gr-board/90 text-gr-chalk font-mono text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-sm cursor-pointer  transition-all"
                    >
                      Konfirmasi Pesanan
                    </Button>
                    <Button
                      disabled={isUpdating}
                      variant="ghost"
                      onClick={() => handleStatusChange('DIBATALKAN')}
                      className="border border-gr-down/30 text-gr-down hover:bg-gr-down/10 font-mono text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-sm cursor-pointer transition-all"
                    >
                      Tolak
                    </Button>
                  </>
                )}
                {(currentStatus === 'DIKONFIRMASI' || currentStatus === 'DIPROSES') && (
                  <Button
                    disabled={isUpdating}
                    onClick={() => handleStatusChange('SIAP_DIAMBIL')}
                    className="bg-gr-board hover:bg-gr-board/90 text-gr-chalk font-mono text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-sm cursor-pointer  transition-all"
                  >
                    Tandai Siap Diambil
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
 
      {/* Full-width toggle at the bottom of the card */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full py-2.5 bg-[#FAF9F5] hover:bg-gr-line/10 text-gr-ink border-t border-gr-line font-mono text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5"
      >
        <span>{isExpanded ? 'Sembunyikan Detail' : 'Detail Pesanan'}</span>
        <span className="text-[9px]">{isExpanded ? '▲' : '▼'}</span>
      </button>
    </motion.div>
  );
}

function DemandCard({ 
  demand, 
  index, 
  onUpdate, 
  role 
}: { 
  demand: any; 
  index: number; 
  onUpdate: () => void; 
  role: string; 
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasPetaniRated, setHasPetaniRated] = useState<boolean>(demand.has_petani_rated);
  const liveData = useDemandSocket(demand.id);
  const currentStatus = liveData?.status || demand.status;
  const currentCommitted = liveData?.quantity_kg_committed !== undefined ? liveData.quantity_kg_committed : demand.quantity_kg_committed;
  const router = useRouter();
  const [chatLoading, setChatLoading] = useState(false);

  const handleContactPetani = async (petaniId: string) => {
    try {
      setChatLoading(true);
      const res = await conversationsApi.createConversation(undefined, petaniId, undefined);
      if (res && res.conversation_id) {
        router.push(`/chat/${res.conversation_id}`);
      } else {
        throw new Error('Gagal memulai percakapan');
      }
    } catch (err: any) {
      alert(err.message || 'Gagal memulai chat dengan petani/peternak');
    } finally {
      setChatLoading(false);
    }
  };

  const handleContactBuyer = async () => {
    try {
      setChatLoading(true);
      const res = await conversationsApi.createConversation(undefined, undefined, demand.buyer_id);
      if (res && res.conversation_id) {
        router.push(`/chat/${res.conversation_id}`);
      } else {
        throw new Error('Gagal memulai percakapan');
      }
    } catch (err: any) {
      console.error('Failed to start chat:', err);
      alert(err.message || 'Gagal memulai chat dengan pembeli');
    } finally {
      setChatLoading(false);
    }
  };

  // Dynamic matched transaction info
  const matchedTx = demand.match_transaction ? {
    ...demand.match_transaction,
    payment_status: liveData?.payment_status || demand.match_transaction.payment_status,
    escrow_status: liveData?.escrow_status || demand.match_transaction.escrow_status,
  } : null;

  const getStatusConfig = (status: string, hasMatch: boolean) => {
    if (hasMatch) {
      return { icon: CheckCircle2, pillStyle: 'bg-gr-up/10 text-gr-up border-gr-up/20', label: 'Telah Dicocokkan' };
    }
    switch (status.toUpperCase()) {
      case 'DITOLAK':
        return { icon: Clock, pillStyle: 'bg-gr-board/10 text-gr-board border-gr-board/20', label: 'Dikomit Petani/Peternak' };
      case 'TERPENUHI': 
        return { icon: CheckCircle2, pillStyle: 'bg-gr-up/10 text-gr-up border-gr-up/20', label: 'Terpenuhi' };
      case 'DIBATALKAN': 
        return { icon: XCircle, pillStyle: 'bg-gr-down/10 text-gr-down border-gr-down/20', label: 'Dibatalkan' };
      default: 
        return { icon: Package, pillStyle: 'bg-gr-paper text-gr-ink-soft border-gr-line', label: 'Kedaluwarsa' };
    }
  };

  const config = getStatusConfig(currentStatus, !!matchedTx);
  const StatusIcon = config.icon;

  const formattedDate = new Date(demand.created_at).toLocaleDateString('id-ID', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });

  const isBuyer = role === 'PEMBELI';

  const buyerName = demand.buyer_name || 'Pembeli';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="group relative rounded-sm bg-white border border-gr-line   hover:border-gr-board/30 transition-all duration-200 overflow-hidden"
    >
      {/* 1. TOP HEADER BAR: Request Meta & Status */}
      <div className="bg-[#FAF9F5] px-5 py-3 border-b border-gr-line flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-bold text-gr-ink uppercase tracking-wider bg-white px-2.5 py-1 rounded-sm border border-gr-line ">
            REQUEST ID: {demand.id.slice(0, 8)}
          </span>
          <span className="font-sans text-gr-ink-soft text-[11px]">
            Diajukan pada <strong className="text-gr-ink font-medium">{formattedDate}</strong>
          </span>
          {liveData && (
            <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-gr-up animate-pulse font-bold bg-gr-up/10 px-2 py-0.5 rounded-xs border border-gr-up/20">
              <span className="h-1.5 w-1.5 rounded-full bg-gr-up" />
              Live
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className={cn("flex items-center gap-1.5 px-3 py-1 rounded-sm border font-mono text-[10px] uppercase font-bold tracking-wider ", config.pillStyle)}>
            <StatusIcon size={12} />
            <span>{config.label}</span>
          </div>
        </div>
      </div>

      {/* 2. CARD CONTENT BODY: Commodity Icon, Info, Progress, and Toggle Button */}
      <div className="p-5 flex flex-col sm:flex-row items-center justify-between gap-5">
        <div className="flex items-center gap-4 flex-1 min-w-0 w-full">
          {/* Styled Specimen-tag style Placeholder */}
          <div className="relative h-20 w-20 sm:h-22 sm:w-22 shrink-0 overflow-hidden rounded-sm border border-dashed border-gr-board/25 bg-[#FAF9F5] flex flex-col items-center justify-center text-center p-1.5 select-none">
            <ClipboardList size={22} className="text-gr-board/50 mb-1" />
            <span className="font-mono text-[8px] uppercase tracking-widest text-gr-ink-soft/60">Permintaan</span>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-display text-2xl font-normal tracking-tight text-gr-ink capitalize truncate" title={demand.commodity_name}>
              {demand.commodity_name}
            </h3>

            {matchedTx ? (
              <div className="mt-2 flex flex-col gap-1 text-xs border-t border-gr-line/45 pt-2 font-sans w-full">
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-mono">
                  <span className="font-bold text-gr-board bg-gr-board/5 px-2 py-0.5 rounded-xs border border-gr-board/15">
                    Harga: Rp {Math.round(matchedTx.price_per_kg).toLocaleString('id-ID')}/KG
                  </span>
                  <span className="font-bold text-gr-up bg-gr-up/5 px-2 py-0.5 rounded-xs border border-gr-up/15">
                    Total: Rp {Math.round(matchedTx.amount).toLocaleString('id-ID')} ({matchedTx.quantity_kg} KG)
                  </span>
                  <span className={cn(
                    "font-bold px-2 py-0.5 rounded-xs border",
                    matchedTx.payment_status === 'paid' 
                      ? "bg-gr-up/10 text-gr-up border-gr-up/20" 
                      : "bg-amber-500/10 text-amber-700 border-amber-500/20"
                  )}>
                    {matchedTx.payment_status === 'paid' ? 'LUNAS' : 'MENUNGGU PEMBAYARAN'}
                  </span>
                  {matchedTx.escrow_status && matchedTx.escrow_status !== 'not_started' && (
                    <span className={cn(
                      "font-bold px-2 py-0.5 rounded-xs border",
                      matchedTx.escrow_status === 'held' && "bg-amber-500/10 text-amber-700 border-amber-500/20",
                      matchedTx.escrow_status === 'released' && "bg-gr-up/10 text-gr-up border-gr-up/20",
                      matchedTx.escrow_status === 'disputed' && "bg-gr-down/10 text-gr-down border-gr-down/20"
                    )}>
                      {matchedTx.escrow_status === 'held' && 'DANA DITAHAN'}
                      {matchedTx.escrow_status === 'released' && 'DANA DICAIRKAN'}
                      {matchedTx.escrow_status === 'disputed' && 'SENGKETA'}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-baseline gap-6 flex-wrap">
                <div>
                  <span className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold mb-0.5">Target Kebutuhan</span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-2xl font-bold text-gr-board">
                      {demand.quantity_kg_needed}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold">KG</span>
                  </div>
                </div>
                <div>
                  <span className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold mb-0.5">Telah Terkomit</span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-2xl font-bold text-gr-up">
                      {currentCommitted}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold">KG</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-gr-line p-5 md:p-6 space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="space-y-3">
                  <div className="flex justify-between items-baseline text-xs font-sans text-gr-ink-soft">
                    <span className="font-mono text-[10px] uppercase tracking-wider font-bold">Progress Pemenuhan</span>
                    <span className="text-gr-board font-mono font-bold text-sm">
                      {Math.min(100, Math.round((currentCommitted / demand.quantity_kg_needed) * 100))}%
                    </span>
                  </div>
                  <div className="w-full bg-gr-line/20 h-2.5 rounded-sm overflow-hidden border border-gr-line">
                    <div 
                      className="bg-gr-board h-full rounded-xs transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.round((currentCommitted / demand.quantity_kg_needed) * 100))}%` }}
                    />
                  </div>
                  <div className="font-sans text-xs text-gr-ink-soft">
                    <span>Deadline: {new Date(demand.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
                
                <div className="mt-4">
                  <Link 
                    href={`/permintaan/${demand.id}`}
                    className="inline-flex items-center gap-2 font-mono text-xs uppercase font-bold tracking-wider text-gr-board ink-link cursor-pointer hover:opacity-90"
                  >
                    <span>Buka Halaman Detail</span>
                    <span className="text-[10px] tracking-normal">→</span>
                  </Link>
                </div>
              </div>

              <div>
                {isBuyer ? (
                  <div>
                    <h3 className="font-display font-semibold text-xs text-gr-ink border-b border-gr-line/45 pb-2 mb-3">
                      Komitmen Petani/Peternak ({demand.commitments?.length || 0})
                    </h3>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                      {demand.commitments && demand.commitments.length > 0 ? (
                        demand.commitments.map((commit: any) => {
                          return (
                            <div key={commit.id} className="py-3 flex justify-between items-center text-sm font-sans border-b border-gr-line/45 last:border-b-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-gr-ink font-semibold">{commit.petani_name || 'Petani/Peternak'}</p>
                                <p className="text-gr-up text-xs font-mono font-bold mt-0.5">+{commit.quantity_kg_committed} KG</p>
                              </div>
                              {commit.petani_id && (
                                <button
                                  onClick={() => handleContactPetani(commit.petani_id)}
                                  disabled={chatLoading}
                                  className="p-2 rounded-sm bg-gr-board hover:opacity-90 text-gr-chalk transition-all cursor-pointer  disabled:opacity-50"
                                  title="Chat Petani/Peternak"
                                >
                                  {chatLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <MessageSquare className="h-4 w-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="border border-dashed border-gr-line/60 bg-white/20 p-6 rounded-sm text-center flex flex-col items-center justify-center">
                          <Users className="h-6 w-6 text-gr-ink-soft/40 mb-2" />
                          <p className="text-xs font-sans text-gr-ink-soft italic">
                            Belum ada komitmen supply dari petani/peternak.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <h4 className="font-mono text-[10px] font-bold uppercase tracking-widest text-gr-ink-soft mb-2">
                      Informasi Kontak Pembeli
                    </h4>
                    <div className="space-y-3 font-sans">
                      <div className="text-sm">
                        <div className="flex items-center gap-2">
                          <p className="text-gr-ink font-semibold text-base">{buyerName}</p>
                          <div className="flex items-center justify-center shrink-0">
                            <RatingBadge
                              avgRating={demand.buyer_rating_avg}
                              ratingCount={demand.buyer_rating_count}
                              size="sm"
                              newLabel="Pembeli Baru"
                              countSuffix="permintaan"
                            />
                          </div>
                        </div>
                      </div>
                      {demand.buyer_id && (
                        <button
                          onClick={handleContactBuyer}
                          disabled={chatLoading}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-sm bg-gr-board text-gr-chalk hover:opacity-90 font-mono text-xs font-bold uppercase tracking-wider transition-all  cursor-pointer disabled:opacity-50"
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

            {/* Petani Rating action */}
            {role === 'PETANI' && currentStatus === 'TERPENUHI' && (
              <div className="pt-4 border-t border-gr-line">
                {!hasPetaniRated ? (
                  <RatingForm
                    transactionType="DEMAND_FULFILLMENT"
                    referenceId={demand.id}
                    onSuccess={() => {
                      setHasPetaniRated(true);
                      onUpdate();
                    }}
                    label="Nilai Pembeli"
                  />
                ) : (
                  <div className="flex items-center gap-2 text-gr-up text-xs font-mono font-bold uppercase tracking-wider">
                    <CheckCircle2 size={16} />
                    <span>Rating Telah Dikirim</span>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
 
      {/* Full-width toggle at the bottom of the card */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full py-2.5 bg-[#FAF9F5] hover:bg-gr-line/10 text-gr-ink border-t border-gr-line font-mono text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5"
      >
        <span>{isExpanded ? 'Sembunyikan Detail' : 'Detail Permintaan'}</span>
        <span className="text-[9px]">{isExpanded ? '▲' : '▼'}</span>
      </button>
    </motion.div>
  );
}

function FarmerProductCard({
  product,
  onUpdate
}: {
  product: any;
  onUpdate: () => void;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/produk/${product.id}/edit`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await productsApi.deleteProduct(product.id);
      setIsConfirmOpen(false);
      onUpdate();
    } catch (err) {
      console.error('Failed to withdraw product:', err);
      alert('Gagal menarik produk dari pasar.');
    } finally {
      setIsDeleting(false);
    }
  };

  const formattedDate = new Date(product.created_at).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => router.push(`/produk/${product.id}`)}
        className="group relative flex flex-col w-full max-w-[260px] mx-auto p-3 pb-4 bg-white/60 backdrop-blur-sm border border-gr-line rounded-sm hover:border-gr-ink/30  transition-all cursor-pointer select-none"
      >
        {/* Polaroid Product Photo */}
        <div className="relative aspect-square w-full overflow-hidden bg-black/5 border border-gr-line rounded-sm">
          {product.photo_url ? (
            <img
              src={product.photo_url}
              alt={product.name}
              className="h-full w-full object-cover grayscale-[0.15] group-hover:grayscale-0 transition-all duration-300"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gr-ink-soft/40">
              <Package size={32} />
            </div>
          )}
          
          {/* Status Stamp overlay inside the photo */}
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-sm border border-gr-board/20 bg-white/80 backdrop-blur-xs text-gr-board font-mono text font-bold uppercase tracking-wider ">
            {product.status}
          </div>
        </div>

        {/* Product Details Info */}
        <div className="mt-3 flex-1 flex flex-col justify-between min-w-0">
          <div>
            <span className="font-mono text-[9px] uppercase font-bold tracking-widest text-gr-ink-soft/70 block">
              {product.category}
            </span>
            <h3 className="font-display text-base font-bold text-gr-ink leading-tight mt-0.5 truncate" title={product.name}>
              {product.name}
            </h3>
            
            <div className="mt-3.5 space-y-1.5 font-sans text-xs">
              <div className="flex justify-between text-gr-ink-soft/80 border-b border-dashed border-gr-line/30 pb-1">
                <span>Jual:</span>
                <span className="font-mono font-bold text-gr-ink">Rp {product.price_per_kg.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-gr-ink-soft/80 border-b border-dashed border-gr-line/30 pb-1">
                <span>Stok:</span>
                <span className="font-mono font-bold text-gr-ink">{product.quantity_kg} KG</span>
              </div>
              {product.reference_price_per_kg && (
                <div className="flex justify-between text-gr-ink-soft/80 pb-0.5">
                  <span>Acuan:</span>
                  <span className="font-mono font-bold text-gr-board">Rp {product.reference_price_per_kg.toLocaleString('id-ID')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer: Date & Actions */}
          <div className="mt-4 pt-3 border-t border-gr-line/45 flex flex-col gap-2">
            <div className="flex justify-between items-center text-[9px] text-gr-ink-soft/50 font-sans italic">
              <span>Listing:</span>
              <span>{formattedDate}</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleEditClick}
                className="flex-1 flex items-center justify-center gap-1 py-2 bg-white/20 border border-gr-line hover:border-gr-green text-gr-ink-soft hover:text-gr-bg hover:bg-gr-green font-mono text-[9px] font-bold uppercase tracking-widest rounded-sm transition-all duration-200 cursor-pointer "
              >
                <Edit size={10} />
                Edit
              </button>
              <button
                onClick={handleDeleteClick}
                disabled={isDeleting}
                className="flex-1 flex items-center justify-center gap-1 py-2 bg-white/20 border border-gr-line hover:border-gr-down text-gr-ink-soft hover:text-gr-chalk hover:bg-gr-down font-mono text-[9px] font-bold uppercase tracking-widest rounded-sm transition-all duration-200 cursor-pointer disabled:opacity-50 "
              >
                {isDeleting ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <Trash2 size={10} />
                )}
                Hapus
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Hapus Produk"
        description={
          <div className="space-y-3 font-sans">
            <p className="text-gr-ink-soft leading-relaxed">
              Apakah Anda yakin ingin menghapus produk ini? Produk tidak akan terlihat oleh pembeli dan penawaran di pasar akan ditutup.
            </p>
            <div className="border border-dashed border-gr-ink/20 bg-white/35 p-3 rounded-none flex items-center justify-between font-mono text-[9px] text-gr-ink-soft">
              <div>
                <span className="block text text-gr-ink-soft/60 uppercase tracking-widest mb-0.5">Komoditas</span>
                <span className="text-gr-ink font-bold uppercase tracking-wider">{product.name}</span>
              </div>
              <div className="text-right">
                <span className="block text text-gr-ink-soft/60 uppercase tracking-widest mb-0.5">Stok Listing</span>
                <span className="text-gr-ink font-bold">{product.quantity_kg} KG</span>
              </div>
            </div>
          </div>
        }
        confirmText="Ya, Hapus"
        cancelText="Batal"
        variant="danger"
        isLoading={isDeleting}
      />
    </>
  );
}
