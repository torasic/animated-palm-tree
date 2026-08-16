'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { conversationsApi } from '@/lib/api/conversations';
import { useMessages } from '@/hooks/useMessages';
import { ArrowLeft, Send, AlertCircle, ShoppingBag, Loader2, Check, CheckCheck, Sparkles, Scale, User } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const formatMessageTime = (dateStr: string) => {
  if (!dateStr) return '';
  let safeStr = dateStr;
  if (!safeStr.endsWith('Z') && !safeStr.includes('+') && !safeStr.match(/-\d{2}:\d{2}$/)) {
    safeStr = safeStr + 'Z';
  }
  try {
    return new Date(safeStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    return '';
  }
};

const formatMessageDateHeader = (dateStr: string) => {
  if (!dateStr) return '';
  let safeStr = dateStr;
  if (!safeStr.endsWith('Z') && !safeStr.includes('+') && !safeStr.match(/-\d{2}:\d{2}$/)) {
    safeStr = safeStr + 'Z';
  }
  try {
    const d = new Date(safeStr);
    const today = new Date();
    
    const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const diffTime = todayDate.getTime() - dDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Hari Ini';
    }
    if (diffDays === 1) {
      return 'Kemarin';
    }

    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    if (diffDays < 7 && diffDays > 0) {
      return days[d.getDay()];
    }

    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch (err) {
    return '';
  }
};

export default function ChatRoomPage({ params }: { params: React.Usable<{ id: string }> }) {
  const resolvedParams = React.use(params);
  const conversationId = resolvedParams.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetProductId = searchParams?.get('product_id');

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [conversation, setConversation] = useState<any>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [productContextToAdd, setProductContextToAdd] = useState<string | null>(null);

  const {
    messages,
    loading,
    error,
    sendMessage,
    retryMessage,
    markAsRead,
  } = useMessages(conversationId);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMessagesLengthRef = useRef(0);

  // Set product context query parameter once on mount
  useEffect(() => {
    if (targetProductId) {
      setProductContextToAdd(targetProductId);
    }
  }, [targetProductId]);

  // Fetch current user and conversation details
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [u, list] = await Promise.all([
          authApi.getMe(),
          conversationsApi.getConversations(),
        ]);
        setCurrentUser(u);
        const found = list.find((c: any) => c.id === conversationId);
        setConversation(found || null);
      } catch (err) {
        console.error('Failed to load chat details:', err);
      }
    };
    fetchData();
  }, [conversationId]);

  // Mark messages as read on mount and when messages change
  useEffect(() => {
    if (messages.length > 0) {
      markAsRead();
    }
  }, [messages, markAsRead]);

  // Scroll to bottom only when messages list length changes (prevent scroll locking on state updates)
  useEffect(() => {
    if (messages.length > 0 && messages.length !== lastMessagesLengthRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    lastMessagesLengthRef.current = messages.length;
  }, [messages]);

  // Auto-resize textarea height as text grows
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [inputMessage]);

  // Pre-fill product context message if product_id is in query params
  useEffect(() => {
    if (!conversationId || !targetProductId || !currentUser || !conversation) return;

    // Only pre-fill for the buyer
    if (currentUser.id !== conversation.buyer_id) return;

    setInputMessage("Halo, saya tertarik dengan produk ini dan ingin bertanya lebih lanjut.");
    
    // Clean up the URL query parameters to prevent pre-filling again on reload
    router.replace(`/chat/${conversationId}`);
  }, [conversationId, targetProductId, currentUser, conversation, router]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const text = inputMessage;
    setInputMessage('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      // Send message. Only associate product context for the opening/first message (productContextToAdd)
      await sendMessage(text, productContextToAdd || undefined);
      setProductContextToAdd(null); // Clear context immediately after sending
    } catch (err) {
      console.error('Send message failed:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const otherUser = conversation?.other_participant || {};
  const otherName = otherUser.full_name || otherUser.email || 'Pengguna';

  // Ticket calculations for product context
  const product = conversation?.last_product;
  const price = product?.price_per_kg;
  const refPrice = product?.reference_price_per_kg;
  let deltaText = '';
  let isUnderPrice = false;
  if (price && refPrice) {
    const delta = ((refPrice - price) / refPrice) * 100;
    if (delta > 0) {
      deltaText = `Hemat ${delta.toFixed(0)}% dibanding PIHPS`;
      isUnderPrice = true;
    } else if (delta < 0) {
      deltaText = `Harga Premium (+${Math.abs(delta).toFixed(0)}%)`;
    } else {
      deltaText = `Sesuai Pasar PIHPS`;
    }
  }

  const handleIcebreakerClick = (text: string) => {
    setInputMessage(text);
  };

  if (loading && messages.length === 0) {
    return (
      <div className="flex-grow flex flex-col h-full bg-white/10 dark:bg-black/5 animate-pulse min-h-0">
        {/* Header Skeleton */}
        <div className="p-4 border-b border-gr-line/50 flex items-center justify-between bg-white/40 dark:bg-black/25">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 bg-gr-ink/10 rounded-sm md:hidden" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-32 bg-gr-ink/15 rounded-md" />
              <div className="h-2 w-16 bg-gr-ink/10 rounded-sm" />
            </div>
          </div>
          <div className="h-8 w-24 bg-gr-ink/10 rounded-lg" />
        </div>
        {/* Messages Skeleton */}
        <div className="flex-grow overflow-y-auto p-4 space-y-4">
          <div className="flex justify-start">
            <div className="h-9 w-[45%] bg-gr-ink/10 rounded-sm rounded-tl-xs" />
          </div>
          <div className="flex justify-end">
            <div className="h-12 w-[55%] bg-gr-ink/15 rounded-sm rounded-tr-xs" />
          </div>
          <div className="flex justify-start">
            <div className="h-7 w-[30%] bg-gr-ink/10 rounded-sm rounded-tl-xs" />
          </div>
          <div className="flex justify-end">
            <div className="h-9 w-[40%] bg-gr-ink/15 rounded-sm rounded-tr-xs" />
          </div>
          <div className="flex justify-center my-4">
            <div className="h-6 w-[200px] bg-gr-ink/10 rounded-sm" />
          </div>
          <div className="flex justify-start">
            <div className="h-10 w-[50%] bg-gr-ink/10 rounded-sm rounded-tl-xs" />
          </div>
        </div>
        {/* Input Skeleton */}
        <div className="p-4 border-t border-gr-line/50 bg-white/40 dark:bg-black/25 flex gap-2">
          <div className="flex-grow h-10 bg-gr-ink/10 rounded-sm" />
          <div className="h-10 w-10 bg-gr-ink/15 rounded-sm" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow flex flex-col h-full bg-white/10 dark:bg-black/5 min-h-0 relative">
      
      {/* Header */}
      <div className="py-2 px-3 md:py-2 md:px-4 border-b border-gr-line flex items-center justify-between bg-white/80 dark:bg-[#1E1812]/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push('/chat')}
            className="md:hidden p-2 -ml-1 text-gr-ink-soft hover:text-gr-ink hover:bg-gr-line/30 rounded-sm transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          
          <div>
            <h4 className="font-sans text font-bold text-gr-ink flex items-center gap-2">
              {otherName}
            </h4>
          </div>
        </div>

        {otherUser.role === 'PETANI' && (
          <Link
            href={`/petani/${otherUser.id}`}
            className="inline-flex items-center gap-1.5 bg-white/60 hover:bg-white dark:bg-white/5 dark:hover:bg-white/10 text-gr-board hover:text-gr-board/90 border border-gr-line/60 hover:border-gr-ink/30 font-mono text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-sm transition-all cursor-pointer"
          >
            <User size={11} className="shrink-0" />
            <span>Profil Petani</span>
          </Link>
        )}
      </div>

      {/* Chat Area */}
      <div className="flex-grow overflow-y-auto overflow-x-hidden p-4 space-y-4 min-h-0 custom-scrollbar bg-white/20 dark:bg-black/5">

        {/* Empty state: Chat baru dimulai */}
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-8 text-center px-4 max-w-sm mx-auto h-full gap-5">
            {!product && (
              <div className="w-12 h-12 rounded-sm bg-gr-board/5 flex items-center justify-center border border-gr-line/40 text-gr-board/40">
                <Sparkles size={20} />
              </div>
            )}

            <div className="space-y-1">
              <h5 className="font-sans text font-bold text-gr-ink">Mulai Obrolan Baru</h5>
              <p className="font-sans text-[11px] text-gr-ink-soft leading-relaxed">
                Tanyakan ketersediaan produk, waktu panen terbaru, atau diskusikan pengiriman komoditas dengan {product ? (currentUser?.id === product.seller_id ? 'Pembeli' : 'Penjual') : (otherUser.role === 'PETANI' ? 'Penjual' : 'Pembeli')}.
              </p>
            </div>

            {/* Icebreakers suggestions */}
            {product && (
              <div className="w-full space-y-2">
                <span className="font-mono text uppercase tracking-wider text-gr-ink-soft block">Saran Pesan Pembuka:</span>
                <div className="flex flex-col gap-1.5 w-full">
                  {(currentUser?.id === product.seller_id 
                    ? [
                        `Halo, selamat datang! Ada yang bisa saya bantu terkait produk ${product.name}?`,
                        `Halo, stok untuk ${product.name} ready ${product.quantity_kg || 0} kg. Silakan dipesan.`
                      ]
                    : [
                        `Halo, apakah komoditas ${product.name} masih tersedia stoknya?`,
                        `Halo, jika beli grosir untuk ${product.name}, apakah bisa dinegosiasikan harganya?`,
                        `Apakah bisa kirim hari ini untuk produk ${product.name}?`
                      ]
                  ).map((ib, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleIcebreakerClick(ib)}
                      className="text-left px-3 py-2 bg-white/80 dark:bg-white/5 border border-gr-line/60 hover:bg-gr-board/5 hover:border-gr-board/40 rounded-sm text-[10px] text-gr-ink font-sans transition-all leading-normal cursor-pointer hover:-translate-y-px"
                    >
                      {ib}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {(() => {
          const renderedProductIds = new Set<string>();
          let lastDateString = '';
          return messages.map((m) => {
            const isMe = m.sender_id === currentUser?.id;
            const isOptimistic = m.id.toString().startsWith('opt-');
            const isError = m.status === 'error';
            
            const shouldRenderProductContext = m.products && !renderedProductIds.has(m.products.id);
            if (m.products) {
              renderedProductIds.add(m.products.id);
            }

            // Calculate date separation
            let showDateHeader = false;
            let dateHeaderLabel = '';
            if (m.created_at) {
              try {
                let safeStr = m.created_at;
                if (!safeStr.endsWith('Z') && !safeStr.includes('+') && !safeStr.match(/-\d{2}:\d{2}$/)) {
                  safeStr = safeStr + 'Z';
                }
                const msgDateObj = new Date(safeStr);
                const currentMsgDate = msgDateObj.toDateString();
                if (currentMsgDate && currentMsgDate !== 'Invalid Date' && currentMsgDate !== lastDateString) {
                  showDateHeader = true;
                  dateHeaderLabel = formatMessageDateHeader(m.created_at);
                  lastDateString = currentMsgDate;
                }
              } catch (e) {
                console.error(e);
              }
            }

            return (
              <div 
                key={m.id}
                className="w-full flex flex-col"
              >
                {/* Date separator like WhatsApp */}
                {showDateHeader && (
                  <div className="w-full flex justify-center my-4">
                    <span className="font-mono text-[10px] font-bold text-gr-ink-soft bg-[#EDE6D1]/45 dark:bg-white/5 border border-gr-line/50 px-3 py-1 rounded-sm select-none">
                      {dateHeaderLabel}
                    </span>
                  </div>
                )}

                {/* Product link tag shared in chat stream - Redesigned as a System Notice Divider */}
                {shouldRenderProductContext && (
                  <div className="w-full flex flex-col items-center my-4">
                    <div className="w-full flex items-center gap-2 mb-2">
                      <div className="flex-grow h-[1px] bg-gr-line/45" />
                      <span className="font-mono text uppercase tracking-widest text-gr-ink-soft bg-white/80 dark:bg-black/20 px-2 py-0.5 rounded-md border border-gr-line/45 select-none">
                        Konteks Komoditas
                      </span>
                      <div className="flex-grow h-[1px] bg-gr-line/45" />
                    </div>
                    
                    <Link
                      href={`/produk/${m.products!.id}`}
                      className="flex items-center gap-3 p-3 bg-[#EDE6D1]/90 dark:bg-white/5 border border-dashed border-gr-board/40 rounded-sm max-w-xs w-full text-left transition-all hover:bg-[#EDE6D1]  group relative overflow-hidden"
                    >
                      <div className="absolute inset-0 opacity-[0.02] bg-radial from-gr-board" />
                      <div className="p-2 rounded-lg bg-gr-board/10 text-gr-board flex-shrink-0">
                        <ShoppingBag size={14} className="group-hover:-rotate-12 transition-transform" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h6 className="font-sans text-[11px] font-bold text-gr-ink truncate group-hover:text-gr-board transition-colors">
                          {m.products!.name}
                        </h6>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="font-mono text-[9px] text-gr-board font-bold">Bahas Transaksi</span>
                          <span className="w-1 h-1 rounded-full bg-gr-up animate-pulse" />
                        </div>
                      </div>
                  </Link>
                </div>
              )}

              {/* Message Bubble wrapper */}
              <div className={cn("flex flex-col max-w-[75%] min-w-0", isMe ? "items-end ml-auto" : "items-start mr-auto")}>
                <div 
                  className={cn(
                    "w-full px-4 py-3 rounded-sm font-sans text leading-relaxed transition-all relative border break-words",
                    isMe 
                      ? "bg-gr-board text-gr-chalk border-gr-board/30 rounded-tr" 
                      : "bg-white dark:bg-[#1E1812] text-gr-ink border-gr-line/50 rounded-tl"
                  )}
                >
                  <p className="break-words whitespace-pre-wrap">{m.content}</p>

                  {/* Status indicator inside message bubble */}
                  <div className={cn(
                    "mt-1 flex items-center justify-end gap-1 font-mono text select-none",
                    isMe ? "text-gr-chalk-soft/80" : "text-gr-ink-soft/75"
                  )}>
                    <span>
                      {formatMessageTime(m.created_at)}
                    </span>
                    {isMe && (
                      <span className="ml-0.5">
                        {isOptimistic ? (
                          <Loader2 size={8} className="animate-spin text-gr-chalk-soft" />
                        ) : isError ? (
                          <AlertCircle size={8} className="text-gr-down" />
                        ) : m.read_at ? (
                          <CheckCheck size={10} className="text-gr-up" />
                        ) : (
                          <Check size={10} className="text-gr-chalk-soft/80" />
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Retry button for failed messages */}
                {isMe && isError && (
                  <button
                    onClick={() => retryMessage(m.id)}
                    className="mt-1 flex items-center gap-1 font-mono text-[9px] text-gr-down hover:underline cursor-pointer bg-gr-down/5 px-2 py-0.5 rounded-md border border-gr-down/10 transition-colors"
                  >
                    <AlertCircle size={10} />
                    <span>Gagal mengirim. Klik untuk kirim ulang</span>
                  </button>
                )}
              </div>
            </div>
          );
        });
      })()}
      <div ref={messagesEndRef} />
      </div>

      {/* Input box */}
      <form 
        onSubmit={handleSend} 
        className="p-3 md:p-4 border-t border-gr-line bg-white/80 dark:bg-[#1E1812]/80 backdrop-blur-md z-10 sticky bottom-0"
      >
        <div className="flex gap-2 items-center max-w-4xl mx-auto">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tulis pesan ke mitra tani..."
            className="flex-grow px-5 py-[10px] bg-gr-paper/30 border border-gr-line rounded-sm font-sans text text-gr-ink placeholder-gr-ink-soft focus:outline-none focus:border-gr-board focus:ring-2 focus:ring-gr-board/20 transition-all resize-none overflow-y-auto max-h-[120px] min-h-[40px] flex items-center"
          />
          <button
            type="submit"
            disabled={!inputMessage.trim()}
            className="p-2.5 bg-gr-board text-gr-chalk hover:bg-gr-board/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-sm flex items-center justify-center cursor-pointer transition-all hover:scale-105 active:scale-95  flex-shrink-0"
          >
            <Send size={15} />
          </button>
        </div>
      </form>

    </div>
  );
}
