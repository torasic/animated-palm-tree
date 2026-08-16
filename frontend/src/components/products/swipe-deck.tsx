'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { X, Heart, RefreshCw, Users, Loader2, Scale, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { demandRequestsApi } from '@/lib/api/demand-requests';
import { referencePricesApi } from '@/lib/api/reference-prices';
import { RatingBadge } from '../ratings/rating-badge';

export interface DemandRequest {
  id: string;
  commodity_name: string;
  category: string;
  quantity_kg_needed: number;
  quantity_kg_committed: number;
  deadline: string;
  status: string;
  created_at: string;
  latitude?: number;
  longitude?: number;
  num_petani_committed?: number;
  price_per_kg: number;
  buyer_name?: string;
  buyer_rating_avg?: number | null;
  buyer_rating_count?: number;
}

// ─── Color system: 3 tiers based on deadline urgency ────────
const COLORS = {
  urgent: { bg: '#FFF5F5', border: '#F5BCBC', accent: '#C94040', label: 'Mendesak' },
  soon:   { bg: '#FFFAEE', border: '#F0DFA0', accent: '#B8820A', label: 'Segera' },
  normal: { bg: '#FFFDF7', border: '#E8E0D0', accent: '#B8A888', label: null },
} as const;

function getDaysLeft(deadlineStr: string): number {
  return Math.ceil((new Date(deadlineStr).getTime() - Date.now()) / 86400000);
}

function getColor(deadlineStr: string) {
  const d = getDaysLeft(deadlineStr);
  if (d <= 7)  return COLORS.urgent;
  if (d <= 21) return COLORS.soon;
  return COLORS.normal;
}

function formatDeadline(deadlineStr: string): string {
  const d = getDaysLeft(deadlineStr);
  if (d <= 0) return 'Sudah lewat';
  if (d < 7)  return `${d} hari lagi`;
  const w = Math.floor(d / 7), r = d % 7;
  return r === 0 ? `${w} minggu lagi` : `${w} mgg ${r} hr`;
}

// ─── Card dimensions ─────────────────────────────────────────
const CARD_W  = 230;
const CARD_H  = 390;
const FOCUS_W = 400;
const FOCUS_H = 560;

// Scatter table positions for up to 8 cards
const SCATTER = [
  { rot:  3.5, dy:  8,  dxExtra:   0 },
  { rot: -4.0, dy: -6,  dxExtra:  10 },
  { rot:  2.0, dy: 12,  dxExtra:  -8 },
  { rot: -2.5, dy: -2,  dxExtra:   6 },
  { rot:  5.0, dy:  6,  dxExtra: -12 },
  { rot: -3.0, dy: 10,  dxExtra:   4 },
  { rot:  1.5, dy: -8,  dxExtra:  -6 },
  { rot: -4.5, dy:  4,  dxExtra:   8 },
];

// ─────────────────────────────────────────────────────────────
// SwipeDeck
// ─────────────────────────────────────────────────────────────
interface SwipeDeckProps {
  requests: DemandRequest[];
  userLat?: number | null;
  userLng?: number | null;
  onSwipeRight: (request: DemandRequest) => void;
  onSwipeLeft:  (request: DemandRequest) => void;
  onEmpty: () => void;
}

