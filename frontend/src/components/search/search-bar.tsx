'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Loader2, X, Store } from 'lucide-react';
import { searchApi as semanticSearchApi } from '@/lib/api/search';

interface SearchBarProps {
  onResults: (results: any[], query: string) => void;
  onLoading: (isLoading: boolean) => void;
  onClear: () => void;
  onSearchFarmers?: (query: string) => void;
  className?: string;
  placeholder?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({ 
  onResults, 
  onLoading, 
  onClear,
  onSearchFarmers,
  className = '',
  placeholder = "Cari hasil panen... (misal: 'sayur segar')"
}) => {
  const [query, setQuery] = useState('');
  const [loadingInternal, setLoadingInternal] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const isFirstRender = useRef(true);
  const prevQuery = useRef('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setHasSpeechSupport(true);
      }
    }
  }, []);

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      onClear();
      return;
    }

    setLoadingInternal(true);
    onLoading(true);
    try {
      const results = await semanticSearchApi.semanticSearch(searchQuery);
      onResults(results, searchQuery);
    } catch (error) {
      console.error('Semantic search failed:', error);
      onResults([], searchQuery);
    } finally {
      setLoadingInternal(false);
      onLoading(false);
    }
  }, [onResults, onLoading, onClear]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (query === prevQuery.current) {
      return;
    }

    prevQuery.current = query;

    const timer = setTimeout(() => {
      if (query) {
        handleSearch(query);
      } else {
        onClear();
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [query, handleSearch, onClear]);

  // Handle clicking outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full max-w-md ${className}`}>
      <div className="relative group flex items-center">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-10">
          <Search className="h-4 w-4 text-gr-ink-soft group-focus-within:text-gr-board transition-colors" />
        </div>
        <input
          type="text"
          className="block w-full bg-white/90 hover:bg-white focus:bg-white border border-gr-line hover:border-gr-ink-soft/40 focus:border-gr-board rounded-sm py-2.5 pl-10 pr-9 font-sans text-xs text-gr-ink placeholder:text-gr-ink-soft/50 focus:outline-none focus:ring-1 focus:ring-gr-board/20 transition-all "
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSearch(query);
              setIsFocused(false);
            }
          }}
        />
        <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center gap-1 z-10">
          {/* Voice Search Button for Farmer Accessibility */}
          {hasSpeechSupport && (
            <button
              type="button"
              onClick={() => {
                const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                if (SpeechRecognition) {
                  const recognition = new SpeechRecognition();
                  recognition.lang = 'id-ID';
                  recognition.start();
                  setLoadingInternal(true);
                  recognition.onresult = (event: any) => {
                    const transcript = event.results[0][0].transcript;
                    setQuery(transcript);
                    handleSearch(transcript);
                    setLoadingInternal(false);
                  };
                  recognition.onerror = () => setLoadingInternal(false);
                  recognition.onend = () => setLoadingInternal(false);
                }
              }}
              className="p-1 rounded-sm hover:bg-gr-paper text-gr-ink-soft hover:text-gr-board transition-colors cursor-pointer"
              title="Pencarian Suara (Bicara untuk mencari)"
              aria-label="Pencarian suara"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
          )}

          {loadingInternal ? (
            <Loader2 className="h-3.5 w-3.5 text-gr-board animate-spin" />
          ) : query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                onClear();
              }}
              className="p-0.5 rounded-sm hover:bg-gr-paper text-gr-ink-soft hover:text-gr-ink transition-colors cursor-pointer"
              title="Hapus pencarian"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Autocomplete Suggestion Dropdown */}
      {isFocused && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#FAF9F5]/95 backdrop-blur-md border border-gr-line rounded-sm  z-50 overflow-hidden font-sans text-xs text-gr-ink animate-in fade-in slide-in-from-top-1 duration-150">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault(); // Prevent input blur from firing before action
              if (onSearchFarmers) {
                onSearchFarmers(query);
              }
              setIsFocused(false);
            }}
            className="w-full text-left px-4 py-3 hover:bg-gr-ink/5 flex items-center gap-2 border-b border-gr-line/40 transition-colors font-semibold"
          >
            <Store className="h-4 w-4 text-gr-board" />
            <span>Cari Petani "{query}"</span>
          </button>
          <div className="px-4 py-1.5 bg-gr-ink/5 font-mono text uppercase tracking-widest text-gr-ink-soft border-b border-gr-line/30">
            Saran Pencarian Produk
          </div>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSearch(query);
              setIsFocused(false);
            }}
            className="w-full text-left px-4.5 py-2.5 hover:bg-gr-ink/5 flex items-center gap-2 transition-colors text-gr-ink-soft hover:text-gr-ink"
          >
            <Search className="h-3.5 w-3.5 opacity-65" />
            <span>{query.toLowerCase()}</span>
          </button>
        </div>
      )}
    </div>
  );
};
