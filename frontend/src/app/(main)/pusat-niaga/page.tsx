'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { referencePricesApi } from '@/lib/api/reference-prices';
import { productsApi } from '@/lib/api/products';
import { demandRequestsApi } from '@/lib/api/demand-requests';
import { authApi } from '@/lib/api/auth';
import { RatingBadge } from '@/components/ratings/rating-badge';
import { BgPattern } from '@/components/effects/bg-pattern';
import { FilmGrain } from '@/components/effects/film-grain';
import { Glow } from '@/components/effects/glow';
import { Search, Calendar, Loader2, TrendingUp, ChevronDown, Info, Tag, ShoppingBag, Scale, Check, Users, X, MapPin, Star } from 'lucide-react';
import { createPortal } from 'react-dom';
import { provinceCentroids } from '@/lib/data/province-centroids';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

const MapViewSkeleton = () => (
  <div className="h-full w-full min-h-[380px] bg-white/10 border border-gr-line/15 rounded-sm animate-pulse relative overflow-hidden select-none p-4 flex flex-col justify-between">
    {/* Map controls placeholder */}
    <div className="flex flex-col gap-1 w-8">
      <div className="h-8 w-8 bg-gr-ink/10 border border-gr-line/10 rounded-sm" />
      <div className="h-8 w-8 bg-gr-ink/10 border border-gr-line/10 rounded-sm" />
    </div>
    
    {/* Centered locator circle */}
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="h-40 w-40 rounded-full border border-gr-board/10 flex items-center justify-center">
        <div className="h-24 w-24 rounded-full border border-gr-board/15 flex items-center justify-center animate-ping">
          <div className="h-4 w-4 rounded-full bg-gr-board/20" />
        </div>
      </div>
    </div>
    
    {/* Map legend placeholder at bottom */}
    <div className="mt-auto self-end bg-gr-paper/60 backdrop-blur-sm border border-gr-line/15 p-2 rounded-sm w-36 space-y-1.5 z-10">
      <div className="h-2 w-16 bg-gr-ink/10 rounded-sm" />
      <div className="h-2.5 w-24 bg-gr-ink/15 rounded-sm" />
    </div>
  </div>
);

// Dynamically import the consolidated MapView component (disabling SSR)
const MapView = dynamic(() => import('@/components/products/map-view'), {
  ssr: false,
  loading: () => <MapViewSkeleton />
});

function getRelativeTime(dateString: string | null) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 1000 / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Baru saja';
  if (diffMins < 60) return `${diffMins} menit lalu`;
  if (diffHours < 24) return `${diffHours} jam lalu`;
  return `${diffDays} hari lalu`;
}

// Module-level in-memory cache for instant subsequent page visits
let cachedPricesData: { items: any[]; distinct_commodities: string[] } | null = null;

