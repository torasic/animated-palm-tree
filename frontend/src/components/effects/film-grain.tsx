import React from 'react';

export const FilmGrain: React.FC = () => {
  return (
    <>
      <svg className="pointer-events-none fixed inset-0 h-0 w-0 opacity-0">
        <filter id="grainy">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>
      <div 
        className="pointer-events-none fixed inset-0 z-[9999] opacity-[0.045]" 
        style={{ filter: 'url(#grainy)' }} 
      />
    </>
  );
};

export default FilmGrain;
