'use client';

import React from 'react';
import { Star } from 'lucide-react';

interface RatingBadgeProps {
  avgRating: number | null | undefined;
  ratingCount: number | undefined;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
  newLabel?: string;      // Label shown when there are no ratings (e.g. "Penjual Baru", "Pembeli Baru")
  countSuffix?: string;   // Suffix for rating count (e.g. "transaksi", "permintaan")
}

export const RatingBadge: React.FC<RatingBadgeProps> = ({
  avgRating,
  ratingCount = 0,
  size = 'md',
  showCount = true,
  newLabel = 'Baru',
  countSuffix = 'transaksi',
}) => {
  const hasRating = ratingCount > 0 && avgRating !== null && avgRating !== undefined;

  const sizeClasses = {
    sm: 'text-[10px] gap-1',
    md: 'text-xs gap-1.5',
    lg: 'text-sm gap-2',
  };

  const starSizes = {
    sm: 11,
    md: 13,
    lg: 15,
  };

  if (!hasRating) {
    return (
      <span className={`inline-flex items-center font-sans text-current opacity-60 ${sizeClasses[size]}`}>
        <span>{newLabel}</span>
      </span>
    );
  }

  // Format rating average to 1 decimal place
  const roundedRating = Number(avgRating).toFixed(1);

  return (
    <div className={`inline-flex items-center font-mono ${sizeClasses[size]}`}>
      <span className="flex items-center gap-0.5 text-amber-400">
        <Star size={starSizes[size]} fill="currentColor" className="stroke-none" />
        <span className="font-bold">{roundedRating}</span>
      </span>
      {showCount && (
        <span className="text-current opacity-60 font-sans">
          ({ratingCount} {countSuffix})
        </span>
      )}
    </div>
  );
};
