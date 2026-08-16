'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Tooltip, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cn } from '@/lib/utils';
import { provinceCentroids } from '@/lib/data/province-centroids';
import Link from 'next/link';
import { MapPin } from 'lucide-react';

// Fix for leaflet default icons in Next.js
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom user location marker icon with solid center and pulsing animation ring
const userIcon = typeof window !== 'undefined' ? L.divIcon({
  className: 'custom-user-marker',
  html: '<div class="user-marker-dot"></div><div class="user-marker-pulse"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
}) : undefined;

// Product marker — brand light green teardrop pin with simple center dot
const productIcon = typeof window !== 'undefined' ? L.divIcon({
  className: 'custom-product-marker',
  html: `<div class="pin-animate"><svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 2px 5px rgba(27,58,41,0.25))">
    <path d="M14 1C7.9 1 3 5.9 3 12C3 20 14 37 14 37S25 20 25 12C25 5.9 20.1 1 14 1Z" fill="#e8f5e9" stroke="#2e7d32" stroke-width="1.5"/>
    <circle cx="14" cy="12" r="4.5" fill="#2e7d32"/>
  </svg></div>`,
  iconSize: [28, 38],
  iconAnchor: [14, 38],
  popupAnchor: [0, -38],
}) : undefined;

// Demand marker — circular light orange icon with shopping bag SVG (reverted)
const demandIcon = typeof window !== 'undefined' ? L.divIcon({
  className: 'custom-demand-marker',
  html: '<div class="demand-logo-wrapper"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#fff3e0" stroke="#fb8c00" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
}) : undefined;

