'use client';

import React from 'react';
import { RatingBadge } from './rating-badge';

interface SellerRatingBadgeProps {
  avgRating: number | null | undefined;
  ratingCount: number | undefined;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
}

export const SellerRatingBadge: React.FC<SellerRatingBadgeProps> = ({
  avgRating,
  ratingCount,
  size,
  showCount,
}) => {
  return (
    <RatingBadge
      avgRating={avgRating}
      ratingCount={ratingCount}
      size={size}
      showCount={showCount}
      newLabel="Penjual Baru"
      countSuffix="transaksi"
    />
  );
};
