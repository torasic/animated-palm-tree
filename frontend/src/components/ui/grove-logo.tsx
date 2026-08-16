'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface GroveLogoProps {
  className?: string;
  iconOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  href?: string;
}

export function GroveLogo({
  className,
  iconOnly = false,
  size = 'md',
  href = '/',
}: GroveLogoProps) {
  const sizeClasses = {
    sm: { icon: 'h-6 w-6', text: 'text-lg' },
    md: { icon: 'h-8 w-8', text: 'text-xl sm:text-2xl' },
    lg: { icon: 'h-10 w-10', text: 'text-2xl sm:text-3xl' },
  };

  const currentSize = sizeClasses[size];

  const content = (
    <div className={cn("inline-flex items-center gap-2 group flex-shrink-0 select-none", className)}>
      {/* 100% Solid & Exact Original Logo Mark — Zero Background, Zero Opacity Loss */}
      <div className={cn("relative flex items-center justify-center transition-transform duration-300 group-hover:scale-105 shrink-0", currentSize.icon)}>
        <img
          src="/logo.svg"
          alt="Grove Logo"
          className="w-full h-full object-contain"
        />
      </div>

      {!iconOnly && (
        <span className={cn("font-display font-bold tracking-tight text-gr-ink leading-none self-center", currentSize.text)}>
          Grove
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="focus:outline-none">
        {content}
      </Link>
    );
  }

  return content;
}