// Component to handle map centering and flyTo transition effects
function MapController({ 
  flyToCoords,
  snapToCoords,
  initialCenter,
  initialZoom,
  mode,
  userLocation,
}: { 
  flyToCoords?: [number, number] | null;
  snapToCoords?: [number, number] | null;
  initialCenter: [number, number];
  initialZoom: number;
  mode: 'products' | 'pricing' | 'demands';
  userLocation?: [number, number] | null;
}) {
  const map = useMap();
  const didInit = React.useRef(false);
  const prevMode = React.useRef<string | null>(null);

  // Set initial view once on mount
  useEffect(() => {
    if (!didInit.current) {
      map.setView(initialCenter, initialZoom);
      didInit.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When switching TO products mode from any other mode, fly to user location
  useEffect(() => {
    if (mode === 'products' && prevMode.current !== null && prevMode.current !== 'products' && userLocation) {
      map.flyTo(userLocation, 12, { animate: true, duration: 1.0 });
    }
    prevMode.current = mode;
  }, [mode, userLocation, map]);

  // Fly to explicit destination (province selection in pricing mode)
  const flyToKey = flyToCoords ? `${flyToCoords[0]},${flyToCoords[1]}` : null;
  useEffect(() => {
    if (flyToCoords) {
      const targetZoom = mode === 'pricing' ? 9 : 14;
      map.flyTo(flyToCoords, targetZoom, { animate: true, duration: 1.2 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToKey, map, mode]);

  // Smoothly fly to selected coordinates (cinematic zoom sweep)
  const snapKey = snapToCoords ? `${snapToCoords[0]},${snapToCoords[1]}` : null;
  useEffect(() => {
    if (snapToCoords) {
      map.flyTo(snapToCoords, 15, {
        animate: true,
        duration: 1.2
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapKey, map]);

  return null;
}

interface MapViewProps {
  mode?: 'products' | 'pricing' | 'demands';
  
  // Products mode parameters
  products?: any[];
  radiusKm?: number;
  locationError?: string | null;
  
  // Pricing mode parameters
  pricesByProvince?: Record<string, any[]>;
  selectedProvince?: string | null;
  onSelectProvince?: (province: string) => void;
  
  // Demands mode parameters
  demands?: any[];
  onCommitDemand?: (demand: any) => void;
  
  // Common parameters
  center?: [number, number];
  zoom?: number;
  userLocation?: [number, number] | null;
  className?: string;
  flyToCoords?: [number, number] | null;
}

export const MapView: React.FC<MapViewProps> = ({ 
  mode = 'products',
  products = [],
  radiusKm = 10,
  locationError,
  pricesByProvince = {},
  selectedProvince = null,
  onSelectProvince,
  demands = [],
  onCommitDemand,
  center = [-6.2000, 106.8166], // Default Jakarta
  zoom = 13,
  userLocation,
  className,
  flyToCoords: propFlyToCoords = null
}) => {
  const [activePopup, setActivePopup] = useState<{
    id: string | number;
    type: 'product' | 'demand';
    position: [number, number];
    data: any;
  } | null>(null);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Synchronize activePopup with propFlyToCoords
  useEffect(() => {
    if (propFlyToCoords) {
      const [lat, lng] = propFlyToCoords;
      const matchedProd = products.find(
        (p) => p.latitude === lat && p.longitude === lng
      );
      if (matchedProd) {
        setActivePopup({
          id: matchedProd.id,
          type: 'product',
          position: [matchedProd.latitude, matchedProd.longitude],
          data: matchedProd,
        });
        return;
      }

      const matchedDemand = demands.find(
        (d) => d.latitude === lat && d.longitude === lng
      );
      if (matchedDemand) {
        setActivePopup({
          id: matchedDemand.id,
          type: 'demand',
          position: [matchedDemand.latitude, matchedDemand.longitude],
          data: matchedDemand,
        });
        return;
      }
    }
  }, [propFlyToCoords, products, demands]);

  // Reset active popup when switching modes
  useEffect(() => {
    setActivePopup(null);
  }, [mode]);

  // Determine initial center and zoom based on mode and available data
  let initialCenter: [number, number];
  let initialZoom: number;
  // flyToCoords: used for slow sweep (pricing province)
  // snapToCoords: used for instant snap to a product/demand pin (no lag)
  let flyToCoords: [number, number] | null = null;
  let snapToCoords: [number, number] | null = null;

  if (mode === 'products' || mode === 'demands') {
    initialCenter = userLocation ?? [-2.5489, 118.0149];
    initialZoom = userLocation ? 12 : 5;
    // Sidebar product/demand click → snap (instant, no drift)
    if (propFlyToCoords) snapToCoords = propFlyToCoords;
  } else {
    initialCenter = [-2.5489, 118.0149];
    initialZoom = 5;
    if (selectedProvince && provinceCentroids[selectedProvince]) {
      const centroid = provinceCentroids[selectedProvince];
      flyToCoords = [centroid.lat, centroid.lng];
    }
  }

  // Create styled dot marker icon for each province (no text inside, size scales with density)
  const createProvinceIcon = (provinceName: string, density: number, isSelected: boolean) => {
    const size = Math.min(16, Math.max(10, 8 + density * 0.6));
    const bgColor = isSelected ? 'var(--gr-down)' : 'var(--gr-green)';
    const shadowColor = isSelected ? 'rgba(166, 64, 42, 0.6)' : 'rgba(92, 255, 158, 0.5)';
    const shadowRadius = isSelected ? '12px' : '8px';
    return L.divIcon({
      className: `prov-dot-${provinceName.replace(/\s+/g, '-')}`,
      html: `
        <div style="
          background-color: ${bgColor}; 
          border: 2px solid white; 
          border-radius: 9999px; 
          width: ${size}px; 
          height: ${size}px; 
          box-shadow: 0 0 ${shadowRadius} ${shadowColor};
          transition: all 0.25s ease;
          cursor: pointer;
        "></div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  };

  return (
    <div className={cn("h-full w-full overflow-hidden relative bg-gr-paper", className)}>
      {/* Location warning alert banner */}
      {locationError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-11/12 max-w-md bg-gr-paper/95 border border-gr-line text-gr-ink px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest rounded-sm  backdrop-blur-md text-center flex items-center justify-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-gr-down animate-pulse" />
          <span>{locationError}</span>
        </div>
      )}

      <MapContainer 
        center={initialCenter} 
        zoom={initialZoom} 
        scrollWheelZoom={true}
        zoomControl={false}
        className="h-full w-full z-10"
      >
        <MapController
          initialCenter={initialCenter}
          initialZoom={initialZoom}
          flyToCoords={flyToCoords}
          snapToCoords={snapToCoords}
          mode={mode}
          userLocation={userLocation}
        />
        <ZoomControl key={isMobile ? 'mobile-zoom' : 'desktop-zoom'} position={isMobile ? "topleft" : "bottomright"} />
        
        {/* CartoDB Positron (Light) Tile Layer */}
        <TileLayer
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        {/* User Location Marker & Search Radius Visual */}
        {userLocation && userIcon && (
          <>
            <Marker position={userLocation} icon={userIcon}>
              <Popup className="custom-popup">
                <div className="p-1 font-sans text-xs text-gr-ink font-bold text-center">
                  Lokasi Anda
                </div>
              </Popup>
            </Marker>
            
            {mode === 'products' && (
              <Circle
                center={userLocation}
                radius={radiusKm * 1000}
                pathOptions={{
                  color: 'var(--gr-up)',
                  fillColor: 'var(--gr-up)',
                  fillOpacity: 0.05,
                  weight: 1,
                  dashArray: '4,4'
                }}
              />
            )}
          </>
        )}

        {/* 1. Products Mode Markers */}
        {mode === 'products' && products.map((product) => (
          product.latitude && product.longitude && (
            <Marker 
              key={product.id} 
              position={[product.latitude, product.longitude]}
              icon={productIcon}
              eventHandlers={{
                click: () => {
                  setActivePopup({
                    id: product.id,
                    type: 'product',
                    position: [product.latitude, product.longitude],
                    data: product
                  });
                }
              }}
            />
          )
        ))}

        {/* 1. Demands Mode Markers */}
        {mode === 'demands' && demands.map((demand) => (
          demand.latitude && demand.longitude && (
            <Marker 
              key={demand.id} 
              position={[demand.latitude, demand.longitude]}
              icon={demandIcon}
              eventHandlers={{
                click: () => {
                  setActivePopup({
                    id: demand.id,
                    type: 'demand',
                    position: [demand.latitude, demand.longitude],
                    data: demand
                  });
                }
              }}
            />
          )
        ))}

        {activePopup && (
          <Popup 
            position={activePopup.position}
            offset={activePopup.type === 'product' ? [0, -18] : [0, 9]}
            eventHandlers={{
              remove: () => setActivePopup(null)
            }}
            className="custom-popup"
          >
            {activePopup.type === 'product' ? (
              <div className="p-2 min-w-[170px] max-w-[190px] font-sans text-xs text-gr-ink space-y-2">
                {activePopup.data.photo_url && (
                  <div className="w-full h-20 overflow-hidden rounded-xs border border-gr-line bg-gr-paper/20">
                    <img 
                      src={activePopup.data.photo_url} 
                      alt={activePopup.data.name} 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                )}
                <div className="space-y-0.5">
                  <h3 className="font-display text-xs font-bold text-gr-ink capitalize m-0 leading-tight">
                    {activePopup.data.name}
                  </h3>
                  <span className="inline-block font-mono text-[7px] uppercase tracking-wider text-gr-board bg-gr-board/5 px-1.5 py-0.5 rounded-xs border border-gr-board/15 font-bold mt-1">
                    {activePopup.data.category || 'Hasil Panen'}
                  </span>
                </div>
                
                <div className="h-px bg-gr-line/50" />
                
                <div className="grid grid-cols-2 gap-2 py-0.5 text-[9px]">
                  <div>
                    <span className="block font-mono text-[7px] uppercase tracking-widest text-gr-ink-soft/60 font-bold mb-0.5">Harga</span>
                    <span className="font-mono font-bold text-gr-ink">
                      Rp {Math.round(activePopup.data.price_per_kg).toLocaleString('id-ID')}<span className="text-[7px] font-normal text-gr-ink-soft">/kg</span>
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block font-mono text-[7px] uppercase tracking-widest text-gr-ink-soft/60 font-bold mb-0.5">Stok</span>
                    <span className="font-mono font-bold text-gr-ink">
                      {activePopup.data.quantity_kg.toLocaleString('id-ID')} KG
                    </span>
                  </div>
                </div>

                {activePopup.data.distance_km !== undefined && activePopup.data.distance_km !== null && (
                  <div className="flex items-center gap-1 font-mono text-[9px] text-gr-down bg-[#FAF9F5] border border-gr-line px-1.5 py-0.5 rounded-xs">
                    <MapPin size={9} className="text-gr-down shrink-0" />
                    <span>{activePopup.data.distance_km.toFixed(1)} km dari Anda</span>
                  </div>
                )}

                <Link 
                  href={`/produk/${activePopup.data.id}`}
                  style={{ color: 'var(--gr-chalk)' }}
                  className="w-full bg-gr-board hover:bg-gr-board/90 text-gr-chalk font-mono text font-bold uppercase tracking-widest py-1.5 rounded-sm transition-all text-center block  font-extrabold"
                >
                  Detail Produk
                </Link>
              </div>
            ) : (
              <div className="p-2 min-w-[170px] max-w-[190px] font-sans text-xs text-gr-ink space-y-2">
                <div className="space-y-0.5">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-display text-xs font-bold text-gr-ink capitalize m-0 leading-tight">
                      {activePopup.data.commodity_name}
                    </h3>
                    <span className="font-mono text-[7px] uppercase tracking-wider text-[#e65100] bg-[#e65100]/5 border border-[#e65100]/15 px-1.5 py-0.5 rounded-xs font-bold shrink-0">
                      {activePopup.data.category}
                    </span>
                  </div>
                </div>

                <div className="h-px bg-gr-line/50" />

                <div className="grid grid-cols-2 gap-2 py-0.5 text-[9px]">
                  <div>
                    <span className="block font-mono text-[7px] uppercase tracking-widest text-gr-ink-soft/60 font-bold mb-0.5">Penawaran</span>
                    <span className="font-mono font-bold text-gr-ink">
                      Rp {Math.round(activePopup.data.price_per_kg).toLocaleString('id-ID')}<span className="text-[7px] font-normal text-gr-ink-soft">/kg</span>
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block font-mono text-[7px] uppercase tracking-widest text-gr-ink-soft/60 font-bold mb-0.5">Sisa Kebutuhan</span>
                    <span className="font-mono font-bold text-[#e65100]">
                      {Math.max(0, activePopup.data.quantity_kg_needed - activePopup.data.quantity_kg_committed).toLocaleString('id-ID')} KG
                    </span>
                  </div>
                </div>

                <div className="space-y-0.5 text-[9px] text-gr-ink-soft">
                  <p>Pemohon: <span className="font-semibold text-gr-ink">{activePopup.data.buyer_name || 'Pembeli'}</span></p>
                  <p>Tenggat: <span className="font-semibold text-gr-ink">{new Date(activePopup.data.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span></p>
                </div>

                {activePopup.data.distance_km !== undefined && activePopup.data.distance_km !== null && (
                  <div className="flex items-center gap-1 font-mono text-[9px] text-gr-down bg-[#FAF9F5] border border-gr-line px-1.5 py-0.5 rounded-xs">
                    <MapPin size={9} className="text-gr-down shrink-0" />
                    <span>{activePopup.data.distance_km.toFixed(1)} km dari Anda</span>
                  </div>
                )}

                <button
                  onClick={() => {
                    setActivePopup(null);
                    onCommitDemand?.(activePopup.data);
                  }}
                  style={{ color: '#ffffff' }}
                  className="w-full bg-[#e65100] hover:bg-[#c94000] text-white font-mono text font-bold uppercase tracking-widest py-1.5 rounded-sm transition-all text-center block cursor-pointer  font-extrabold"
                >
                  Penuhi Pasokan
                </button>
              </div>
            )}
          </Popup>
        )}

        {/* 2. Pricing Mode Markers (Indonesian Provinces) */}
        {mode === 'pricing' && Object.entries(pricesByProvince).map(([provName, list]) => {
          const coords = provinceCentroids[provName];
          if (!coords) return null;

          const isSelected = selectedProvince === provName;
          const density = list.length;
          const markerIcon = createProvinceIcon(provName, density, isSelected);

          // Get top 3 commodities
          const topList = list.slice(0, 3);

          return (
            <Marker
              key={provName}
              position={[coords.lat, coords.lng]}
              icon={markerIcon}
              eventHandlers={{
                click: () => onSelectProvince?.(provName)
              }}
            >
              <Tooltip direction="bottom" offset={[0, 8]} opacity={0.9}>
                <span className="font-sans font-bold text-xs text-gr-ink">
                  {provName}
                </span>
              </Tooltip>
              
              <Popup className="custom-popup">
                <div className="p-2 font-sans w-48 text-gr-ink">
                  <h4 className="font-bold text-xs uppercase tracking-wider mb-2 text-gr-down">
                    {provName}
                  </h4>
                  <div className="space-y-1 divide-y divide-gr-line">
                    {topList.map((item: any) => (
                      <div key={item.id} className="flex justify-between items-center py-1 text-[11px]">
                        <span className="font-medium truncate max-w-[100px]" title={item.commodity_name}>
                          {item.commodity_name}
                        </span>
                        <span className="font-mono font-bold text-gr-up shrink-0">
                          Rp {Math.round(item.price_per_kg).toLocaleString('id-ID')}
                        </span>
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={() => onSelectProvince?.(provName)}
                    className="w-full mt-3 bg-gr-board hover:bg-gr-board/90 text-gr-chalk font-mono text-[9px] font-bold uppercase tracking-wider py-1.5 rounded-sm transition-all cursor-pointer"
                  >
                    Lihat Rincian Sidebar
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      
      <style jsx global>{`
        /* Leaflet Popup overrides for clean theme */
        .custom-popup .leaflet-popup-content-wrapper {
          background: var(--gr-paper) !important;
          border-radius: 2px !important;
          border: 1px solid var(--gr-line);
          box-shadow: 0 10px 25px -5px rgba(32, 29, 22, 0.1);
        }
        .custom-popup .leaflet-popup-tip {
          background: var(--gr-paper) !important;
        }
        
        /* Custom User Location Marker Styling */
        .user-marker-dot {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 10px;
          height: 10px;
          background-color: #3b82f6;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 0 6px #3b82f6;
          z-index: 2;
        }
        .user-marker-pulse {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 24px;
          height: 24px;
          background-color: rgba(59, 130, 246, 0.35);
          border-radius: 50%;
          animation: pulse-ring 2s infinite ease-out;
          z-index: 1;
        }

        /* ── SVG Teardrop Pin Markers ───────────────────────────── */
        /* NOTE: Never animate/transform .custom-product-marker or
           .custom-demand-marker directly — Leaflet uses transform on
           those elements to position markers. Animate their inner elements. */
        .custom-product-marker,
        .custom-demand-marker {
          cursor: pointer;
          overflow: visible;
        }

        .custom-product-marker:hover .pin-animate {
          transform: translateY(-3px) scale(1.08);
        }

        /* Inner pinpoint wrapper gets the drop & scale bounce animation */
        .pin-animate {
          display: block;
          transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
          animation: pin-drop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          transform-origin: bottom center;
        }

        /* 🔴 Demand Logo/Pulse Marker */
        .demand-logo-wrapper {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          align-items: center;
          justify-content: center;
          filter: drop-shadow(0 1px 3px rgba(251, 140, 0, 0.3));
          z-index: 2;
          transition: all 0.15s ease;
          animation: dot-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .custom-demand-marker:hover .demand-logo-wrapper {
          transform: translate(-50%, -50%) scale(1.15);
          filter: drop-shadow(0 2px 6px rgba(251, 140, 0, 0.5));
        }


        /* Province dots appear with a pop-in */
        [class^="prov-dot-"] > div {
          animation: dot-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }

        @keyframes pin-drop {
          0% {
            opacity: 0;
            transform: translateY(-14px) scale(0.75);
          }
          60% { opacity: 1; }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes dot-pop {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        @keyframes pulse-ring {
          0% {
            transform: translate(-50%, -50%) scale(0.4);
            opacity: 0.9;
          }
          100% {
            transform: translate(-50%, -50%) scale(2.2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default MapView;
