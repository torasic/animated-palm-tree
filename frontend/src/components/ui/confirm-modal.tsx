'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2, Loader2, X, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Konfirmasi',
  cancelText = 'Batal',
  variant = 'info',
  isLoading = false,
}: ConfirmModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const [refId, setRefId] = React.useState('');

  React.useEffect(() => {
    setMounted(true);
    // Generate a static mock reference ID for the ticket slip on mount
    setRefId(Math.random().toString(36).substring(2, 7).toUpperCase());
  }, []);

  if (!mounted) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          headerTag: '// TINDAKAN KRITIKAL',
          tagColor: 'text-gr-down',
          confirmBtn: 'bg-gr-down hover:bg-gr-down/90 text-gr-chalk border border-gr-ink/40   active:translate-x active:translate-y ',
        };
      case 'warning':
        return {
          headerTag: '// PERINGATAN SISTEM',
          tagColor: 'text-amber-600',
          confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white border border-gr-ink/40   active:translate-x active:translate-y ',
        };
      default:
        return {
          headerTag: '// KONFIRMASI AKSES',
          tagColor: 'text-gr-board',
          confirmBtn: 'bg-gr-board hover:bg-gr-board/90 text-gr-chalk border border-gr-ink/40   active:translate-x active:translate-y ',
        };
    }
  };

  const styles = getVariantStyles();

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          {/* Backdrop using deep ink overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isLoading && onClose()}
            className="fixed inset-0 bg-[#201D16]/65 backdrop-blur-xs cursor-pointer"
          />

          {/* Editorial / Brutalist Paper Slip Card */}
          <motion.div
            initial={{ scale: 0.96, y: 15, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 15, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }}
            className="z-10 w-full max-w-[390px] bg-gr-paper border border-gr-ink/80 p-6  relative flex flex-col gap-4 cursor-default select-none rounded-none"
          >
            {/* Close Button - minimalist X */}
            <button
              onClick={onClose}
              disabled={isLoading}
              className="absolute top-4 right-4 text-gr-ink-soft/45 hover:text-gr-ink hover:bg-gr-ink/5 p-1 rounded-sm transition-all disabled:opacity-30 cursor-pointer border border-transparent hover:border-gr-ink/10"
            >
              <X size={14} className="stroke-[2.5]" />
            </button>

            {/* Header: Ticket Style */}
            <div className="flex flex-col gap-1 pb-3.5 border-b border-dashed border-gr-line pr-7">
              <div className="flex justify-between items-center font-mono text-[9px] font-bold tracking-widest">
                <span className={styles.tagColor}>
                  {styles.headerTag}
                </span>
                <span className="text-gr-ink-soft/45 font-medium">
                  REF: {refId}
                </span>
              </div>
              <h3 className="font-display text-2xl font-bold text-gr-ink leading-tight mt-1">
                {title}
              </h3>
            </div>

            {/* Content Body */}
            <div className="font-sans text-xs text-gr-ink-soft leading-relaxed py-1">
              {description}
            </div>

            {/* Footer / Ticket Summary & Action Buttons */}
            <div className="flex justify-between items-center gap-4 mt-2 pt-4 border-t border-dashed border-gr-line">
              <span className="font-mono text text-gr-ink-soft/40 uppercase tracking-wider">
                *Tindakan Permanen
              </span>
              <div className="flex gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isLoading}
                  onClick={onClose}
                  className="border-gr-ink/60 hover:bg-gr-ink/5 text-gr-ink font-mono text-[9px] font-bold uppercase tracking-widest h-8 px-3 rounded-none transition-all cursor-pointer"
                >
                  {cancelText}
                </Button>
                <Button
                  type="button"
                  disabled={isLoading}
                  onClick={onConfirm}
                  className={`font-mono text-[9px] font-bold uppercase tracking-widest h-8 px-3.5 rounded-none transition-all cursor-pointer ${styles.confirmBtn}`}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-1.5 justify-center">
                      <Loader2 size={11} className="animate-spin" />
                      <span>Memproses...</span>
                    </div>
                  ) : (
                    confirmText
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
