'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { referencePricesApi } from '@/lib/api/reference-prices';
import { productsApi } from '@/lib/api/products';
import { BASE_URL } from '@/lib/api/client';
import { BgPattern } from '@/components/effects/bg-pattern';
import { FilmGrain } from '@/components/effects/film-grain';
import { Glow } from '@/components/effects/glow';
import { TrendingUp, TrendingDown, Loader2, Calendar, ChevronDown, HelpCircle, MapPin, AlertTriangle } from 'lucide-react';
import dynamic from 'next/dynamic';

const PriceTrendChartSkeleton = () => (
  <div className="w-full h-full min-h-[350px] flex flex-col bg-white/20 border border-gr-line rounded-sm p-5 animate-pulse select-none justify-between">
    <div className="flex justify-between items-center mb-6">
      <div className="h-3 w-32 bg-gr-ink/10 rounded-sm" />
      <div className="h-3 w-16 bg-gr-ink/10 rounded-sm" />
    </div>
    <div className="flex-1 w-full flex flex-col justify-between py-4 relative">
      <div className="absolute inset-0 flex items-center justify-center">
        <svg className="w-full h-[150px] opacity-10" viewBox="0 0 100 30" preserveAspectRatio="none">
          <path d="M0,25 Q15,5 30,20 T60,10 T90,22 T100,15" fill="none" stroke="var(--gr-ink)" strokeWidth="1" />
          <path d="M0,25 Q15,5 30,20 T60,10 T90,22 T100,15 L100,30 L0,30 Z" fill="var(--gr-ink)" opacity="0.5" />
        </svg>
      </div>
      <div className="h-px w-full bg-gr-ink/5" />
      <div className="h-px w-full bg-gr-ink/5" />
      <div className="h-px w-full bg-gr-ink/5" />
      <div className="h-px w-full bg-gr-ink/5" />
      <div className="h-px w-full bg-gr-ink/5" />
    </div>
    <div className="flex justify-between items-center mt-4 pt-3 border-t border-gr-line/10">
      <div className="h-2 w-10 bg-gr-ink/5 rounded-sm" />
      <div className="h-2 w-10 bg-gr-ink/5 rounded-sm" />
      <div className="h-2 w-10 bg-gr-ink/5 rounded-sm" />
      <div className="h-2 w-10 bg-gr-ink/5 rounded-sm" />
      <div className="h-2 w-10 bg-gr-ink/5 rounded-sm" />
    </div>
  </div>
);

const PriceTrendChart = dynamic(
  () => import('@/components/products/price-trend-chart').then((mod) => mod.PriceTrendChart),
  {
    ssr: false,
    loading: () => <PriceTrendChartSkeleton />
  }
);

const CobwebChart = dynamic(
  () => import('@/components/products/cobweb-chart').then((mod) => mod.CobwebChart),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[300px] flex flex-col items-center justify-center bg-white/20 border border-gr-line rounded-sm animate-pulse">
        <div className="h-6 w-6 border-2 border-gr-board border-t-transparent rounded-full animate-spin opacity-40 mb-2" />
        <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft">Memuat Simulasi...</span>
      </div>
    )
  }
);

import { provinceCentroids } from '@/lib/data/province-centroids';

