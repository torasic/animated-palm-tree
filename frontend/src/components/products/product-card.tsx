'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';

interface ProductCardProps {
  product: any;
  index: number;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, index }) => {
  const price = product.price_per_kg;
  const refPrice = product.reference_price_per_kg;

  const isNew = new Date().getTime() - new Date(product.created_at).getTime() < 24 * 60 * 60 * 1000;
  const isLowStock = product.quantity_kg < 5;

  let statusText = product.status || 'Tersedia';
  let statusColor = 'text-gr-up';
  let swatchBg = 'bg-gr-up';

  if (isLowStock || statusText === 'Stok Menipis') {
    statusText = 'Stok Menipis';
    statusColor = 'text-gr-down';
    swatchBg = 'bg-gr-down';
  } else if (isNew) {
    statusText = 'Baru';
    statusColor = 'text-gr-up';
    swatchBg = 'bg-gr-up';
  }

  const hasRating = product.seller_rating_count > 0 && product.seller_rating_avg != null;
  const formattedRating = hasRating ? Number(product.seller_rating_avg).toFixed(1) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.4, 
        delay: index * 0.05,
        ease: [0.21, 0.47, 0.32, 0.98] 
      }}
      className="w-full h-full flex"
    >
      <div className="group relative flex flex-col justify-between bg-white/30 backdrop-blur-xs border border-gr-line rounded-sm p-4 hover:border-gr-ink transition-all duration-300 w-full h-full">
        <Link href={`/produk/${product.id}`} className="absolute inset-0 z-10" />

        {/* Top Content: Photo & Meta */}
        <div>
          {/* Photo Container - Flat 2-4px rounded border */}
          <div className="relative aspect-square w-full overflow-hidden bg-gr-paper/40 border border-gr-line rounded-sm mb-3">
            <Image
              src={product.photo_url || '/placeholder-crop.jpg'}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>

          {/* Status Label (Fig.1 Panel Style: square swatch + font-mono uppercase text) */}
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest mb-2">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 ${swatchBg} flex-shrink-0`} />
              <span className={statusColor}>{statusText}</span>
            </div>
            {product.category && (
              <span className="text-gr-ink-soft truncate max-w-[110px]" title={product.category}>
                {product.category}
              </span>
            )}
          </div>

          {/* Product Title */}
          <h3 className="font-display text-xl font-semibold text-gr-ink group-hover:text-gr-board transition-colors line-clamp-2 mb-2 leading-snug">
            {product.name}
          </h3>
        </div>

        {/* Bottom Content: Price, Seller & Stock */}
        <div className="pt-3 border-t border-gr-line/60 mt-auto">
          {/* Price - Large tabular font-mono */}
          <div className="font-mono text-2xl font-bold text-gr-ink tracking-tight tabular-nums">
            Rp {Math.round(price).toLocaleString('id-ID')}
            <span className="font-sans font-medium text-xs text-gr-ink-soft ml-1">/kg</span>
          </div>

          {/* Reference price comparison if available */}
          {refPrice && (
            <div className="font-mono text-[10px] text-gr-ink-soft mt-0.5">
              Acuan PIHPS: Rp {Math.round(refPrice).toLocaleString('id-ID')}/kg
            </div>
          )}

          {/* Seller, Rating & Stock footer */}
          <div className="flex items-center justify-between font-mono text-[10px] text-gr-ink-soft mt-3 pt-2 border-t border-dashed border-gr-line/40">
            <span className="truncate max-w-[120px]" title={product.seller_name || 'Petani'}>
              {product.seller_name || 'Petani'}
              {formattedRating && ` · ★ ${formattedRating}`}
            </span>
            <span>
              Stok {product.quantity_kg} kg
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
