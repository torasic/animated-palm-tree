'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useConversations } from '@/hooks/useConversations';
import { MessageCircle, User, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { conversations, loading, error, refetch } = useConversations();

  // Extract active conversation ID from path
  const pathParts = pathname.split('/');
  const activeId = pathParts.length > 2 ? pathParts[2] : null;
  const isChatRoomPage = !!activeId;

  // Poll or refresh list on navigation changes
  useEffect(() => {
    refetch();
  }, [pathname, refetch]);

  const formatTime = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  };
  // Lock page scrolling while chat is active to avoid buggy bouncing / double scrollbars
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  return (
    <div className="max-w-[1150px] w-full mx-auto px-4 md:px-8 py-4 md:py-6 h-[calc(100vh-180px)] md:h-[calc(100vh-120px)] min-h-[500px]">
      <div className="w-full flex bg-white/70 dark:bg-[#1E1812]/50 backdrop-blur-md border border-gr-line/80 h-full rounded-sm overflow-hidden  transition-all">
        
        {/* Left Pane: Inbox / Conversation List */}
        <div 
          className={cn(
            "w-full md:w-64 border-r border-gr-line flex flex-col h-full bg-white/20 dark:bg-black/10 min-h-0",
            isChatRoomPage && "hidden md:flex"
          )}
        >
          {/* Header */}
          <div className="py-2.5 px-3 border-b border-gr-line/50 flex items-center justify-between bg-white/40 dark:bg-black/20">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gr-board/10 text-gr-board">
                <MessageCircle size={16} />
              </div>
              <span className="font-sans text-xs uppercase tracking-wider font-bold text-gr-board">Obrolan</span>
            </div>
            {conversations.length > 0 && (
              <span className="font-mono text-[9px] px-2 py-0.5 rounded-sm bg-gr-board/10 text-gr-board font-bold">
                {conversations.length}
              </span>
            )}
          </div>

          {/* List area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {loading && conversations.length === 0 ? (
              <div className="space-y-2 p-1 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-sm bg-white/40 dark:bg-white/5 border border-transparent">
                    <div className="w-9 h-9 rounded-sm bg-gr-ink/10 flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="h-3 w-20 bg-gr-ink/15 rounded-md" />
                        <div className="h-2 w-8 bg-gr-ink/10 rounded-sm" />
                      </div>
                      <div className="h-3 w-full bg-gr-ink/10 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="p-4 text-center text-xs text-gr-down font-mono bg-gr-down/5 rounded-sm border border-gr-down/10 mx-2 mt-2">
                {error}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center gap-3 h-full min-h-[300px]">
                <div className="w-12 h-12 rounded-sm bg-gr-board/5 flex items-center justify-center border border-gr-line/60 text-gr-board/40">
                  <MessageCircle size={22} />
                </div>
                <div>
                  <h5 className="font-sans text-xs font-bold text-gr-ink">Belum Ada Obrolan</h5>
                  <p className="font-sans text-[11px] text-gr-ink-soft mt-1 max-w-[200px] mx-auto leading-relaxed">
                    Mulai chat dari halaman produk yang kamu suka untuk mempermudah transaksi pangan.
                  </p>
                </div>
                <Link
                  href="/"
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-gr-board text-gr-chalk text-[9px] uppercase tracking-wider font-mono font-bold rounded-lg hover:bg-gr-board/90  transition-all"
                >
                  Jelajahi Produk
                </Link>
              </div>
            ) : (
              conversations.map((c) => {
                const isActive = activeId === c.id;
                const otherUser = c.other_participant || {};
                const lastMsg = c.last_message;
                const name = otherUser.full_name || otherUser.email || 'Pengguna';
                const initials = name.charAt(0).toUpperCase();
                
                return (
                  <Link
                    key={c.id}
                    href={`/chat/${c.id}`}
                    className={cn(
                      "block p-3 rounded-sm border border-transparent transition-all duration-200 cursor-pointer relative",
                      isActive 
                        ? "bg-white/80 dark:bg-white/10  border-gr-line/40 font-medium" 
                        : "hover:bg-white/40 dark:hover:bg-white/5 hover:border-gr-line/20"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar initials with style */}
                      <div className="flex-shrink-0 w-9 h-9 rounded-sm bg-gr-board/10 border border-gr-board/20 flex items-center justify-center font-sans font-bold text-xs text-gr-board ">
                        {initials}
                      </div>

                      {/* Content info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="font-sans text font-bold text-gr-ink truncate">
                            {name}
                          </span>
                          <span className="font-mono text-[9px] text-gr-ink-soft whitespace-nowrap">
                            {c.last_message_at ? formatTime(c.last_message_at) : ''}
                          </span>
                        </div>

                        {/* Last message snippet */}
                        <p className="font-sans text-[11px] text-gr-ink-soft truncate pr-4">
                          {lastMsg ? lastMsg.content : 'Belum ada pesan'}
                        </p>

                        {/* Unread badge */}
                        {c.unread_count > 0 && (
                          <div className="mt-2 flex justify-end">
                            <span className="bg-gr-down text-white text-[9px] font-mono font-bold h-5 min-w-5 px-1 rounded-sm flex items-center justify-center border border-white dark:border-black animate-pulse">
                              {c.unread_count}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Chat Window / Content */}
        <div 
          className={cn(
            "flex-1 flex flex-col h-full bg-white/10 dark:bg-black/5 min-h-0 min-w-0",
            !isChatRoomPage && "hidden md:flex"
          )}
        >
          {children}
        </div>

      </div>
    </div>
  );
}