export default function PriceTrendPage() {
  const [commodities, setCommodities] = useState<string[]>([]);
  const [selectedCommodity, setSelectedCommodity] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('Jawa Timur');
  const [daysRange, setDaysRange] = useState<number>(30);
  const [lastScrapedAt, setLastScrapedAt] = useState<string | null>(null);

  // Fetch last scraped time on mount
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const stats = await productsApi.getLiveStats();
        if (stats && stats.last_scraped_at) {
          setLastScrapedAt(stats.last_scraped_at);
        }
      } catch (err) {
        console.error('Failed to fetch live stats:', err);
      }
    };
    fetchStats();
  }, []);

  // Chart data
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [fetchingChart, setFetchingChart] = useState<boolean>(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);

  // Divergence score & streaming details states
  const [divergenceData, setDivergenceData] = useState<any>(null);
  const [isExplaining, setIsExplaining] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [loadingText, setLoadingText] = useState<string>('Menganalisis tren harga...');
  const [explanationText, setExplanationText] = useState<string>('');
  const [showTechDetails, setShowTechDetails] = useState<boolean>(false);

  // What-If Simulator states
  const [simulatorMode, setSimulatorMode] = useState<'simple' | 'advanced'>('simple');
  const [simpleChoice, setSimpleChoice] = useState<'sedikit' | 'sedang' | 'banyak'>('sedikit');
  const [customEs, setCustomEs] = useState<number>(0.8);
  const [customEd, setCustomEd] = useState<number>(1.0);
  const [customPeriods, setCustomPeriods] = useState<number>(8);

  const [simResult, setSimResult] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simStreaming, setSimStreaming] = useState<boolean>(false);
  const [simLoadingText, setSimLoadingText] = useState<string>('Menghitung kesetimbangan pasar...');
  const [simExplanation, setSimExplanation] = useState<string>('');
  const [showAdvancedToggle, setShowAdvancedToggle] = useState<boolean>(false);

  // Active Es & Ed mapping for Mode Simpel
  const activeEs = useMemo(() => {
    if (simulatorMode === 'simple') {
      if (simpleChoice === 'sedikit') return 0.4;
      if (simpleChoice === 'sedang') return 0.95;
      return 1.6;
    }
    return customEs;
  }, [simulatorMode, simpleChoice, customEs]);

  const activeEd = useMemo(() => {
    if (simulatorMode === 'simple') return 1.0;
    return customEd;
  }, [simulatorMode, customEd]);

  const activePeriods = useMemo(() => {
    if (simulatorMode === 'simple') return 8;
    return customPeriods;
  }, [simulatorMode, customPeriods]);

  const simRatio = useMemo(() => {
    return activeEs / activeEd;
  }, [activeEs, activeEd]);

  const isExtremeRatio = useMemo(() => {
    return simRatio > 5.0 || simRatio < 0.2;
  }, [simRatio]);

  // Reset simulator result when filters change
  useEffect(() => {
    setSimResult(null);
    setSimExplanation('');
  }, [selectedCommodity, selectedRegion, daysRange, simulatorMode, simpleChoice]);

  const handleSimulate = async () => {
    if (!selectedCommodity) return;
    setIsSimulating(true);
    setSimExplanation('');
    setSimResult(null);

    const stages = [
      'Menghitung kesetimbangan pasar...',
      'Menjalankan simulasi Cobweb...',
      'Menghubungkan ke Groq LLM...'
    ];
    let stageIdx = 0;
    setSimLoadingText(stages[0]);
    const stageInterval = setInterval(() => {
      stageIdx = (stageIdx + 1) % stages.length;
      setSimLoadingText(stages[stageIdx]);
    }, 800);

    try {
      const url = `${BASE_URL}/reference-prices/cobweb/stream?commodity=${encodeURIComponent(selectedCommodity)}&region=${encodeURIComponent(selectedRegion)}&days=${daysRange}&es=${activeEs}&ed=${activeEd}&periods=${activePeriods}`;

      const response = await fetch(url, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Stream request failed');
      }

      clearInterval(stageInterval);
      setSimStreaming(true);

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            try {
              const payload = JSON.parse(dataStr);
              if (payload.type === 'simulation') {
                setSimResult(payload.data);
              } else if (payload.type === 'chunk') {
                setSimExplanation(prev => prev + payload.text);
              }
            } catch (err) {
              console.error('Failed to parse SSE payload:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Cobweb simulation streaming failed:', err);
      setSimExplanation('Gagal menghubungkan ke simulator. Silakan coba sesaat lagi.');
    } finally {
      clearInterval(stageInterval);
      setIsSimulating(false);
      setSimStreaming(false);
    }
  };

  // Fetch divergence score on filters update
  useEffect(() => {
    const fetchDivergence = async () => {
      if (!selectedCommodity) return;
      try {
        const data = await referencePricesApi.getPriceDivergence(selectedCommodity, selectedRegion, daysRange);
        setDivergenceData(data);
      } catch (err) {
        console.error('Failed to fetch divergence score:', err);
      }
    };

    setDivergenceData(null);
    setExplanationText('');
    setShowTechDetails(false);
    fetchDivergence();
  }, [selectedCommodity, selectedRegion, daysRange]);

  const handleExplain = async () => {
    if (!selectedCommodity) return;
    setIsExplaining(true);
    setExplanationText('');

    // Staged loading text cycling
    const loadingStages = [
      'Menganalisis tren harga...',
      'Mendeteksi pola fluktuasi harian...',
      'Menghubungkan ke Groq LLM...'
    ];
    let stageIdx = 0;
    setLoadingText(loadingStages[0]);
    const stageInterval = setInterval(() => {
      stageIdx = (stageIdx + 1) % loadingStages.length;
      setLoadingText(loadingStages[stageIdx]);
    }, 800);

    try {
      const url = `${BASE_URL}/reference-prices/divergence/stream?commodity=${encodeURIComponent(selectedCommodity)}&region=${encodeURIComponent(selectedRegion)}&days=${daysRange}`;

      const response = await fetch(url, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Stream request failed');
      }

      // Clear loading stages and start stream rendering
      clearInterval(stageInterval);
      setIsStreaming(true);

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            try {
              const payload = JSON.parse(dataStr);
              if (payload.type === 'stats') {
                setDivergenceData(payload.data);
              } else if (payload.type === 'chunk') {
                setExplanationText(prev => prev + payload.text);
              }
            } catch (err) {
              console.error('Failed to parse SSE payload:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Explanation streaming failed:', err);
      // Fallback
      try {
        const staticData = await referencePricesApi.getPriceDivergence(selectedCommodity, selectedRegion, daysRange);
        setDivergenceData(staticData);
        setExplanationText(staticData.explanation);
      } catch (fallbackErr) {
        console.error('Fallback explanation failed:', fallbackErr);
        setExplanationText('Gagal menghubungkan ke layanan AI. Silakan coba sesaat lagi.');
      }
    } finally {
      clearInterval(stageInterval);
      setIsExplaining(false);
      setIsStreaming(false);
    }
  };

  // Trend calculation metrics
  const trendMetrics = useMemo(() => {
    if (historyData.length < 2) return null;

    // Sort chronologically to make sure we compare correctly
    const sorted = [...historyData].sort(
      (a, b) => new Date(a.scraped_at).getTime() - new Date(b.scraped_at).getTime()
    );

    const startPrice = sorted[0].price_per_kg;
    const endPrice = sorted[sorted.length - 1].price_per_kg;

    const change = endPrice - startPrice;
    const percentChange = startPrice > 0 ? (change / startPrice) * 100 : 0;

    return {
      startPrice,
      endPrice,
      change,
      percentChange,
      isUp: change > 0,
      isDown: change < 0,
      isFlat: change === 0
    };
  }, [historyData]);

  // List of provinces
  const regionsList = useMemo(() => {
    return Object.keys(provinceCentroids).sort();
  }, []);

  // Fetch initial commodities from standard endpoint
  useEffect(() => {
    const fetchInitialData = async () => {
      setInitialLoading(true);
      try {
        const res = await referencePricesApi.getReferencePrices(1, 10);
        if (res.distinct_commodities && res.distinct_commodities.length > 0) {
          setCommodities(res.distinct_commodities);
          // Default to first commodity
          setSelectedCommodity(res.distinct_commodities[0]);
        }
      } catch (err) {
        console.error('Failed to load initial commodities list:', err);
      } finally {
        setInitialLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  // Fetch history list when filters update
  const fetchHistory = useCallback(async (commodity: string, region: string, days: number) => {
    if (!commodity) return;
    setFetchingChart(true);
    try {
      const data = await referencePricesApi.getPriceHistory(commodity, region, days);
      setHistoryData(data);
    } catch (err) {
      console.error('Failed to fetch pricing history:', err);
    } finally {
      setFetchingChart(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCommodity) {
  fetchHistory(selectedCommodity, selectedRegion, daysRange);
    }
  }, [selectedCommodity, selectedRegion, daysRange, fetchHistory]);

  return (
    <main className="relative flex-1 bg-gr-paper lg:h-[calc(100vh-76px)] lg:max-h-[calc(100vh-76px)] lg:overflow-hidden flex flex-col">
      <BgPattern />
      <FilmGrain />
      <Glow color="var(--gr-board)" position="top" className="opacity-5 scale-110 pointer-events-none" />

      <div className="relative z-10 w-full h-full flex flex-col min-h-0 px-4 sm:px-8 py-6 max-w-[1100px] mx-auto">
        
        {/* Standard Page Header at Top */}
        <header className="mb-6 select-none shrink-0">
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-gr-board flex items-center gap-2">
            <TrendingUp size={12} className="text-gr-board animate-pulse" />
            Statistik Tren
          </span>
          <h1 className="mt-2 font-display text-4xl font-semibold text-gr-ink">
            Visualisasi Tren Harga
          </h1>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-1.5">
            <p className="font-sans text-xs text-gr-ink-soft max-w-2xl">
              Lacak perubahan dan fluktuasi harga acuan komoditas pangan nasional secara historis berdasarkan data rekam harian PIHPS.
            </p>
            {lastScrapedAt && (
              <span className="font-mono text-[9px] uppercase tracking-wider text-gr-ink-soft bg-gr-ink/5 border border-gr-line px-2.5 py-1 rounded-sm w-fit font-bold shrink-0">
                Sinkronisasi PIHPS: {new Date(lastScrapedAt).toLocaleString('id-ID', {
                  dateStyle: 'medium',
                  timeStyle: 'short'
                })}
              </span>
            )}
          </div>
          <div className="mt-4 h-px w-full bg-gradient-to-r from-gr-line via-gr-line/30 to-transparent" />
        </header>

        {initialLoading ? (
          <div className="flex flex-col items-center justify-center flex-1">
            <Loader2 className="h-12 w-12 text-gr-board animate-spin opacity-50" />
            <span className="mt-4 font-mono text-xs uppercase tracking-widest text-gr-ink-soft">
              Sinkronisasi indeks komoditas...
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 flex-1 min-h-0 items-stretch lg:overflow-hidden">
            
            {/* COLUMN 1: Historical Trend Chart (Left - Main) */}
            <div className="flex flex-col h-full min-h-0 space-y-3">
              {fetchingChart ? (
                <PriceTrendChartSkeleton />
              ) : historyData.length >= 2 ? (
                <div className="flex-1 flex flex-col min-h-0 space-y-3">
                  <div className="flex justify-between items-center px-1 gap-2 flex-wrap shrink-0">
                    <span className="font-sans text-[10px] text-gr-ink-soft flex items-center gap-1.5 uppercase font-semibold flex-wrap">
                      <Calendar size={10} />
                      TREN HISTORIS: {selectedCommodity}
                      {divergenceData && (
                        <span className={`ml-2 px-1.5 py-0.5 rounded-sm font-mono text-[9px] font-extrabold border ${divergenceData.divergence_score < -5.0
                            ? 'text-gr-up bg-gr-up/10 border-gr-up/20'
                            : divergenceData.divergence_score > 5.0
                              ? 'text-gr-down bg-gr-down/10 border-gr-down/20'
                              : 'text-gr-ink-soft bg-gr-ink/5 border-gr-line'
                          }`}>
                          {divergenceData.classification} ({divergenceData.divergence_score > 0 ? '+' : ''}{divergenceData.divergence_score.toFixed(1)}%)
                        </span>
                      )}
                      {trendMetrics && (
                        <span className={`ml-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-[10px] font-extrabold uppercase tracking-wider ${trendMetrics.isUp
                            ? 'text-gr-up bg-gr-up/10'
                            : trendMetrics.isDown
                              ? 'text-gr-down bg-gr-down/10'
                              : 'text-gr-ink-soft bg-gr-ink/5'
                          }`}>
                          {trendMetrics.isUp && <TrendingUp size={12} />}
                          {trendMetrics.isDown && <TrendingDown size={12} />}
                          {trendMetrics.percentChange > 0 ? '+' : ''}
                          {trendMetrics.percentChange.toFixed(1)}%
                        </span>
                      )}
                    </span>
                    <span className="font-sans text-[10px] text-gr-board flex items-center gap-1.5 uppercase font-semibold">
                      <MapPin size={10} />
                      {selectedRegion}
                    </span>
                  </div>
                  
                  {/* Chart Wrapper to scale it properly */}
                  <div className="flex-1 min-h-[300px] lg:min-h-0 bg-white/20 backdrop-blur-sm border border-gr-line p-5 rounded-sm  flex items-center justify-center">
                    <div className="w-full h-full">
                      <PriceTrendChart data={historyData} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-white/20 backdrop-blur-sm border border-gr-line rounded-sm  space-y-4">
                  <HelpCircle className="h-10 w-10 text-gr-board/60 mx-auto animate-pulse" />
                  <h3 className="font-display text-xl font-medium text-gr-ink">
                    Data Historis Terbatas
                  </h3>
                  <p className="font-sans text-xs text-gr-ink-soft leading-relaxed max-w-xs">
                    Data acuan historis saat ini terlalu sedikit untuk membentuk grafik tren. Data tren akan semakin akurat seiring waktu.
                  </p>
                </div>
              )}
            </div>

            {/* COLUMN 2: Controls & AI Sidebar (Right) */}
            <div className="flex flex-col h-full min-h-0 space-y-4">
              
              {/* Controls panel */}
              <div className="bg-white/20 backdrop-blur-sm border border-gr-line p-4 rounded-sm  space-y-4 shrink-0">
                {/* Select Commodity */}
                <div>
                  <label className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft mb-1.5 font-semibold">
                    Komoditas Pangan
                  </label>
                  <div className="relative">
                    <select
                      value={selectedCommodity}
                      onChange={(e) => setSelectedCommodity(e.target.value)}
                      className="w-full bg-white/40 border border-gr-line hover:border-gr-ink-soft/40 text-gr-ink pl-3 pr-8 py-2 rounded-sm font-sans text-xs focus:outline-none focus:border-gr-board/50 transition-all appearance-none cursor-pointer"
                    >
                      {commodities.map((comm) => (
                        <option key={comm} value={comm} className="bg-gr-paper text-gr-ink">
                          {comm}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gr-ink-soft pointer-events-none" />
                  </div>
                </div>

                {/* Select Region */}
                <div>
                  <label className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft mb-1.5 font-semibold">
                    Wilayah Provinsi
                  </label>
                  <div className="relative">
                    <select
                      value={selectedRegion}
                      onChange={(e) => setSelectedRegion(e.target.value)}
                      className="w-full bg-white/40 border border-gr-line hover:border-gr-ink-soft/40 text-gr-ink pl-3 pr-8 py-2 rounded-sm font-sans text-xs focus:outline-none focus:border-gr-board/50 transition-all appearance-none cursor-pointer"
                    >
                      {regionsList.map((reg) => (
                        <option key={reg} value={reg} className="bg-gr-paper text-gr-ink">
                          {reg}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gr-ink-soft pointer-events-none" />
                  </div>
                </div>

                {/* Date Range filter */}
                <div>
                  <label className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft mb-1.5 font-semibold">
                    Rentang Analisis
                  </label>
                  <div className="relative">
                    <select
                      value={daysRange}
                      onChange={(e) => setDaysRange(parseInt(e.target.value))}
                      className="w-full bg-white/40 border border-gr-line hover:border-gr-ink-soft/40 text-gr-ink pl-3 pr-8 py-2 rounded-sm font-sans text-xs focus:outline-none focus:border-gr-board/50 transition-all appearance-none cursor-pointer"
                    >
                      <option value={7} className="bg-gr-paper text-gr-ink">7 Hari Terakhir</option>
                      <option value={30} className="bg-gr-paper text-gr-ink">30 Hari Terakhir</option>
                      <option value={90} className="bg-gr-paper text-gr-ink">90 Hari Terakhir</option>
                      <option value={365} className="bg-gr-paper text-gr-ink">1 Tahun Terakhir</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gr-ink-soft pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* AI Stability analysis card */}
              {historyData.length >= 2 ? (
                <div className="flex-1 flex flex-col min-h-0 bg-white/20 backdrop-blur-sm border border-gr-line p-4 rounded-sm ">
                  <div className="flex justify-between items-center border-b border-gr-line pb-2.5 flex-wrap gap-2 shrink-0">
                    <h3 className="font-mono text-xs uppercase tracking-widest text-gr-board font-bold flex items-center gap-2">
                      <TrendingUp size={14} />
                      Stabilitas AI
                    </h3>
                    {divergenceData && (
                      <span className={`px-2 py-0.5 rounded-sm font-mono text-[9px] font-bold border ${divergenceData.divergence_score < -5.0
                          ? 'text-gr-up bg-gr-up/10 border-gr-up/20'
                          : divergenceData.divergence_score > 5.0
                            ? 'text-gr-down bg-gr-down/10 border-gr-down/20'
                            : 'text-gr-ink-soft bg-gr-ink/5 border-gr-line'
                        }`}>
                        {divergenceData.classification}
                      </span>
                    )}
                  </div>

                  {/* Scrollable Content wrapper for AI text to stay within column boundaries */}
                  <div className="flex-1 overflow-y-auto mt-3.5 pr-1.5 custom-scrollbar flex flex-col justify-between min-h-0">
                    {explanationText ? (
                      <div className="space-y-4 flex-1 flex flex-col justify-between">
                        <p className="font-sans text-xs text-gr-ink leading-relaxed whitespace-pre-wrap">
                          {explanationText}
                          {isStreaming && <span className="inline-block w-1.5 h-3 ml-1 bg-gr-board animate-pulse" />}
                        </p>

                        <div className="pt-2 border-t border-gr-line/30 mt-auto">
                          <button
                            onClick={() => setShowTechDetails(!showTechDetails)}
                            className="font-mono text-[9px] uppercase tracking-wider text-gr-ink-soft hover:text-gr-ink flex items-center gap-1 transition-colors focus:outline-none"
                          >
                            <span>detail teknis</span>
                            <ChevronDown size={10} className={`transform transition-transform ${showTechDetails ? 'rotate-180' : ''}`} />
                          </button>

                          {showTechDetails && divergenceData && (
                            <div className="mt-2 bg-white/20 backdrop-blur-sm border border-gr-line rounded-sm p-3 font-mono text-[10px] text-gr-ink-soft space-y-2">
                              <div className="space-y-1.5">
                                <div className="flex justify-between">
                                  <span>Simpangan</span>
                                  <span className="font-bold text-gr-ink">Rp {divergenceData.average_oscillation_amplitude.toLocaleString('id-ID')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Siklus</span>
                                  <span className="font-bold text-gr-ink">{divergenceData.average_oscillation_frequency_days.toFixed(1)} hari</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Skor</span>
                                  <span className="font-bold text-gr-ink">{divergenceData.divergence_score > 0 ? '+' : ''}{divergenceData.divergence_score.toFixed(1)}%</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4 py-6">
                        <p className="font-sans text-xs text-gr-ink-soft leading-relaxed">
                          Analisis mendalam stabilitas harga komoditas dari AI.
                        </p>
                        <button
                          onClick={handleExplain}
                          disabled={isExplaining}
                          className="w-full font-mono text-xs uppercase tracking-widest bg-gr-board text-gr-chalk border border-gr-board hover:bg-gr-board/90 px-4 py-3 rounded-sm transition-all duration-300 disabled:opacity-80 flex items-center justify-center gap-2 cursor-pointer font-bold "
                        >
                          {isExplaining ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              <span>{loadingText}</span>
                            </>
                          ) : (
                            <span>Jelaskan Tren AI</span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center p-6 text-gr-ink-soft text-xs font-mono uppercase tracking-wider bg-white/20 backdrop-blur-sm border border-gr-line rounded-sm ">
                  Analisis AI tidak tersedia untuk riwayat terbatas.
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </main>
  );
}
