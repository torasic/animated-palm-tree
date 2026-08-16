import React from 'react';
import { cn } from '@/lib/utils';

interface GlowProps {
  color?: string; // CSS variable like 'var(--gr-green)'
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  className?: string;
}

export const Glow: React.FC<GlowProps> = ({
  color = 'var(--gr-green)',
  position = 'center',
  className,
}) => {
  const positionClasses = {
    top: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
    bottom: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
    left: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2',
    right: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
    center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  };

  return (
    <div
      className={cn(
        'pointer-events-none absolute h-[500px] w-[500px] rounded-sm opacity-20 blur-[60px]',
        positionClasses[position],
        className
      )}
      style={{
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
      }}
    />
  );
};

export default Glow;
