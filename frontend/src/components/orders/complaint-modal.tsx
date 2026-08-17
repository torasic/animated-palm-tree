'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Loader2, Package, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ComplaintModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { reason: string; description: string }) => Promise<void>;
  order: {
    id: string;
    product_name?: string;
    quantity_kg?: number;
    price_per_kg?: number;
    total_price?: number;
    seller_name?: string;
  };
  isLoading?: boolean;
}

export function ComplaintModal({
  isOpen,
  onClose,
  onSubmit,
  order,
  isLoading = false,
}: ComplaintModalProps) {
  const [mounted, setMounted] = useState(false);
  const [reason, setReason] = useState('BARANG_RUSAK');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setReason('BARANG_RUSAK');
      setDescription('');
      setError('');
    }
  }, [isOpen]);

  if (!mounted) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Harap jelaskan permasalahan atau kondisi barang yang Anda terima');
      return;
    }

    try {
      setError('');
      await onSubmit({
        reason,
        description: description.trim(),
      });
    } catch (err: any) {
      setError(err?.message || 'Gagal mengajukan komplain');
    }
  };

  const totalPrice = order.total_price || (order.price_per_kg && order.quantity_kg ? Math.round(order.price_per_kg * order.quantity_kg) : 0);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          {/* Backdrop covering whole screen and navbar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isLoading && onClose()}
            className="fixed inset-0 bg-[#201D16]/65 backdrop-blur-xs cursor-pointer"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.96, y: 15, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 15, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }}
            className="z-10 w-full max-w-[460px] bg-gr-paper border border-gr-ink/80 p-6 relative flex flex-col gap-4 cursor-default select-none shadow-2xl rounded-none"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="absolute top-4 right-4 text-gr-ink-soft/45 hover:text-gr-ink hover:bg-gr-ink/5 p-1 transition-all disabled:opacity-30 cursor-pointer border border-transparent hover:border-gr-ink/10"
              title="Tutup"
            >
              <X size={15} className="stroke-[2.5]" />
            </button>

            {/* Header: Ticket Style */}
            <div className="flex flex-col gap-1 pb-3.5 border-b border-dashed border-gr-line pr-7">
              <div className="flex justify-between items-center font-mono text-[9px] font-bold tracking-widest">
                <span className="text-amber-700 flex items-center gap-1">
                  <ShieldAlert size={12} />
                  // PENGAJUAN SENGKETA
                </span>
                <span className="text-gr-ink-soft/45 font-medium">
                  ORDER #{order.id.slice(0, 8).toUpperCase()}
                </span>
              </div>
              <h3 className="font-display text-2xl font-bold text-gr-ink leading-tight mt-1 flex items-center gap-2">
                Ajukan Komplain Pesanan
              </h3>
            </div>

            {/* Description note */}
            <p className="font-sans text-xs text-gr-ink-soft leading-relaxed">
              Sampaikan keluhan kondisi barang yang diterima untuk peninjauan sengketa oleh penengah/admin. Status transaksi akan masuk ke mediasi dan dana escrow akan ditahan.
            </p>

            {/* Order Brief Information */}
            <div className="p-3 bg-white/60 border border-dashed border-gr-line flex items-center justify-between font-mono text-[10px]">
              <div className="flex items-center gap-2 min-w-0">
                <Package size={14} className="text-gr-ink-soft/70 shrink-0" />
                <div className="truncate">
                  <span className="font-bold text-gr-ink uppercase tracking-wider block truncate">
                    {order.product_name || 'Produk Pesanan'}
                  </span>
                  {order.quantity_kg && (
                    <span className="text-gr-ink-soft text-[9px]">
                      Kuantitas: {order.quantity_kg} KG
                    </span>
                  )}
                </div>
              </div>
              {totalPrice > 0 && (
                <div className="text-right shrink-0">
                  <span className="text-gr-ink-soft/60 block text-[9px] uppercase tracking-wider">Total Nilai</span>
                  <span className="font-bold text-gr-board">Rp {totalPrice.toLocaleString('id-ID')}</span>
                </div>
              )}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4 pt-1">
              {/* Reason */}
              <div className="space-y-1.5">
                <label className="block font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink">
                  Alasan Komplain <span className="text-amber-700">*</span>
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={isLoading}
                  className="w-full border border-gr-line bg-white/90 p-2.5 text-xs font-sans text-gr-ink focus:outline-none focus:border-gr-board rounded-none cursor-pointer"
                >
                  <option value="BARANG_RUSAK">Barang Rusak / Busuk / Cacat Fisik</option>
                  <option value="TIDAK_SESUAI_DESKRIPSI">Tidak Sesuai Deskripsi / Varietas / Grade</option>
                  <option value="KUALITAS_BURUK">Kualitas Buruk / Timbangan Berat Kurang</option>
                  <option value="LAINNYA">Lainnya / Masalah Logistik</option>
                </select>
              </div>

              {/* Detail textarea */}
              <div className="space-y-1.5">
                <label className="block font-mono text-[10px] font-bold uppercase tracking-wider text-gr-ink">
                  Detail Keluhan <span className="text-amber-700">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isLoading}
                  placeholder="Jelaskan kendala pesanan secara spesifik (kondisi paket, kuantitas yang kurang, atau bukti cacat barang)..."
                  className="w-full border border-gr-line bg-white/90 p-2.5 text-xs font-sans text-gr-ink focus:outline-none focus:border-gr-board resize-none rounded-none"
                />
              </div>

              {/* Error box */}
              {error && (
                <div className="p-2.5 bg-red-50 text-red-900 border border-red-200 text-xs flex items-center gap-2">
                  <AlertTriangle size={13} className="text-red-600 shrink-0" />
                  <span className="font-sans">{error}</span>
                </div>
              )}

              {/* Footer */}
              <div className="flex justify-between items-center gap-4 pt-3 border-t border-dashed border-gr-line">
                <span className="font-mono text-[9px] text-amber-700/80 uppercase tracking-wider font-semibold">
                  *Dana Escrow Ditahan
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isLoading}
                    onClick={onClose}
                    className="border-gr-ink/60 hover:bg-gr-ink/5 text-gr-ink font-mono text-[9px] font-bold uppercase tracking-widest h-8 px-3.5 rounded-none transition-all cursor-pointer"
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-mono text-[9px] font-bold uppercase tracking-widest h-8 px-4 rounded-none transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={11} className="animate-spin" />
                        <span>Mengirim...</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={11} />
                        <span>Kirim Komplain</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