export default function HargaPasarPage() {
  // Mode selection state
  const [activeTab, setActiveTab] = useState<'pricing' | 'products' | 'demands'>('pricing');
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<any | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    setMounted(true);
    const fetchUser = async () => {
      try {
        const userData = await authApi.getMe();
        setUser(userData);
      } catch {
        setUser(null);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (activeTab === 'demands' && user && user.role !== 'PETANI') {
      setActiveTab('pricing');
    }
  }, [activeTab, user]);

  // Explicit flyTo coordinates (to target from list card click)
  const [flyToCoords, setFlyToCoords] = useState<[number, number] | null>(null);

  // Demands state
  const [demandRequests, setDemandRequests] = useState<any[]>([]);
  const [fetchingDemands, setFetchingDemands] = useState<boolean>(false);

  // Selected demand requests for comparison & commitment
  const [comparisonDemands, setComparisonDemands] = useState<any[]>([]);
  // Quantities for each demand (keyed by demand ID)
  const [commitQuantities, setCommitQuantities] = useState<Record<string | number, string>>({});
  // Errors for each demand (keyed by demand ID)
  const [commitErrors, setCommitErrors] = useState<Record<string | number, string>>({});
  // Submitting state for each demand (keyed by demand ID)
  const [submittingCommits, setSubmittingCommits] = useState<Record<string | number, boolean>>({});

  // Track if user has manually selected a province to prevent override by background geolocation success
  const isManuallySelectedRef = useRef<boolean>(false);

  // Helper to find a region case-insensitively
  const findMatchingRegion = useCallback((provName: string | null, available: string[]) => {
    if (!provName) return null;
    return available.find((r) => r.toLowerCase() === provName.toLowerCase()) || null;
  }, []);

  // Harga Referensi state
  const [allPrices, setAllPrices] = useState<any[]>(() => cachedPricesData?.items || []);
  const [commodities, setCommodities] = useState<string[]>(() => cachedPricesData?.distinct_commodities || []);
  const [selectedProvince, setSelectedProvince] = useState<string | null>(() => {
    if (cachedPricesData?.items?.length) {
      const counts: Record<string, number> = {};
      cachedPricesData.items.forEach((item) => {
        if (item.region && item.region !== 'Nasional') {
          counts[item.region] = (counts[item.region] || 0) + 1;
        }
      });
      if (counts['Di Yogyakarta']) return 'Di Yogyakarta';
      if (counts['DI Yogyakarta']) return 'Di Yogyakarta';
      if (counts['Jawa Timur']) return 'Jawa Timur';
      if (counts['DKI Jakarta']) return 'DKI Jakarta';
      
      let maxRegion = 'Jawa Timur';
      let maxCount = 0;
      Object.entries(counts).forEach(([reg, cnt]) => {
        if (cnt > maxCount) {
          maxCount = cnt;
          maxRegion = reg;
        }
      });
      return maxRegion;
    }
    return 'Di Yogyakarta';
  });
  const [selectedCommodity, setSelectedCommodity] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Geolocation & Status
  const [loading, setLoading] = useState<boolean>(() => !cachedPricesData && allPrices.length === 0);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  // Produk Terdekat state
  const [nearbyProducts, setNearbyProducts] = useState<any[]>([]);
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [fetchingProducts, setFetchingProducts] = useState<boolean>(false);

  // Group prices by province (excluding National averages)
  const pricesByProvince = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    allPrices.forEach((price) => {
      const region = price.region;
      if (region && region !== 'Nasional') {
        if (!grouped[region]) {
          grouped[region] = [];
        }
        grouped[region].push(price);
      }
    });
    return grouped;
  }, [allPrices]);

  // List of provinces containing data
  const availableProvinces = useMemo(() => {
    return Object.keys(pricesByProvince).sort();
  }, [pricesByProvince]);

  // Calculate default/fallback province
  const selectFallbackProvince = useCallback((items: any[]) => {
    const counts: Record<string, number> = {};
    items.forEach((item) => {
      const region = item.region;
      if (region && region !== 'Nasional') {
        counts[region] = (counts[region] || 0) + 1;
      }
    });
    if (counts['Di Yogyakarta']) return 'Di Yogyakarta';
    if (counts['DI Yogyakarta']) return 'Di Yogyakarta';
    if (counts['Jawa Timur']) return 'Jawa Timur';
    if (counts['DKI Jakarta']) return 'DKI Jakarta';
    if (counts['Jawa Barat']) return 'Jawa Barat';

    let maxRegion = 'Jawa Timur';
    let maxCount = 0;
    Object.entries(counts).forEach(([reg, cnt]) => {
      if (cnt > maxCount) {
        maxCount = cnt;
        maxRegion = reg;
      }
    });
    return maxRegion;
  }, []);

  const handleSelectProvince = useCallback((prov: string) => {
    isManuallySelectedRef.current = true;
    setSelectedProvince(prov);
  }, []);

  // Fetch nearby products helper
  const fetchNearbyProducts = useCallback(async (lat: number, lng: number, radius: number) => {
    setFetchingProducts(true);
    try {
      const data = await productsApi.getNearbyProducts(lat, lng, radius);
      setNearbyProducts(data);
    } catch (err) {
      console.error('Failed to fetch nearby products:', err);
    } finally {
      setFetchingProducts(false);
    }
  }, []);

  // Fetch demands helper
  const fetchDemands = useCallback(async () => {
    setFetchingDemands(true);
    try {
      const data = await demandRequestsApi.getOpenDemandRequests();
      const now = new Date();
      const openDemands = data.filter((req: any) => {
        if (!req.deadline) return true;
        return new Date(req.deadline).getTime() >= now.getTime();
      });
      setDemandRequests(openDemands);
    } catch (err) {
      console.error('Failed to fetch demands:', err);
    } finally {
      setFetchingDemands(false);
    }
  }, []);

  // Read URL query tab parameter on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'demands') {
        setActiveTab('demands');
      }
    }
  }, []);

  // Fetch demands when tab changes to demands
  useEffect(() => {
    if (activeTab === 'demands') {
      fetchDemands();
    }
  }, [activeTab, fetchDemands]);

  const handleAddDemandToComparison = useCallback((demand: any) => {
    setComparisonDemands((prev) => {
      if (prev.some((d) => d.id === demand.id)) {
        return prev;
      }
      return [...prev, demand];
    });
    setCommitQuantities((prev) => ({ ...prev, [demand.id]: '' }));
    setCommitErrors((prev) => ({ ...prev, [demand.id]: '' }));
  }, []);

  const handleRemoveDemandFromComparison = useCallback((demandId: string | number) => {
    setComparisonDemands((prev) => prev.filter((d) => d.id !== demandId));
    setCommitQuantities((prev) => {
      const next = { ...prev };
      delete next[demandId];
      return next;
    });
    setCommitErrors((prev) => {
      const next = { ...prev };
      delete next[demandId];
      return next;
    });
  }, []);

  const handleIndividualCommitSubmit = async (demand: any, e: React.FormEvent) => {
    e.preventDefault();
    const qtyStr = commitQuantities[demand.id] || '';
    const qty = parseFloat(qtyStr);
    
    setCommitErrors((prev) => ({ ...prev, [demand.id]: '' }));

    if (isNaN(qty) || qty <= 0) {
      setCommitErrors((prev) => ({ ...prev, [demand.id]: 'Masukkan jumlah valid lebih dari 0 kg' }));
      return;
    }

    const remainingQty = Math.max(0, demand.quantity_kg_needed - demand.quantity_kg_committed);
    if (qty > remainingQty) {
      setCommitErrors((prev) => ({
        ...prev,
        [demand.id]: `Jumlah pasokan tidak boleh melebihi sisa kebutuhan (${remainingQty.toLocaleString('id-ID')} kg)`
      }));
      return;
    }

    setSubmittingCommits((prev) => ({ ...prev, [demand.id]: true }));
    try {
      await demandRequestsApi.commitSupply(demand.id, qty);
      handleRemoveDemandFromComparison(demand.id);
      fetchDemands(); // refresh demands list
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengirimkan komitmen';
      setCommitErrors((prev) => ({ ...prev, [demand.id]: msg }));
    } finally {
      setSubmittingCommits((prev) => ({ ...prev, [demand.id]: false }));
    }
  };

  // Geolocation and reference prices fetch on mount
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      if (!cachedPricesData) {
        setLoading(true);
      }
      try {
        const data = await referencePricesApi.getReferencePrices(1, 1000);
        if (!isMounted) return;
        cachedPricesData = data;
        setAllPrices(data.items);
        if (data.distinct_commodities) {
          setCommodities(data.distinct_commodities);
        }

        if (data.items.length > 0) {
          const activeRegionsList = Array.from(
            new Set(
              data.items
                .map((item: any) => item.region)
                .filter((region: string) => region && region !== 'Nasional')
            )
          ) as string[];

          setSelectedProvince((currProv) => {
            if (currProv) {
              const matched = findMatchingRegion(currProv, activeRegionsList);
              if (matched) return matched;
            }
            return selectFallbackProvince(data.items);
          });
        }
      } catch (err) {
        console.error('Failed to load reference prices details:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    // Asynchronous background geolocation without delaying page render
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!isMounted) return;
          const uLat = position.coords.latitude;
          const uLng = position.coords.longitude;
          setUserLocation([uLat, uLng]);
          setLocationMessage(null);

          let closestProv = 'Di Yogyakarta';
          let minDist = Infinity;
          Object.entries(provinceCentroids).forEach(([provName, coords]) => {
            const dist = Math.sqrt((coords.lat - uLat) ** 2 + (coords.lng - uLng) ** 2);
            if (dist < minDist) {
              minDist = dist;
              closestProv = provName;
            }
          });

          if (!isManuallySelectedRef.current) {
            setSelectedProvince(closestProv);
          }
        },
        (error) => {
          if (!isMounted) return;
          console.warn('Geolocation notice:', error.message);
          setLocationMessage('Aktifkan lokasi untuk mencari acuan harga di daerahmu');
        },
        { timeout: 5000 }
      );
    }

    return () => {
      isMounted = false;
    };
  }, [selectFallbackProvince, findMatchingRegion]);

  // Sync effect to fetch nearby products on tab/radius/location change
  useEffect(() => {
    if (activeTab === 'products' && userLocation) {
      fetchNearbyProducts(userLocation[0], userLocation[1], radiusKm);
    }
  }, [activeTab, userLocation, radiusKm, fetchNearbyProducts]);

  // Sidebar acuan prices filtering
  const filteredPrices = useMemo(() => {
    if (!selectedProvince) return [];
    let list = pricesByProvince[selectedProvince] || [];

    if (selectedCommodity && selectedCommodity !== 'ALL') {
      list = list.filter((item) => item.commodity_name === selectedCommodity);
    }
    if (searchQuery.trim() !== '') {
      list = list.filter((item) =>
        item.commodity_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return list;
  }, [selectedProvince, selectedCommodity, searchQuery, pricesByProvince]);

  // Sidebar nearby products filtering
  const filteredProducts = useMemo(() => {
    let list = nearbyProducts;
    if (searchQuery.trim() !== '') {
      list = list.filter((prod) =>
        prod.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return list;
  }, [nearbyProducts, searchQuery]);

  // Sidebar demands filtering and distance calculation
  const filteredDemands = useMemo(() => {
    let list = demandRequests.map((req) => {
      let distance_km: number | null = null;
      if (userLocation && req.latitude && req.longitude) {
        const R = 6371;
        const dLat = (req.latitude - userLocation[0]) * Math.PI / 180;
        const dLon = (req.longitude - userLocation[1]) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(userLocation[0] * Math.PI / 180) * Math.cos(req.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        distance_km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }
      return { ...req, distance_km };
    });

    // Calculate closest province name using centroids
    list = list.map((req) => {
      let closestProv = 'Di Yogyakarta';
      let minDist = Infinity;
      Object.entries(provinceCentroids).forEach(([provName, coords]) => {
        const dist = Math.sqrt((coords.lat - req.latitude) ** 2 + (coords.lng - req.longitude) ** 2);
        if (dist < minDist) {
          minDist = dist;
          closestProv = provName;
        }
      });
      return { ...req, provinceName: closestProv };
    });

    if (searchQuery.trim() !== '') {
      list = list.filter((req) =>
        req.commodity_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (req.buyer_name || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    list.sort((a, b) => {
      if (a.distance_km !== null && b.distance_km !== null) {
        return a.distance_km - b.distance_km;
      }
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });

    return list;
  }, [demandRequests, searchQuery, userLocation]);

  return (
    <main className="fixed inset-0 w-full h-screen overflow-hidden bg-gr-paper z-0">
      <BgPattern />
      <FilmGrain />
      <Glow color="var(--gr-board)" position="top" className="opacity-5 scale-110 pointer-events-none" />

      <div className="relative w-full h-full overflow-hidden">
          
          {/* Map Area (100% Full-bleed layer extending behind floating island navbar) */}
          <div className="absolute inset-0 w-full h-full z-0">
            {/* Metadata info cards floating on top left below pill navbar, only above the map area */}
            <div className="absolute top-20 right-6 z-[1000] flex flex-col gap-2 pointer-events-auto">
              {activeTab === 'pricing' && selectedProvince && (
                <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-gr-board bg-gr-paper/95 backdrop-blur-md px-3 py-1.5 rounded-sm border border-gr-line ">
                  Provinsi: {selectedProvince}
                </span>
              )}
              {activeTab === 'products' && userLocation && (
                <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-gr-board bg-[#FAF9F5]/95 backdrop-blur-md px-3 py-1.5 rounded-sm border border-gr-line ">
                  Radius: {radiusKm} KM
                </span>
              )}
              {activeTab === 'demands' && (
                <span className="font-mono text-[9px] uppercase font-bold tracking-wider text-gr-board bg-[#FAF9F5]/95 backdrop-blur-md px-3 py-1.5 rounded-sm border border-gr-line ">
                  Kebutuhan: {filteredDemands.length} Permintaan
                </span>
              )}
            </div>
            
            {isSidebarCollapsed && (
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(false)}
                className="absolute bottom-20 left-4 z-30 px-4 py-2.5 rounded-sm bg-gr-board text-gr-chalk border border-gr-board/30 shadow-lg md:hidden flex items-center gap-2 cursor-pointer font-mono text-[9px] uppercase tracking-widest font-bold"
              >
                <TrendingUp size={14} className="animate-pulse" />
                <span>Buka Panel</span>
              </button>
            )}

            <MapView
              mode={activeTab}
              products={activeTab === 'products' ? filteredProducts : []}
              demands={activeTab === 'demands' ? filteredDemands : []}
              onCommitDemand={handleAddDemandToComparison}
              radiusKm={radiusKm}
              pricesByProvince={pricesByProvince}
              selectedProvince={activeTab === 'pricing' ? selectedProvince : null}
              onSelectProvince={handleSelectProvince}
              userLocation={userLocation}
              flyToCoords={flyToCoords}
              className="h-full w-full"
            />
          </div>

          {/* Sidebar Paper Panel (Floating Overlay on Left below pill navbar) */}
          <div 
            className={cn(
              "absolute z-20 flex flex-col bg-gr-paper/97 backdrop-blur-xl border border-gr-line p-4 sm:p-6 rounded-sm overflow-hidden bottom-20 left-4 right-4 h-[64%] md:top-20 md:bottom-6 md:left-6 md:right-auto md:h-auto md:w-[440px] lg:w-[480px] transition-all duration-300",
              isSidebarCollapsed && "translate-y-full opacity-0 pointer-events-none md:translate-y-0 md:opacity-100 md:pointer-events-auto"
            )}
          >
            
            {/* 1. Header Block (Identitas Panel) */}
            <div className="flex items-center justify-between pb-2.5 border-b border-gr-line mb-2.5 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-sm bg-gr-board/10 flex items-center justify-center border border-gr-board/20">
                  <TrendingUp size={16} className="text-gr-board animate-pulse" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-gr-ink tracking-wide">
                    Harga Pasar
                  </h3>
                  <span className="block font-sans text-[10px] text-gr-ink-soft">
                    Data real-time PIHPS & Lokasi
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/tren-harga"
                  className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-gr-board bg-gr-board/10 border border-gr-board/25 px-3 py-1.5 rounded-sm hover:bg-gr-board/20 hover:border-gr-board/40 transition-all cursor-pointer font-bold"
                >
                  Tren Historis &rarr;
                </Link>
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(true)}
                  className="md:hidden p-1.5 border border-gr-line hover:border-gr-ink text-gr-ink-soft hover:text-gr-ink rounded-sm transition-all cursor-pointer flex items-center justify-center bg-white/40"
                  title="Sembunyikan Panel"
                >
                  <ChevronDown size={12} />
                </button>
              </div>
            </div>
 
            {/* Location Message inside Sidebar */}
            {locationMessage && (
              <div className="mb-2.5 rounded-sm bg-gr-down/10 p-3 text-[10px] text-gr-down border border-gr-down/20 flex items-center gap-2 shrink-0 font-mono uppercase tracking-wider">
                <Info size={12} className="shrink-0" />
                <span className="leading-relaxed">{locationMessage}</span>
              </div>
            )}

            {/* 2. Prominent Search Bar */}
            <div className="relative mb-2.5 shrink-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gr-ink-soft" />
              <input
                type="text"
                placeholder="Cari komoditas atau lokasi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/40 border border-gr-line hover:border-gr-ink-soft/40 text-gr-ink pl-9 pr-4 py-2.5 rounded-sm font-mono text-[9px] uppercase tracking-widest focus:outline-none focus:border-gr-board/50 transition-all placeholder:text-gr-ink-soft/40 "
              />
            </div>
 
            {/* 3. Tab Toggle Selector */}
            <div className="flex bg-gr-ink/5 border border-gr-line mb-3 shrink-0 rounded-sm overflow-hidden">
              <button
                onClick={() => {
                  setActiveTab('pricing');
                  setSearchQuery('');
                  setFlyToCoords(null);
                }}
                className={cn(
                  "flex-1 text-center py-2.5 font-mono text-[9px] font-extrabold uppercase tracking-widest transition-all cursor-pointer border-r border-gr-line rounded-none",
                  activeTab === 'pricing' ? "bg-gr-board text-gr-chalk" : "text-gr-ink-soft hover:text-gr-ink hover:bg-black/5"
                )}
              >
                <span className="hidden sm:inline">Harga Referensi</span>
                <span className="sm:hidden">Harga Ref.</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('products');
                  setSearchQuery('');
                  setFlyToCoords(null);
                }}
                className={cn(
                  "flex-1 text-center py-2.5 font-mono text-[9px] font-extrabold uppercase tracking-widest transition-all cursor-pointer rounded-none",
                  user?.role === 'PETANI' ? "border-r border-gr-line" : "",
                  activeTab === 'products' ? "bg-gr-board text-gr-chalk" : "text-gr-ink-soft hover:text-gr-ink hover:bg-black/5"
                )}
              >
                <span className="hidden sm:inline">Produk Terdekat</span>
                <span className="sm:hidden">Terdekat</span>
              </button>
              {user?.role === 'PETANI' && (
                <button
                  onClick={() => {
                    setActiveTab('demands');
                    setSearchQuery('');
                    setFlyToCoords(null);
                  }}
                  className={cn(
                    "flex-1 text-center py-2.5 font-mono text-[9px] font-extrabold uppercase tracking-widest transition-all cursor-pointer rounded-none",
                    activeTab === 'demands' ? "bg-gr-board text-gr-chalk" : "text-gr-ink-soft hover:text-gr-ink hover:bg-black/5"
                  )}
                >
                  <span className="hidden sm:inline">Permintaan Pembeli</span>
                  <span className="sm:hidden">Permintaan</span>
                </button>
              )}
            </div>

            {/* Layout Mode 1: Harga Referensi */}
            {activeTab === 'pricing' && (
              <>
                {/* Title and Count Badge */}
                <div className="mb-3 flex items-center justify-between shrink-0">
                  <div>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft">
                      Rincian Acuan Harga
                    </span>
                    <h2 className="font-display text-2xl font-medium text-gr-board mt-0.5">
                      {selectedProvince || 'Nasional'}
                    </h2>
                  </div>
                  <span className="font-mono text-[9px] font-extrabold text-gr-ink bg-gr-ink/5 border border-gr-line px-2.5 py-0.5 rounded-sm  shrink-0">
                    {filteredPrices.length} ditemukan
                  </span>
                </div>
 
                {/* Dropdowns panel without duplicate search bar */}
                <div className="bg-gr-chalk/35 border border-gr-line p-3 rounded-sm  mb-3 shrink-0">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <select
                        value={selectedProvince || ''}
                        onChange={(e) => handleSelectProvince(e.target.value)}
                        className="w-full bg-white/40 border border-gr-line hover:border-gr-ink-soft/40 text-gr-ink pl-3 pr-8 py-2 rounded-sm font-sans text-xs focus:outline-none focus:border-gr-board/50 transition-all appearance-none cursor-pointer text-ellipsis overflow-hidden"
                      >
                        {availableProvinces.map((prov) => (
                          <option key={prov} value={prov} className="bg-gr-paper text-gr-ink">
                            {prov}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gr-ink-soft pointer-events-none" />
                    </div>
 
                    <div className="relative">
                      <select
                        value={selectedCommodity}
                        onChange={(e) => setSelectedCommodity(e.target.value)}
                        className="w-full bg-white/40 border border-gr-line hover:border-gr-ink-soft/40 text-gr-ink pl-3 pr-8 py-2 rounded-sm font-sans text-xs focus:outline-none focus:border-gr-board/50 transition-all appearance-none cursor-pointer text-ellipsis overflow-hidden"
                      >
                        <option value="ALL" className="bg-gr-paper text-gr-ink">Semua Komoditas</option>
                        {commodities.map((comm) => (
                          <option key={comm} value={comm} className="bg-gr-paper text-gr-ink">
                            {comm}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gr-ink-soft pointer-events-none" />
                    </div>
                  </div>
                </div>
 
                {/* Pricing Cards list */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1.5 custom-scrollbar">
                  {loading && allPrices.length === 0 ? (
                    <div className="py-16 text-center">
                      <Loader2 className="h-6 w-6 text-gr-board animate-spin opacity-50 mx-auto mb-2" />
                      <p className="font-mono text-[10px] uppercase tracking-widest text-gr-ink-soft">
                        Sinkronisasi data acuan...
                      </p>
                    </div>
                  ) : filteredPrices.length > 0 ? (
                    filteredPrices.map((item) => (
                      <div 
                        key={item.id}
                        className="p-4 bg-white/60 hover:bg-white/85 border border-gr-line rounded-sm flex justify-between items-center group transition-all "
                      >
                        <div className="min-w-0 pr-3">
                          <p className="font-display text-sm font-semibold text-gr-ink group-hover:text-gr-board transition-colors truncate">
                            {item.commodity_name}
                          </p>
                          <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-gr-ink-soft mt-2 bg-gr-paper/50 border border-gr-line px-2 py-0.5 rounded-sm">
                            <Calendar size={9} />
                            {getRelativeTime(item.scraped_at)}
                          </span>
                        </div>
                        
                        <div className="shrink-0 text-right">
                          <span className="block font-mono text-sm font-bold text-gr-ink">
                            Rp {item.price_per_kg.toLocaleString('id-ID')}
                          </span>
                          <span className="font-sans text-[9px] text-gr-ink-soft uppercase tracking-widest mt-0.5 block">
                            per KG
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center">
                      <Tag className="h-8 w-8 text-gr-ink-soft/20 mx-auto mb-2" />
                      <p className="font-sans text-xs text-gr-ink-soft italic">
                        Tidak ada acuan harga yang cocok
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Layout Mode 2: Produk Terdekat */}
            {activeTab === 'products' && (
              <>
                {/* Title and Count Badge */}
                <div className="mb-4 flex items-center justify-between shrink-0">
                  <div>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft">
                      Pemetaan Panen Lokal
                    </span>
                    <h2 className="font-display text-2xl font-medium text-gr-board mt-0.5">
                      Produk Terdekat
                    </h2>
                  </div>
                  <span className="font-mono text-[9px] font-extrabold text-gr-ink bg-gr-ink/5 border border-gr-line px-2.5 py-0.5 rounded-sm  shrink-0">
                    {filteredProducts.length} ditemukan
                  </span>
                </div>
 
                {/* Radius Slider Panel */}
                <div className="bg-gr-chalk/35 border border-gr-line p-4 rounded-sm space-y-3  mb-4 shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft">
                      Radius Jangkauan
                    </span>
                    <span className="font-mono text-xs text-gr-board font-extrabold bg-gr-board/10 px-2 py-0.5 rounded-sm">
                      {radiusKm} KM
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(parseInt(e.target.value))}
                    className="w-full accent-gr-board cursor-pointer"
                  />
                </div>
 
                {/* Products Card List */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1.5 custom-scrollbar">
                  {!userLocation ? (
                    <div className="py-20 text-center space-y-3">
                      <Info className="h-8 w-8 text-gr-down mx-auto animate-pulse" />
                      <p className="font-sans text-xs text-gr-ink-soft max-w-[240px] mx-auto leading-relaxed">
                        Aktifkan lokasi di browser untuk mencari produk di sekitarmu
                      </p>
                    </div>
                  ) : fetchingProducts ? (
                    <div className="flex flex-col items-center justify-center py-20">
                      <Loader2 className="h-8 w-8 text-gr-board animate-spin opacity-50" />
                      <span className="mt-2 font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft">
                        Memindai Radius...
                      </span>
                    </div>
                  ) : filteredProducts.length > 0 ? (
                    filteredProducts.map((prod) => (
                      <div
                        key={prod.id}
                        onClick={() => {
                          if (prod.latitude && prod.longitude) {
                            setFlyToCoords([prod.latitude, prod.longitude]);
                          }
                        }}
                        className="p-4 bg-white border border-gr-line hover:border-gr-board/30 rounded-sm flex gap-3.5 group transition-all duration-150 cursor-pointer  relative"
                      >
                        <div className="h-16 w-16 bg-gr-paper/30 border border-gr-line rounded-sm overflow-hidden shrink-0">
                          <Image
                            src={prod.photo_url || '/placeholder.png'}
                            alt={prod.name}
                            width={64}
                            height={64}
                            className="h-full w-full object-cover group-hover:scale-105 transition-all duration-300"
                          />
                        </div>
                        <div className="min-w-0 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start gap-2">
                              <h3 className="font-display text-sm font-bold text-gr-ink capitalize truncate flex-1 group-hover:text-gr-board transition-colors">
                                {prod.name}
                              </h3>
                              {prod.distance_km !== undefined && prod.distance_km !== null && (
                                <span className="font-mono text-[9px] text-gr-down font-bold shrink-0">
                                  {prod.distance_km.toFixed(1)} km
                                </span>
                              )}
                            </div>
                            <p className="font-sans text-[10px] text-gr-ink-soft mt-1">
                              Stok: <span className="font-bold text-gr-ink">{prod.quantity_kg} KG</span>
                            </p>
                          </div>
                          
                          <div className="flex justify-between items-end gap-2 mt-2">
                            <span className="font-mono text-xs font-extrabold text-gr-ink">
                              Rp {prod.price_per_kg.toLocaleString('id-ID')} <span className="text-[9px] font-normal text-gr-ink-soft">/ kg</span>
                            </span>
                            <Link
                              href={`/produk/${prod.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="border border-gr-board text-gr-board hover:bg-gr-board/5 font-mono text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-sm transition-all duration-150 cursor-pointer text-center"
                            >
                              Lihat Detail
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center">
                      <Tag className="h-8 w-8 text-gr-ink-soft/20 mx-auto mb-2" />
                      <p className="font-sans text-xs text-gr-ink-soft italic">
                        Tidak ada produk di radius ini
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
            {/* Layout Mode 3: Permintaan Pembeli */}
            {activeTab === 'demands' && (
              <>
                {/* Title and Count Badge */}
                <div className="mb-4 flex items-center justify-between shrink-0">
                  <div>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft">
                      Penelusuran Kebutuhan Pangan
                    </span>
                    <h2 className="font-display text-2xl font-medium text-gr-board mt-0.5">
                      Permintaan Pembeli
                    </h2>
                  </div>
                  <span className="font-mono text-[9px] font-extrabold text-gr-ink bg-gr-ink/5 border border-gr-line px-2.5 py-0.5 rounded-sm  shrink-0">
                    {filteredDemands.length} permintaan
                  </span>
                </div>

                {/* Info Tip */}
                <div className="bg-[#FAF9F5]/80 border border-gr-line p-3 rounded-sm space-y-1  mb-4 shrink-0 font-sans text-[10px] text-gr-ink-soft leading-relaxed flex items-start gap-2">
                  <Info size={14} className="text-gr-board mt-0.5 shrink-0" />
                  <div>
                    Klik kartu permintaan untuk mengarahkan peta ke lokasi pembeli. Klik <strong>Penuhi Pasokan</strong> untuk menyanggupi kebutuhan tersebut.
                  </div>
                </div>

                {/* Demands Card List */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1.5 custom-scrollbar">
                  {fetchingDemands ? (
                    <div className="flex flex-col items-center justify-center py-20">
                      <Loader2 className="h-8 w-8 text-gr-board animate-spin opacity-50 mx-auto mb-2" />
                      <span className="mt-2 font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft">
                        Memuat Permintaan...
                      </span>
                    </div>
                  ) : filteredDemands.length > 0 ? (
                    filteredDemands.map((req) => {
                      const daysLeft = Math.ceil((new Date(req.deadline).getTime() - Date.now()) / 86400000);
                      return (
                        <div
                          key={req.id}
                          onClick={() => {
                            if (req.latitude && req.longitude) {
                              setFlyToCoords([req.latitude, req.longitude]);
                            }
                          }}
                          className="p-5 bg-white border border-gr-line hover:border-gr-board/30  rounded-sm flex flex-col gap-3.5 cursor-pointer group transition-all duration-200  relative overflow-hidden"
                        >
                          {/* Header row: title and price */}
                          <div className="flex justify-between items-start gap-4">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-display text-base font-bold text-gr-ink capitalize leading-tight group-hover:text-gr-board transition-colors">
                                {req.commodity_name}
                              </h3>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className="inline-flex items-center font-mono text uppercase tracking-wider text-gr-board bg-gr-board/5 px-2 py-0.5 rounded-sm border border-gr-board/15 font-bold">
                                  {req.category}
                                </span>
                                {daysLeft <= 7 && (
                                  <span className="font-mono text uppercase tracking-wider bg-red-50 text-red-600 px-1.5 py-0.5 rounded-sm font-bold border border-red-200/50 animate-pulse">
                                    Mendesak
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-mono text-sm font-extrabold text-gr-ink block">
                                Rp {req.price_per_kg.toLocaleString('id-ID')} <span className="text-[9px] font-normal text-gr-ink-soft">/ kg</span>
                              </span>
                            </div>
                          </div>

                          {/* Simplified Info Row (Buyer & Region) */}
                          <div className="space-y-2 text-xs font-sans border-t border-b border-gr-line/50 py-3.5 mt-0.5">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-mono text uppercase tracking-widest text-gr-ink-soft/60 font-bold shrink-0">Pemohon:</span>
                                <span className="font-sans text-xs text-gr-ink font-semibold truncate">{req.buyer_name || 'Pembeli'}</span>
                              </div>
                              <div className="shrink-0 flex items-center">
                                <RatingBadge avgRating={req.buyer_rating_avg} ratingCount={req.buyer_rating_count} size="sm" countSuffix="" />
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-xs">
                              <div className="flex items-center gap-1.5 min-w-0 text-gr-ink-soft">
                                <span className="font-mono text uppercase tracking-widest text-gr-ink-soft/60 font-bold shrink-0">Tujuan:</span>
                                <span className="font-sans text-xs font-semibold text-gr-ink truncate">{req.provinceName || 'DI Yogyakarta'}</span>
                              </div>
                              {req.distance_km !== null && (
                                <div className="shrink-0 flex items-center gap-1 font-mono text-[10px] text-gr-ink-soft">
                                  <MapPin size={11} className="text-gr-board" />
                                  <span>{req.distance_km.toFixed(1)} km</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Progress and deadline */}
                          <div className="space-y-2.5">
                            <div className="flex justify-between items-center text-[10px] font-sans">
                              <div className="flex items-center gap-1.5 text-gr-ink-soft">
                                <span className="font-mono text uppercase tracking-widest text-gr-ink-soft/60 font-bold">Kebutuhan</span>
                                <span className="font-bold text-gr-ink">
                                  {Math.max(0, req.quantity_kg_needed - req.quantity_kg_committed).toLocaleString('id-ID')} KG <span className="font-normal text-gr-ink-soft">sisa</span>
                                </span>
                              </div>
                              <div className="text-right font-mono text-[9px] text-gr-ink-soft">
                                Tenggat: <span className="font-bold text-gr-ink">{new Date(req.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                              </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full">
                              <div className="w-full h-1.5 bg-gr-line rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gr-board rounded-sm transition-all duration-300" 
                                  style={{ width: `${Math.min(100, Math.round((req.quantity_kg_committed / req.quantity_kg_needed) * 100))}%` }} 
                                />
                              </div>
                              <div className="flex justify-between text-[9px] font-mono text-gr-ink-soft mt-1.5">
                                <span className="font-bold text-gr-board">{Math.min(100, Math.round((req.quantity_kg_committed / req.quantity_kg_needed) * 100))}% terpenuhi</span>
                                <span className="flex items-center gap-1 text-gr-ink-soft"><Users size={10} /> {req.num_petani_committed || 0} Petani</span>
                              </div>
                            </div>
                          </div>

                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddDemandToComparison(req);
                            }}
                            className="w-full border border-gr-board text-gr-board hover:bg-gr-board/5 font-mono text-[9px] font-bold uppercase tracking-wider py-2.5 rounded-sm transition-all duration-150 cursor-pointer text-center "
                          >
                            Penuhi Pasokan
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-20 text-center">
                      <ShoppingBag className="h-8 w-8 text-gr-ink-soft/20 mx-auto mb-2" />
                      <p className="font-sans text-xs text-gr-ink-soft italic">
                        Tidak ada permintaan pangan aktif saat ini
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
 
          </div>
 
        </div>

        {/* ── Commit Right Panel — portaled to document.body */}
        {mounted && comparisonDemands.length > 0 && createPortal(
          <div
            className="fixed top right-4 w sm:w-[385px] bg-white border border-gr-line p-5 rounded-sm  z-[9999] flex flex-col drawer-slide-in h-[calc(100vh-105px)]"
          >
            <style>{`
              @keyframes slideInRight {
                from {
                  transform: translateX(110%);
                  opacity: 0.8;
                }
                to {
                  transform: translateX(0);
                  opacity: 1;
                }
              }
              .drawer-slide-in {
                animation: slideInRight 0.38s cubic-bezier(0.16, 1, 0.3, 1) forwards;
              }
            `}</style>
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setComparisonDemands([])}
              className="absolute top-5 right-5 text-gr-ink-soft hover:text-gr-ink transition-colors cursor-pointer"
              title="Tutup Semua"
            >
              <X size={18} />
            </button>

            {/* Decorative Icon Header */}
            <div className="flex items-center gap-3.5 mb-4 shrink-0">
              <div className="flex h-11 w-11 items-center justify-center rounded-sm bg-gr-board/10 text-gr-board border border-gr-board/20">
                <Scale size={22} className="stroke-[2.2]" />
              </div>
              <div>
                <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft/50 font-bold block">
                  Perbandingan & Komitmen
                </span>
                <h3 className="font-display text-base font-bold text-gr-ink leading-tight">
                  Pasokan Komoditas ({comparisonDemands.length})
                </h3>
              </div>
            </div>

            {/* Scrollable list of comparison demands */}
            <div className="space-y-4 overflow-y-auto pr-1 flex-1 min-h-0">
              {comparisonDemands.map((demand) => {
                const remainingQty = Math.max(0, demand.quantity_kg_needed - demand.quantity_kg_committed);
                const qtyStr = commitQuantities[demand.id] || '';
                const errorStr = commitErrors[demand.id] || '';
                const isSubmitting = submittingCommits[demand.id] || false;

                return (
                  <div key={demand.id} className="bg-gr-paper border border-gr-line rounded-sm p-4 space-y-3 relative animate-in fade-in duration-150 ">
                    {/* Card Header (Buyer Details & Close) */}
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="font-mono text uppercase tracking-wider text-gr-ink-soft/60 font-bold block mb-0.5">PEMOHON</span>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-display text-xs font-bold text-gr-ink leading-tight capitalize">
                            {demand.buyer_name || 'Pembeli'}
                          </h4>
                          {demand.buyer_rating !== undefined && demand.buyer_rating !== null && (
                            <div className="flex items-center gap-0.5 text-[10px] text-amber-600 shrink-0 font-bold">
                              <Star size={10} className="fill-amber-600 text-amber-600 shrink-0" />
                              <span>{demand.buyer_rating.toFixed(1)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveDemandFromComparison(demand.id)}
                        className="text-gr-ink-soft hover:text-gr-down transition-colors p-1"
                        title="Hapus dari Perbandingan"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* Commodity Info */}
                    <div className="bg-white border border-gr-line/60 rounded-xs p-3 space-y-2 text-[10px]">
                      <div className="flex justify-between items-center">
                        <span className="font-sans text-xs font-semibold text-gr-ink-soft">Komoditas</span>
                        <span className="font-display text-xs font-bold text-gr-board bg-gr-board/10 px-2 py-0.5 rounded-sm capitalize">
                          {demand.commodity_name}
                        </span>
                      </div>
                      <div className="h-px bg-gr-line/40" />
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <span className="block font-mono text-[7px] uppercase tracking-widest text-gr-ink-soft/50 font-bold">Penawaran</span>
                          <span className="font-mono font-bold text-gr-ink">
                            Rp {demand.price_per_kg.toLocaleString('id-ID')}<span className="text-[7px] font-normal text-gr-ink-soft/60">/kg</span>
                          </span>
                        </div>
                        <div>
                          <span className="block font-mono text-[7px] uppercase tracking-widest text-gr-ink-soft/50 font-bold">Sisa Kebutuhan</span>
                          <span className="font-mono font-bold text-gr-ink">
                            {remainingQty.toLocaleString('id-ID')} KG
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="block font-mono text-[7px] uppercase tracking-widest text-gr-ink-soft/50 font-bold">Tenggat</span>
                          <span className="font-mono font-bold text-gr-ink">
                            {new Date(demand.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {errorStr && (
                      <div className="rounded-sm bg-[#FFF5F5] p-2 text-[10px] text-gr-down border border-gr-down/20 font-sans font-medium">
                        {errorStr}
                      </div>
                    )}

                    {/* Input Form */}
                    <form onSubmit={(e) => handleIndividualCommitSubmit(demand, e)} className="space-y-3">
                      <div>
                        <label className="block font-mono text-[7px] uppercase tracking-widest text-gr-ink-soft font-bold mb-1">
                          Jumlah Pasokan (KG)
                        </label>
                        <div className="relative flex items-center">
                          <input
                            type="number"
                            step="any"
                            min="0.1"
                            placeholder="Contoh: 50"
                            value={qtyStr}
                            onChange={(e) => setCommitQuantities((prev) => ({ ...prev, [demand.id]: e.target.value }))}
                            className="w-full bg-white border border-gr-line hover:border-gr-ink-soft/35 focus:border-gr-board/50 text-gr-ink pl-3 pr-10 py-2 rounded-xs font-mono text-xs font-bold focus:outline-none transition-all placeholder:text-gr-ink-soft/40"
                          />
                          <span className="absolute right-3 font-mono text-[10px] font-bold text-gr-ink-soft/40">
                            KG
                          </span>
                        </div>
                      </div>

                      {/* Quick Presets */}
                      <div className="space-y-1">
                        <div className="flex gap-1.5">
                          {[
                            { label: '25%', val: Math.round(remainingQty * 0.25) },
                            { label: '50%', val: Math.round(remainingQty * 0.5) },
                            { label: 'Semua', val: remainingQty }
                          ].map((preset, pIdx) => {
                            if (preset.val <= 0) return null;
                            return (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={() => setCommitQuantities((prev) => ({ ...prev, [demand.id]: preset.val.toString() }))}
                                className="flex-1 bg-white hover:bg-gr-board/10 hover:text-gr-board hover:border-gr-board/40 border border-gr-line text-gr-ink-soft font-mono text-[9px] font-bold py-1 rounded-xs transition-all cursor-pointer"
                              >
                                {preset.label} ({preset.val} kg)
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-gr-line/40">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full bg-gr-board hover:bg-gr-board/90 text-gr-chalk font-sans text-xs font-bold uppercase tracking-wider py-2 rounded-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer  font-extrabold"
                        >
                          {isSubmitting ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <>
                              <Check size={12} className="stroke-[2.5]" />
                              Kirim Pasokan
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </main>
  );
}