export const SwipeDeck: React.FC<SwipeDeckProps> = ({
  requests, userLat, userLng, onSwipeRight, onSwipeLeft, onEmpty
}) => {
  const [currentIndex, setCurrentSetIndex] = useState(0);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  const [commitRequest, setCommitRequest] = useState<DemandRequest | null>(null);
  const [commitQty, setCommitQty] = useState('');
  const [submittingCommit, setSubmittingCommit] = useState(false);
  const [commitError, setCommitError] = useState('');

  // Lock body scroll while a card is focused (prevents the page-scroll bug)
  useEffect(() => {
    if (focusedCardId) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [focusedCardId]);

  // Show up to 8 cards for a crowded table feel
  const activeRequests = useMemo(
    () => requests.slice(currentIndex, currentIndex + 8),
    [requests, currentIndex]
  );

  const focusedRequest = useMemo(
    () => activeRequests.find(r => r.id === focusedCardId) ?? null,
    [activeRequests, focusedCardId]
  );

  const handleSwipe = (direction: 'left' | 'right', request: DemandRequest) => {
    if (direction === 'right') {
      setCommitRequest(request);
      setCommitQty('');
      setCommitError('');
    } else {
      onSwipeLeft(request);
      // Proceed to the next card in focus if there is one!
      const nextIndex = currentIndex + 1;
      if (nextIndex < requests.length) {
        setFocusedCardId(requests[nextIndex].id);
      } else {
        setFocusedCardId(null);
      }
      setCurrentSetIndex(nextIndex);
    }
  };

  const handleCommitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitRequest) return;
    setCommitError('');
    const qty = parseFloat(commitQty);
    if (isNaN(qty) || qty <= 0) { setCommitError('Masukkan jumlah valid lebih dari 0 kg'); return; }
    
    const remainingQty = Math.max(0, commitRequest.quantity_kg_needed - commitRequest.quantity_kg_committed);
    if (qty > remainingQty) {
      setCommitError(`Jumlah komitmen tidak boleh melebihi sisa kebutuhan (${remainingQty.toLocaleString('id-ID')} kg)`);
      return;
    }
    
    setSubmittingCommit(true);
    try {
      await demandRequestsApi.commitSupply(commitRequest.id, qty);
      onSwipeRight(commitRequest);
      setCommitRequest(null);
      
      // Proceed to the next card in focus if there is one!
      const nextIndex = currentIndex + 1;
      if (nextIndex < requests.length) {
        setFocusedCardId(requests[nextIndex].id);
      } else {
        setFocusedCardId(null);
      }
      setCurrentSetIndex(nextIndex);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengirimkan komitmen';
      setCommitError(msg);
    } finally {
      setSubmittingCommit(false);
    }
  };

  if (currentIndex >= requests.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
        <div className="h-20 w-20 rounded-sm bg-gr-board/5 border border-gr-line flex items-center justify-center text-gr-board/40">
          <RefreshCw size={40} />
        </div>
        <div>
          <h3 className="font-display text-3xl text-gr-ink">Sudah habis dijelajahi</h3>
          <p className="mt-2 font-sans text-sm text-gr-ink-soft">Tidak ada permintaan komoditas lagi saat ini.</p>
        </div>
        <Button onClick={() => { setCurrentSetIndex(0); setFocusedCardId(null); onEmpty(); }}
          className="bg-gr-board text-gr-chalk hover:bg-gr-board/90 font-sans font-bold uppercase tracking-widest px-8 cursor-pointer rounded-sm py-3">
          Muat Ulang
        </Button>
      </div>
    );
  }

  const totalCards = activeRequests.length;

  return (
    <div className="relative flex flex-col items-center w-full select-none">
      {/* Instruction */}
      <p className="mb-4 font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft/60 text-center">
        Klik kartu untuk melihat detail · geser kanan penuhi · kiri lewati
      </p>

      {/* ── Table Stage ──────────────────────────────────────── */}
      <div className="relative overflow-visible" style={{ width: '100%', height: CARD_H + 80 }}>
        <AnimatePresence>
          {activeRequests.map((request, idx) => (
            <TableCard
              key={request.id}
              request={request}
              idx={idx}
              totalCards={totalCards}
              isInvisible={request.id === focusedCardId}
              isAnyFocused={focusedCardId !== null}
              onFocus={() => setFocusedCardId(request.id)}
            />
          ))}
        </AnimatePresence>
      </div>


      {/* ── Focused card overlay + backdrop — portaled to document.body
          so they escape any CSS stacking context from transforms/filters
          in the page (FilmGrain, Glow, etc.) and cover the full viewport */}
      {mounted && createPortal(
        <AnimatePresence>
          {focusedRequest && (
            <>
              {/* Backdrop */}
              <motion.div
                key="backdrop"
                className="fixed inset-0 z-[490] bg-black/55 backdrop-blur-[3px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setFocusedCardId(null)}
              />
              {/* Focused card overlay */}
              <FocusedCardOverlay
                key={focusedRequest.id}
                request={focusedRequest}
                userLat={userLat}
                userLng={userLng}
                onSwipe={(dir) => handleSwipe(dir, focusedRequest)}
              />
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ── Commit Modal — also portaled to escape stacking context */}
      {mounted && createPortal(
        <AnimatePresence>
          {commitRequest && (() => {
            const remainingQty = Math.max(0, commitRequest.quantity_kg_needed - commitRequest.quantity_kg_committed);
            return (
              <motion.div
                key="commit-modal-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={(e) => { if (e.target === e.currentTarget) setCommitRequest(null); }}
                className="fixed inset-0 bg-black/60 z-[700] flex items-center justify-center p-4 cursor-pointer"
              >
                <motion.div
                  key="commit-modal-content"
                  initial={{ scale: 0.9, y: 20, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.9, y: 20, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 26 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white border border-gr-line p-6 sm:p-7 rounded-sm w-full max-w-sm  cursor-default flex flex-col relative"
                >
                  {/* Decorative Icon Header */}
                  <div className="flex items-center gap-3.5 mb-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-sm bg-gr-board/10 text-gr-board">
                      <Scale size={22} className="stroke-[2.2]" />
                    </div>
                    <div>
                      <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft/50 font-bold block">
                        Konfirmasi Komitmen
                      </span>
                      <h3 className="font-display text-lg font-bold text-gr-ink leading-tight">
                        Penuhi Permintaan
                      </h3>
                    </div>
                  </div>

                  {/* Commodity & Demand summary box */}
                  <div className="bg-gr-paper/40 border border-gr-line/60 rounded-sm p-4 mb-5 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="font-sans text-xs font-semibold text-gr-ink-soft">Komoditas</span>
                      <span className="font-display text-xs font-bold text-gr-board bg-gr-board/10 px-2.5 py-0.5 rounded-sm">
                        {commitRequest.commodity_name}
                      </span>
                    </div>
                    <div className="h-px bg-gr-line/50" />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft/50 block mb-0.5">Penawaran</span>
                        <span className="font-mono text-xs font-bold text-gr-ink">
                          Rp {Math.round(commitRequest.price_per_kg).toLocaleString('id-ID')}<span className="text-[9px] font-normal text-gr-ink-soft/50">/kg</span>
                        </span>
                      </div>
                      <div>
                        <span className="font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft/50 block mb-0.5">Sisa Kebutuhan</span>
                        <span className="font-mono text-xs font-bold text-gr-ink">
                          {remainingQty.toLocaleString('id-ID')} KG
                        </span>
                      </div>
                    </div>
                  </div>

                  {commitError && (
                    <div className="mb-4 rounded-sm bg-gr-price-unfair/10 p-3 text-xs text-gr-price-unfair border border-gr-price-unfair/20 font-sans font-medium">
                      {commitError}
                    </div>
                  )}

                  <form onSubmit={handleCommitSubmit} className="space-y-4">
                    <div>
                      <label className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft font-bold mb-1.5">
                        Jumlah Pasokan
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="number"
                          step="any"
                          min="0.1"
                          placeholder="Contoh: 50"
                          value={commitQty}
                          onChange={(e) => setCommitQty(e.target.value)}
                          className="w-full bg-gr-paper/30 border border-gr-line hover:border-gr-ink-soft/30 focus:border-gr-board/50 text-gr-ink pl-4 pr-12 py-3 rounded-sm font-mono text-sm font-bold focus:outline-none transition-all placeholder:text-gr-ink-soft/40"
                          autoFocus
                        />
                        <span className="absolute right-4 font-mono text-xs font-bold text-gr-ink-soft/40">
                          KG
                        </span>
                      </div>
                    </div>

                    {/* Quick Presets */}
                    <div className="space-y-1.5">
                      <span className="block font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft/40">
                        Pilihan Cepat
                      </span>
                      <div className="flex gap-2">
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
                              onClick={() => setCommitQty(preset.val.toString())}
                              className="flex-1 bg-gr-paper/20 hover:bg-gr-board/10 hover:text-gr-board hover:border-gr-board/40 border border-gr-line text-gr-ink-soft font-mono text-[10px] font-bold py-1.5 rounded-lg transition-all cursor-pointer"
                            >
                              {preset.label} ({preset.val} kg)
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-gr-line/50">
                      <button
                        type="button"
                        onClick={() => setCommitRequest(null)}
                        className="flex-1 bg-gr-paper/30 hover:bg-gr-paper/60 border border-gr-line text-gr-ink font-sans text-xs font-semibold py-3 rounded-sm transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={submittingCommit}
                        className="flex-1 bg-gr-board hover:bg-gr-board/90 text-gr-chalk font-sans text-xs font-bold uppercase tracking-wider py-3 rounded-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-[0.98]  "
                      >
                        {submittingCommit ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <>
                            <Check size={14} className="stroke-[2.5]" />
                            Kirim
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// TableCard — card sitting on the table (non-focused state)
// ─────────────────────────────────────────────────────────────
interface TableCardProps {
  request: DemandRequest;
  idx: number;
  totalCards: number;
  isInvisible: boolean;   // true when this card is shown in overlay instead
  isAnyFocused: boolean;
  onFocus: () => void;
}

const TableCard: React.FC<TableCardProps> = ({
  request, idx, totalCards, isInvisible, isAnyFocused, onFocus
}) => {
  const color = getColor(request.deadline);
  const scatter = SCATTER[idx % SCATTER.length];

  // Spread: 8 cards at ~100px gap → ~700px total span, overlapping naturally
  const spreadGap = Math.min(120, Math.max(80, 700 / Math.max(totalCards - 1, 1)));
  const centerOffset = (totalCards - 1) / 2;
  const tableX  = (centerOffset - idx) * spreadGap + scatter.dxExtra;
  const tableY  = scatter.dy;
  const tableRot = scatter.rot;

  // Build full animate target — opacity MUST be in animate (not style)
  // so Framer Motion can transition from initial opacity:0 → 1
  let animTarget: Record<string, string | number>;
  if (isInvisible) {
    // Card is shown by the fixed overlay; hide placeholder silently
    animTarget = { x: tableX, y: tableY, rotate: tableRot, scale: 1, zIndex: 10 + (totalCards - idx), opacity: 0, filter: 'none' };
  } else if (isAnyFocused) {
    // Dim/blur non-focused table cards
    animTarget = { x: tableX, y: tableY + 6, rotate: tableRot, scale: 0.88, zIndex: 1, opacity: 0.10, filter: 'blur(2px)' };
  } else {
    // Normal table spread
    animTarget = { x: tableX, y: tableY, rotate: tableRot, scale: 1, zIndex: 10 + (totalCards - idx), opacity: 1, filter: 'none' };
  }

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: `calc(50% - ${CARD_W / 2}px)`,
        top: 24,
        width: CARD_W,
        height: CARD_H,
        pointerEvents: isInvisible || isAnyFocused ? 'none' : 'auto',
      }}
      initial={{ opacity: 0, scale: 0.75, y: 50, x: tableX, rotate: tableRot }}
      animate={animTarget}
      transition={{ type: 'spring', stiffness: 240, damping: 26 }}
      whileHover={!isAnyFocused ? {
        y: tableY - 22, scale: 1.04, rotate: 0, zIndex: 90,
        boxShadow: '0 20px 48px rgba(0,0,0,0.14)',
        transition: { type: 'spring', stiffness: 160, damping: 20 },
      } : undefined}
      exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.2 } }}
      onClick={(e) => { e.stopPropagation(); if (!isAnyFocused) onFocus(); }}
      className="cursor-pointer"
    >
      <CardFace
        request={request}
        color={color}
        showDragHint={false}
      />
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────
// FocusedCardOverlay — fixed-position enlarged card + actions
// This is rendered completely outside document flow,
// preventing any page scroll side-effects.
// ─────────────────────────────────────────────────────────────
interface FocusedCardOverlayProps {
  request: DemandRequest;
  userLat?: number | null;
  userLng?: number | null;
  onSwipe: (direction: 'left' | 'right') => void;
}

const FocusedCardOverlay: React.FC<FocusedCardOverlayProps> = ({
  request, userLat, userLng, onSwipe
}) => {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-20, 20]);
  const likeOpacity = useTransform(x, [40, 120], [0, 1]);
  const nopeOpacity = useTransform(x, [-40, -120], [0, 1]);

  const [refPrice, setRefPrice] = useState<number | null>(null);
  useEffect(() => {
    referencePricesApi.getReferencePrices(1, 1, request.commodity_name, 'Nasional')
      .then(res => { if (res?.items?.[0]) setRefPrice(res.items[0].price_per_kg); })
      .catch(() => {});
  }, [request.commodity_name]);

  const distance = useMemo(() => {
    if (userLat == null || userLng == null || request.latitude == null || request.longitude == null) return null;
    const R = 6371;
    const dLat = (request.latitude - userLat) * Math.PI / 180;
    const dLon = (request.longitude - userLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(userLat * Math.PI / 180) * Math.cos(request.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }, [userLat, userLng, request.latitude, request.longitude]);

  const color = getColor(request.deadline);
  const needed = request.quantity_kg_needed;
  const committed = request.quantity_kg_committed;
  const percent = Math.min(100, Math.round((committed / needed) * 100));
  const numPetani = request.num_petani_committed || 0;

  const handleDragEnd = (_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    if (info.offset.x > 80) onSwipe('right');
    else if (info.offset.x < -80) onSwipe('left');
    else x.set(0);
  };

  return (
    /* Fixed container centered in viewport, above backdrop (z-200) */
    <div className="fixed inset-0 z-[600] flex flex-col items-center justify-center gap-6 pointer-events-none">
      {/* The draggable enlarged card */}
      <motion.div
        style={{
          x, rotate,
          width: FOCUS_W,
          height: FOCUS_H,
          pointerEvents: 'auto',
        }}
        drag="x"
        dragElastic={0.35}
        dragConstraints={{ left: 0, right: 0 }}
        onDragEnd={handleDragEnd}
        initial={{ scale: 0.82, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.82, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="cursor-grab active:cursor-grabbing relative"
      >
        {/* Swipe indicators */}
        <motion.div style={{ opacity: likeOpacity }}
          className="absolute left-4 top-8 z-50 rounded-lg border-4 border-gr-green px-3 py-0.5 font-display text-xl font-bold uppercase tracking-widest text-gr-green -rotate-12 bg-white/95  pointer-events-none">
          PENUHI
        </motion.div>
        <motion.div style={{ opacity: nopeOpacity }}
          className="absolute right-4 top-8 z-50 rounded-lg border-4 border-gr-price-unfair px-3 py-0.5 font-display text-xl font-bold uppercase tracking-widest text-gr-price-unfair rotate-12 bg-white/95  pointer-events-none">
          LEWATI
        </motion.div>

        {/* Enlarged card face */}
        <div className="h-full w-full rounded-sm flex flex-col overflow-hidden "
          style={{ background: color.bg, border: `1.5px solid ${color.border}` }}>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <span className="font-mono text-[9px] uppercase tracking-widest font-semibold" style={{ color: color.accent }}>
              {request.category}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-widest font-bold" style={{ color: color.accent }}>
              {distance != null ? `${distance} km` : 'Terdekat'}
            </span>
          </div>
          <div className="mx-5 h-px" style={{ background: color.border }} />

          <div className="flex-1 flex flex-col px-5 py-4 gap-3 overflow-hidden">
            {/* Commodity + deadline */}
            <div>
              <h3 className="font-display text-xl font-bold leading-tight text-gr-ink tracking-tight">
                {request.commodity_name}
              </h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {color.label && (
                  <span className="font-mono text uppercase tracking-widest font-bold px-1.5 py-0.5 rounded"
                    style={{ background: color.accent + '22', color: color.accent }}>
                    {color.label}
                  </span>
                )}
                <span className="font-mono text-[9px] font-semibold" style={{ color: color.accent }}>
                  {formatDeadline(request.deadline)}
                </span>
              </div>
            </div>

            {/* Buyer */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text uppercase tracking-widest text-gr-ink-soft/40">Pemohon</p>
                <p className="font-sans text-xs font-semibold text-gr-ink">{request.buyer_name || 'Pembeli'}</p>
              </div>
              <div className="rounded-sm px-2 py-0.5 flex items-center" style={{ background: color.border }}>
                <RatingBadge avgRating={request.buyer_rating_avg} ratingCount={request.buyer_rating_count}
                  size="sm" newLabel="Baru" countSuffix="permintaan" />
              </div>
            </div>

            {/* Price */}
            <div className="flex justify-between items-start gap-2 pt-2" style={{ borderTop: `1px solid ${color.border}` }}>
              <div>
                <p className="font-mono text uppercase tracking-widest text-gr-ink-soft/40 mb-0.5">Penawaran</p>
                <p className="font-mono text-base font-bold text-gr-ink">
                  Rp {Math.round(request.price_per_kg).toLocaleString('id-ID')}<span className="text-[9px] font-normal text-gr-ink-soft/50">/kg</span>
                </p>
              </div>
              {refPrice !== null && (
                <div className="text-right">
                  <p className="font-mono text uppercase tracking-widest text-gr-ink-soft/40 mb-0.5">PIHPS</p>
                  <p className="font-mono text-xs text-gr-ink-soft">Rp {Math.round(refPrice).toLocaleString('id-ID')}</p>
                  {request.price_per_kg >= refPrice
                    ? <p className="font-mono text font-bold text-gr-up uppercase mt-0.5">Harga Adil</p>
                    : <p className="font-mono text font-bold text-gr-price-unfair uppercase mt-0.5">Bawah Pasar</p>
                  }
                </div>
              )}
            </div>

            {/* Progress */}
            <div className="pt-2 space-y-1.5" style={{ borderTop: `1px solid ${color.border}` }}>
              <div className="flex justify-between text-[9px] font-mono">
                <span className="text-gr-ink-soft/50 uppercase tracking-widest">Kebutuhan</span>
                <span className="text-gr-ink font-semibold">{needed.toLocaleString('id-ID')} KG</span>
              </div>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: color.border }}>
                <div className="h-full rounded-sm bg-gr-board transition-all" style={{ width: `${percent}%` }} />
              </div>
              <div className="flex justify-between text-[9px] font-mono">
                <span className="font-semibold text-gr-board">{percent}% terpenuhi</span>
                <span className="text-gr-ink-soft/50 flex items-center gap-1"><Users size={9} /> {numPetani}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-4 pt-2" style={{ borderTop: `1px solid ${color.border}` }}>
            <p className="font-mono text uppercase tracking-widest" style={{ color: color.accent }}>
              Geser kanan penuhi · kiri lewati
            </p>
          </div>
        </div>
      </motion.div>

      {/* Action buttons below the card */}
      <div className="flex items-center gap-10" style={{ pointerEvents: 'auto' }}>
        <button onClick={() => onSwipe('left')}
          className="flex h-14 w-14 items-center justify-center rounded-sm border border-gr-price-unfair/30 bg-white text-gr-price-unfair transition-all hover:bg-gr-price-unfair hover:text-white hover:scale-110 active:scale-95 cursor-pointer ">
          <X size={24} />
        </button>
        <button onClick={() => onSwipe('right')}
          className="flex h-16 w-16 items-center justify-center rounded-sm border border-gr-green/30 bg-white text-gr-green transition-all hover:bg-gr-green hover:text-white hover:scale-110 active:scale-95 cursor-pointer ">
          <Heart size={30} fill="currentColor" />
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// CardFace — shared card UI (used in TableCard)
// ─────────────────────────────────────────────────────────────
interface CardFaceProps {
  request: DemandRequest;
  color: typeof COLORS[keyof typeof COLORS];
  showDragHint: boolean;
}

const CardFace: React.FC<CardFaceProps> = ({ request, color, showDragHint }) => {
  const needed = request.quantity_kg_needed;
  const committed = request.quantity_kg_committed;
  const percent = Math.min(100, Math.round((committed / needed) * 100));
  const numPetani = request.num_petani_committed || 0;

  return (
    <div className="h-full w-full rounded-sm flex flex-col overflow-hidden"
      style={{ background: color.bg, border: `1.5px solid ${color.border}` }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="font-mono text-[9px] uppercase tracking-widest font-semibold" style={{ color: color.accent }}>
          {request.category}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-widest font-bold" style={{ color: color.accent }}>
          {formatDeadline(request.deadline)}
        </span>
      </div>
      <div className="mx-4 h-px" style={{ background: color.border }} />

      <div className="flex-1 flex flex-col px-4 py-3 gap-2.5 overflow-hidden">
        {/* Commodity */}
        <div>
          <h3 className="font-display text-base font-bold leading-tight text-gr-ink tracking-tight">
            {request.commodity_name}
          </h3>
          {color.label && (
            <span className="inline-block mt-0.5 font-mono text uppercase tracking-widest font-bold px-1.5 py-0.5 rounded"
              style={{ background: color.accent + '22', color: color.accent }}>
              {color.label}
            </span>
          )}
        </div>

        {/* Buyer */}
        <div>
          <p className="font-mono text uppercase tracking-widest text-gr-ink-soft/40">Pemohon</p>
          <p className="font-sans text-xs font-semibold text-gr-ink">{request.buyer_name || 'Pembeli'}</p>
        </div>

        {/* Price */}
        <div className="pt-2" style={{ borderTop: `1px solid ${color.border}` }}>
          <p className="font-mono text uppercase tracking-widest text-gr-ink-soft/40 mb-0.5">Penawaran</p>
          <p className="font-mono text-sm font-bold text-gr-ink">
            Rp {Math.round(request.price_per_kg).toLocaleString('id-ID')}<span className="text-[9px] font-normal text-gr-ink-soft/50">/kg</span>
          </p>
        </div>

        {/* Progress */}
        <div className="pt-2 space-y-1.5" style={{ borderTop: `1px solid ${color.border}` }}>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: color.border }}>
            <div className="h-full rounded-sm bg-gr-board" style={{ width: `${percent}%` }} />
          </div>
          <div className="flex justify-between text-[9px] font-mono">
            <span className="font-semibold text-gr-board">{percent}% terpenuhi</span>
            <span className="text-gr-ink-soft/50 flex items-center gap-1"><Users size={9} /> {numPetani}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 pb-3 pt-2" style={{ borderTop: `1px solid ${color.border}` }}>
        <p className="font-mono text uppercase tracking-widest" style={{ color: color.accent }}>
          {showDragHint ? 'Geser kanan penuhi · kiri lewati' : 'Klik untuk detail'}
        </p>
      </div>
    </div>
  );
};
