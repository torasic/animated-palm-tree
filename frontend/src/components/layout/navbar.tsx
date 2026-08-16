'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { cn } from '@/lib/utils';
import { LogOut, LogIn, Leaf, PlusCircle, ClipboardList, Settings, X, AlertCircle, TrendingUp, LineChart, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { GroveLogo } from '@/components/ui/grove-logo';
import { supabase, setSupabaseCustomToken } from '@/lib/supabase';
import { conversationsApi } from '@/lib/api/conversations';
import type { RealtimeChannel } from '@supabase/supabase-js';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const isLanding = pathname === '/';
  const [user, setUser] = useState<any | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showBanner, setShowBanner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await conversationsApi.getConversations();
      const total = data.reduce((sum: number, c: { unread_count: number }) => sum + c.unread_count, 0);
      setUnreadCount(total);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnreadCount(0);
      return;
    }

    let active = true;
    let channel: RealtimeChannel | undefined;
    const initRealtime = async () => {
      try {
        const { token } = await authApi.getSupabaseToken();
        if (!active || !token) return;
        setSupabaseCustomToken(token);

        // Fetch initial unread count
        await fetchUnreadCount();
        if (!active) return;

        // Subscribe to messages table realtime inserts and updates
        const channelName = `navbar_messages_${user.id}_${Math.random().toString(36).substring(2, 9)}`;
        channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload) => {
              const newMsg = payload.new;
              if (newMsg.sender_id !== user.id) {
                fetchUnreadCount();
              }
            }
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'messages' },
            () => {
              fetchUnreadCount();
            }
          )
          .subscribe();
      } catch (err) {
        console.error('Realtime subscription initialization failed:', err);
      }
    };

    initRealtime();

    return () => {
      active = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user?.id, fetchUnreadCount]);

  // Fetch unread count on page navigation
  useEffect(() => {
    if (user?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchUnreadCount();
    }
  }, [pathname, user?.id, fetchUnreadCount]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const userData = await authApi.getMe();
        setUser(userData);
        setShowBanner(false);
        if (userData && !userData.role && pathname !== '/lengkapi-profil') {
          router.push('/lengkapi-profil');
        }
      } catch {
        setUser(null);
        setShowBanner(false);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await authApi.logout();
      setUser(null);
      router.push('/login');
    } catch {
      console.error('Logout failed');
    }
  };

  const getFirstName = (name?: string | null) => {
    if (!name) return '';
    const firstWord = name.trim().split(/\s+/)[0];
    if (firstWord.includes('@')) {
      return firstWord.split('@')[0];
    }
    return firstWord;
  };

  const navItems = [
    { name: 'Beranda', href: '/beranda', icon: Leaf },
    { name: 'Pusat Niaga', href: '/pusat-niaga', icon: TrendingUp },
    { name: 'Tren Harga', href: '/tren-harga', icon: LineChart },
    ...(user && user.role === 'PETANI' ? [{ name: 'Jual', href: '/jual', icon: PlusCircle }] : []),
    ...(user && user.role !== 'PETANI' ? [{ name: 'Ajukan Permintaan', href: '/permintaan-saya', icon: PlusCircle }] : []),
    ...(user ? [{ name: 'Pesanan', href: '/pesanan', icon: ClipboardList }] : []),
    ...(user ? [{ name: 'Chat', href: '/chat', icon: MessageCircle }] : []),
  ];

  return (
    <>


      {/* Main navbar — floating pill island on map page, flat editorial bar on regular pages */}
      {pathname === '/pusat-niaga' ? (
        <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gr-paper/95 backdrop-blur-md border border-gr-line rounded-sm  px-5 py-2 flex items-center justify-between gap-5 max-w-[90vw]">
          {/* Logo */}
          <div className="flex items-center">
            <GroveLogo href="/" size="sm" />
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-gr-line hidden md:block" />

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = item.href === '/pusat-niaga';
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-widest transition-colors duration-200 select-none whitespace-nowrap',
                    isActive
                      ? 'text-gr-chalk bg-gr-board font-bold'
                      : 'text-gr-ink-soft hover:text-gr-ink hover:bg-gr-ink/5'
                  )}
                >
                  <span className="relative flex items-center gap-1.5">
                    <Icon size={11} />
                    <span>{item.name}</span>
                    {item.name === 'Chat' && unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-3.5 bg-gr-down text-gr-chalk text font-bold h-4 w-4 rounded-sm flex items-center justify-center scale-90 border border-gr-paper">
                        {unreadCount}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-gr-line hidden md:block" />

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0 min-h">
            {isLoading ? (
              <div className="h-7 w-16 bg-gr-ink/10 animate-pulse rounded-sm" />
            ) : user ? (
              <div className="flex items-center gap-2">
                <Link
                  href={user.role === 'PETANI' ? `/petani/${user.id}` : '/settings'}
                  className="hidden lg:inline font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft hover:text-gr-board hover:underline cursor-pointer"
                >
                  {getFirstName(user.full_name || user.email) || 'Pengguna'}
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center justify-center h-7 w-7 rounded-sm border border-gr-line hover:border-gr-board/40 text-gr-ink-soft hover:text-gr-board transition-all duration-200 cursor-pointer"
                  title="Pengaturan Profil"
                >
                  <Settings size={13} />
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center h-7 w-7 rounded-sm border border-gr-line hover:border-gr-down/40 text-gr-ink-soft hover:text-gr-down transition-all duration-200 cursor-pointer"
                  title="Keluar"
                >
                  <LogOut size={13} />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="font-mono text-[10px] uppercase tracking-wider bg-gr-board text-gr-chalk hover:bg-gr-board/90 px-3.5 py-1.5 rounded-sm transition-all duration-200 cursor-pointer "
              >
                <span className="flex items-center gap-1.5">
                  <LogIn size={11} />
                  Masuk
                </span>
              </Link>
            )}
          </div>
        </nav>
      ) : (
        <nav className="sticky top-0 z-50 w-full bg-gr-paper/95 backdrop-blur-md border-b border-gr-line">
          <div className={cn(
            "mx-auto py-3.5 flex items-center justify-between gap-4 px-4 sm:px-6 md:px-8",
            pathname.startsWith('/chat') ? "max-w-[1150px]" : "max-w-[1100px]"
          )}>
            {/* Logo */}
            <GroveLogo href="/" size="md" />

            {/* Nav links — animated in/out (hidden on landing page) */}
            <AnimatePresence initial={false}>
              {!isLanding && (
                <motion.div
                  key="nav-tabs"
                  className="hidden md:flex items-center gap-1 overflow-hidden"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  {navItems.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      pathname.startsWith(item.href + '/') ||
                      (item.href === '/permintaan-saya' && pathname === '/ajukan-permintaan');
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'relative flex items-center gap-2 px-3.5 py-1.5 font-mono text-[10px] font-normal uppercase tracking-widest transition-colors duration-200 select-none whitespace-nowrap border-b-2',
                          isActive
                            ? 'text-gr-ink border-gr-board font-bold'
                            : 'text-gr-ink-soft border-transparent hover:text-gr-ink hover:border-gr-line'
                        )}
                      >
                        <span className="relative flex items-center gap-2">
                          <Icon size={11} />
                          <span>{item.name}</span>
                          {item.name === 'Chat' && unreadCount > 0 && (
                            <span className="absolute -top-1.5 -right-3.5 bg-gr-down text-gr-chalk text font-bold h-4 w-4 rounded-sm flex items-center justify-center scale-90 border border-gr-paper">
                              {unreadCount}
                            </span>
                          )}
                        </span>
                      </Link>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div className="flex items-center gap-3 flex-shrink-0 min-h">
              {isLoading ? (
                <div className="h-8 w-16 bg-gr-ink/10 animate-pulse rounded-sm" />
              ) : user ? (
                <div className="flex items-center gap-3">
                  {user.role === 'PETANI' && (
                    <span className="hidden xl:inline font-mono text-[9px] font-bold uppercase tracking-widest text-gr-board border border-gr-board/30 px-2 py-1">
                      Petani/Peternak
                    </span>
                  )}
                  <Link
                    href={user.role === 'PETANI' ? `/petani/${user.id}` : '/settings'}
                    className="hidden lg:inline font-mono text-[9px] uppercase tracking-widest text-gr-ink-soft hover:text-gr-board hover:underline cursor-pointer"
                  >
                    {getFirstName(user.full_name || user.email) || 'Pengguna'}
                  </Link>
                  <Link
                    href="/settings"
                    className="flex items-center justify-center h-8 w-8 border border-gr-line hover:border-gr-board/40 text-gr-ink-soft hover:text-gr-board transition-all duration-200 cursor-pointer"
                    title="Pengaturan Profil"
                  >
                    <Settings size={14} />
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center justify-center h-8 w-8 border border-gr-line hover:border-gr-down/40 text-gr-ink-soft hover:text-gr-down transition-all duration-200 cursor-pointer"
                    title="Keluar"
                  >
                    <LogOut size={14} />
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="font-mono text-[10px] uppercase tracking-wider border border-gr-ink bg-transparent hover:bg-gr-ink hover:text-gr-paper px-4 py-2 transition-all duration-200 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <LogIn size={12} />
                    Masuk
                  </span>
                </Link>
              )}
            </div>

          </div>
        </nav>
      )}
    </>
  );
}
