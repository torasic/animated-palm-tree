'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/api/auth';
import { Phone, X, Loader2 } from 'lucide-react';

interface PhoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PhoneModal({ isOpen, onClose, onSuccess }: PhoneModalProps) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const validatePhone = (num: string) => {
    const cleaned = num.replace(/[\s\-()]/g, '');
    return /^(\+628|628|08)[0-9]{7,11}$/.test(cleaned);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) {
      setError('Nomor WhatsApp wajib diisi');
      return;
    }

    if (!validatePhone(phone)) {
      setError('Format nomor telepon tidak valid. Gunakan format Indonesia (misal: 08xx atau +628xx)');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await authApi.updateProfile({ phone_whatsapp: phone });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan nomor telepon');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !loading && onClose()}
      />

      {/* Modal Container */}
      <div className="z-10 w-full max-w-md overflow-hidden rounded-sm border border-white/10 bg-gr-bg-elevated p-8 backdrop-blur-xl  space-y-6 relative animate-in fade-in zoom-in duration-200">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 text-gr-text-primary/40 hover:text-gr-text-primary hover:bg-gr-ink/5 p-2 rounded-sm transition-colors disabled:opacity-30"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-sm border border-gr-orange/20 bg-gr-orange/5 text-gr-orange mb-4 ">
            <Phone size={20} />
          </div>
          <h3 className="font-display text-2xl font-semibold text-gr-text-primary">
            Nomor WhatsApp Diperlukan
          </h3>
          <p className="mt-2 font-sans text-xs text-gr-text-primary/60 max-w-xs leading-relaxed">
            Silakan masukkan nomor WhatsApp Anda agar penjual dapat berkoordinasi mengenai pengiriman pesanan Anda.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded bg-gr-price-unfair/10 p-3 text-xs text-gr-price-unfair border border-gr-price-unfair/20">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="modal-phone" className="block font-sans text-[10px] font-semibold uppercase tracking-wider text-gr-text-primary/50">
              Nomor WhatsApp
            </label>
            <input
              id="modal-phone"
              type="tel"
              placeholder="0812..."
              disabled={loading}
              className="block w-full rounded-md border border-white/10 bg-white/5 px-3 py-3 font-sans text-gr-text-primary placeholder-white/20 focus:border-gr-orange focus:outline-none focus:ring-1 focus:ring-gr-orange sm:text-sm disabled:opacity-50"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={onClose}
              className="flex-1 border-gr-line hover:bg-gr-ink/5 text-gr-ink-soft hover:text-gr-ink font-sans font-bold uppercase tracking-wider py-4 h-12 text-[10px] cursor-pointer"
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gr-orange text-gr-bg hover:bg-gr-orange/90 font-sans font-bold uppercase tracking-wider py-4 h-12 text-[10px] cursor-pointer"
            >
              {loading ? (
                <div className="flex items-center gap-1.5 justify-center">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Menyimpan...</span>
                </div>
              ) : (
                'Simpan & Bayar'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
