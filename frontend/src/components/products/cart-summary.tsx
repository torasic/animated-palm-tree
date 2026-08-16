'use client';

import React, { useState } from 'react';
import { ShoppingCart, X, Trash2, Loader2, CheckCircle2, AlertCircle, ShieldAlert } from 'lucide-react';
import { ordersApi } from '@/lib/api/orders';
import { authApi } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';


interface CartSummaryProps {
  cart: string[];
  products: any[];
  onRemoveFromCart: (id: string) => void;
  onCheckoutSuccess: (succeededIds: string[]) => void;
}

export function CartSummary({ cart, products, onRemoveFromCart, onCheckoutSuccess }: CartSummaryProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [currentItemName, setCurrentItemName] = useState('');
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [results, setResults] = useState<{
    succeeded: string[];
    failed: { id: string; name: string; reason: string }[];
  } | null>(null);

  // Map cart product IDs to actual product objects from the homepage products list
  const cartItems = cart
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean);

  const totalPrice = cartItems.reduce((sum, item) => sum + item.price_per_kg, 0);

  const handleCheckoutAll = async () => {
    await proceedToCheckoutAll();
  };

  const proceedToCheckoutAll = async () => {
    setCheckingOut(true);
    setResults(null);
    const succeeded: string[] = [];
    const failed: { id: string; name: string; reason: string }[] = [];

    for (const productId of cart) {
      const prod = products.find((p) => p.id === productId);
      const name = prod ? prod.name : 'Produk';
      
      setCurrentItemName(name);

      try {
        await ordersApi.createOrder({ product_id: productId, quantity_kg: 1 });
        succeeded.push(productId);
      } catch (err: any) {
        failed.push({
          id: productId,
          name,
          reason: err.message || 'Gagal membuat pesanan',
        });
      }
    }

    setCheckingOut(false);
    setCurrentItemName('');
    setResults({ succeeded, failed });

    // Clear only succeeded items from the homepage state cart
    onCheckoutSuccess(succeeded);
  };

  const handleCloseResults = () => {
    setResults(null);
    if (cart.length === 0) {
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-sm bg-gr-green text-gr-bg  hover:scale-105 active:scale-95 transition-transform duration-200 cursor-pointer border border-white/10"
      >
        <ShoppingCart size={24} />
        <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-sm bg-gr-live font-mono text-xs font-bold text-white  animate-pulse">
          {cart.length}
        </span>
      </button>

      {/* Drawer Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
          onClick={() => !checkingOut && setIsOpen(false)}
        />
      )}

      {/* Drawer Panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-full max-w-md bg-gr-bg border-l border-white/10 p-6  flex flex-col justify-between transform transition-transform duration-300 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
          <div>
            <h2 className="font-display text-2xl font-medium text-gr-text-primary">Keranjang Belanja</h2>
            <p className="font-mono text-[10px] uppercase tracking-widest text-gr-text-primary/40 mt-1">
              Mode Jelajah • {cart.length} Item
            </p>
          </div>
          <button
            onClick={() => !checkingOut && setIsOpen(false)}
            disabled={checkingOut}
            className="rounded-sm p-2 text-gr-text-primary/60 hover:text-gr-text-primary hover:bg-gr-ink/5 disabled:opacity-30 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Section */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {checkingOut && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <Loader2 className="h-10 w-10 text-gr-green animate-spin" />
              <div>
                <span className="font-mono text-xs uppercase tracking-widest text-gr-text-primary/40">
                  Sedang Checkout...
                </span>
                <h3 className="font-display text-xl text-gr-green mt-2 animate-pulse">
                  {currentItemName}
                </h3>
              </div>
            </div>
          )}

          {!checkingOut && results && (
            <div className="space-y-6 py-6">
              <div className="flex items-center gap-3 bg-white/5 p-4 border border-white/10 rounded-sm">
                <CheckCircle2 className="text-gr-green shrink-0" size={32} />
                <div>
                  <h3 className="font-display text-lg text-gr-text-primary">Checkout Selesai</h3>
                  <p className="font-sans text-xs text-gr-text-primary/60 mt-1">
                    Berikut ringkasan transaksi Anda.
                  </p>
                </div>
              </div>

              <div className="space-y-3 font-mono text-xs uppercase tracking-wider">
                <div className="flex justify-between text-gr-green border-b border-white/5 pb-2">
                  <span>Berhasil Dipesan</span>
                  <span>{results.succeeded.length} Produk</span>
                </div>
                {results.failed.length > 0 && (
                  <div className="text-gr-price-unfair border-b border-white/5 pb-2">
                    <div className="flex justify-between">
                      <span>Gagal Dipesan</span>
                      <span>{results.failed.length} Produk</span>
                    </div>
                    <ul className="mt-3 space-y-2 font-sans normal-case tracking-normal text-[11px] text-gr-price-unfair/80 bg-gr-price-unfair/5 p-3 rounded border border-gr-price-unfair/10">
                      {results.failed.map((f, idx) => (
                        <li key={idx} className="flex gap-2">
                          <AlertCircle size={14} className="shrink-0 mt-0.5" />
                          <span><strong>{f.name}</strong>: {f.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button 
                  onClick={handleCloseResults} 
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-sans font-bold uppercase tracking-wider h-12"
                >
                  Tutup
                </Button>
                {results.succeeded.length > 0 && (
                  <Button 
                    onClick={() => router.push('/pesanan')} 
                    className="flex-1 bg-gr-green text-gr-bg hover:bg-gr-green/90 font-sans font-bold uppercase tracking-wider h-12"
                  >
                    Lihat Pesanan
                  </Button>
                )}
              </div>
            </div>
          )}

          {!checkingOut && !results && cartItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <ShoppingCart className="h-12 w-12 text-gr-text-primary/20 mb-4" />
              <p className="font-sans text-sm text-gr-text-primary/40 max-w-xs leading-relaxed">
                Keranjang kosong. Geser kanan (swipe right) produk di mode Jelajah untuk memasukkannya ke sini.
              </p>
            </div>
          )}

          {!checkingOut && !results && cartItems.length > 0 && (
            <div className="space-y-3">
              {cartItems.map((item: any) => (
                <div 
                  key={item.id} 
                  className="flex items-center justify-between bg-white/5 border border-white/10 p-3 rounded-lg hover:border-gr-green/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <img 
                      src={item.photo_url || '/placeholder-crop.jpg'} 
                      alt={item.name} 
                      className="h-12 w-12 object-cover rounded-md border border-white/10 grayscale-[0.2]"
                    />
                    <div>
                      <h4 className="font-sans text-sm font-semibold text-gr-text-primary">{item.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-[9px] uppercase tracking-widest text-gr-green">
                          {item.category}
                        </span>
                        <span className="text-[10px] text-gr-text-primary/40">• Stok {item.quantity_kg} kg</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm text-gr-green">
                      Rp {Math.round(item.price_per_kg).toLocaleString('id-ID')}
                    </span>
                    <button
                      onClick={() => onRemoveFromCart(item.id)}
                      className="text-gr-text-primary/40 hover:text-gr-price-unfair hover:bg-gr-price-unfair/5 p-2 rounded transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Panel */}
        {!checkingOut && !results && cartItems.length > 0 && (
          <div className="border-t border-white/5 pt-4 mt-4 space-y-4 bg-gr-bg">
            <div className="flex justify-between items-baseline">
              <span className="font-sans text-xs uppercase tracking-wider text-gr-text-primary/40">Total Estimasi</span>
              <span className="font-mono text-2xl text-gr-green">
                Rp {Math.round(totalPrice).toLocaleString('id-ID')}
              </span>
            </div>

            {/* Security Disclaimer */}
            <div className="flex items-start gap-2.5 bg-gr-orange/5 border border-gr-orange/20 p-3.5 rounded-none">
              <ShieldAlert className="text-gr-orange shrink-0 mt-0.5" size={14} />
              <div className="font-sans text-[10px] leading-relaxed text-gr-text-primary/70">
                <span className="text-gr-orange font-bold uppercase tracking-wider block mb-0.5 text-[9px]">Pemberitahuan Keamanan</span>
                Hindari pembayaran transfer untuk mengurangi terkena penipuan. Lebih baik lakukan pembayaran secara <strong className="text-gr-green">tunai</strong>.
              </div>
            </div>
            
            <Button
              onClick={handleCheckoutAll}
              className="w-full bg-gr-green text-gr-bg hover:bg-gr-green/90 font-sans font-bold uppercase tracking-[0.2em] py-6 rounded-none transition-all hover:tracking-[0.3em] cursor-pointer"
            >
              Checkout Semua ({cart.length})
            </Button>
          </div>
        )}
      </div>

    </>
  );
}
