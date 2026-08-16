'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  limitOptions?: number[];
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onLimitChange,
  limitOptions,
  className
}: PaginationProps) {
  // Generate pages numbers array with ellipsis
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show page 1
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('...');
      }
      
      // Middle pages range
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      let adjustedStart = start;
      let adjustedEnd = end;
      
      if (currentPage <= 3) {
        adjustedEnd = 4;
      } else if (currentPage >= totalPages - 2) {
        adjustedStart = totalPages - 3;
      }
      
      for (let i = adjustedStart; i <= adjustedEnd; i++) {
        pages.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('...');
      }
      
      // Always show last page
      pages.push(totalPages);
    }
    
    return pages;
  };

  const pageNumbers = getPageNumbers();

  const fromItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const toItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className={cn("flex flex-col sm:flex-row items-center justify-between gap-4 py-4 mt-6 border-t border-gr-line/40 w-full", className)}>
      {/* Items count info */}
      <div className="font-mono text-[11px] text-gr-ink-soft select-none">
        Menampilkan <span className="font-bold text-gr-ink">{fromItem}-{toItem}</span> dari <span className="font-bold text-gr-ink">{totalItems}</span> item
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {/* Dropdown items per page */}
        {onLimitChange && limitOptions && limitOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-sans text-[11px] text-gr-ink-soft select-none">Tampilkan:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="bg-white/40 border border-gr-line text-gr-ink-soft hover:text-gr-ink focus:outline-none focus:border-gr-board/40 rounded-sm px-2 py-1 font-mono text-xs cursor-pointer  transition-all"
            >
              {limitOptions.map((opt) => (
                <option key={opt} value={opt} className="bg-white text-gr-ink font-mono">
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex items-center gap-1.5">
          {/* Previous Button */}
          <button
            onClick={() => currentPage > 1 && onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="h-8 w-8 flex items-center justify-center bg-white/40 border border-gr-line hover:border-gr-ink text-gr-ink-soft hover:text-gr-ink disabled:opacity-30 disabled:hover:border-gr-line disabled:hover:text-gr-ink-soft transition-all rounded-sm  cursor-pointer disabled:cursor-not-allowed"
            title="Halaman Sebelumnya"
          >
            <ChevronLeft size={14} />
          </button>

          {/* Page numbers */}
          {pageNumbers.map((pageNum, idx) => {
            const isEllipsis = typeof pageNum === 'string';
            const isActive = pageNum === currentPage;

            return isEllipsis ? (
              <span
                key={`ellipsis-${idx}`}
                className="h-8 w-8 flex items-center justify-center font-mono text-xs text-gr-ink-soft select-none cursor-default"
              >
                {pageNum}
              </span>
            ) : (
              <button
                key={`page-${pageNum}`}
                onClick={() => onPageChange(pageNum as number)}
                className={cn(
                  "h-8 min-w px-2 flex items-center justify-center font-mono text-xs font-bold transition-all rounded-sm cursor-pointer  border",
                  isActive
                    ? "bg-gr-board text-gr-chalk border-gr-board "
                    : "bg-white/40 border-gr-line text-gr-ink-soft hover:border-gr-ink hover:text-gr-ink"
                )}
              >
                {pageNum}
              </button>
            );
          })}

          {/* Next Button */}
          <button
            onClick={() => currentPage < totalPages && onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="h-8 w-8 flex items-center justify-center bg-white/40 border border-gr-line hover:border-gr-ink text-gr-ink-soft hover:text-gr-ink disabled:opacity-30 disabled:hover:border-gr-line disabled:hover:text-gr-ink-soft transition-all rounded-sm  cursor-pointer disabled:cursor-not-allowed"
            title="Halaman Selanjutnya"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
