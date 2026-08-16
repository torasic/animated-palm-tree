'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, setSupabaseCustomToken } from '../lib/supabase';
import { authApi } from '../lib/api/auth';

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Authenticate Supabase client with custom token from backend
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { token } = await authApi.getSupabaseToken();
        if (token) {
          setSupabaseCustomToken(token);
          setAuthenticated(true);
        }
      } catch (err) {
        console.error('Failed to retrieve Supabase authentication token:', err);
        setRealtimeStatus('disconnected');
      }
    };

    initAuth();
  }, []);

  // Fetch current user details from backend cookie auth
  useEffect(() => {
    const loadUser = async () => {
      try {
        const u = await authApi.getMe();
        setCurrentUser(u);
      } catch (err) {
        console.error('Failed to load current user profile:', err);
      }
    };
    loadUser();
  }, []);

  // Fetch initial message history
  const fetchMessages = useCallback(async () => {
    if (!conversationId || !authenticated) return;
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('messages')
        .select(`
          *,
          products (
            id,
            name,
            photo_url
          )
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      // Mark loaded messages as status: 'sent'
      const loadedMessages = (data || []).map(m => ({ ...m, status: 'sent' }));
      setMessages(loadedMessages);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat history pesan');
    } finally {
      setLoading(false);
    }
  }, [conversationId, authenticated]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Subscribe to Realtime changes for new messages in this conversation
  useEffect(() => {
    if (!conversationId || !authenticated) return;

    setRealtimeStatus('connecting');
    const channelName = `messages_room_${conversationId}_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMessage = payload.new;

          // Fetch product context details if product_id is attached to message
          let productInfo = null;
          if (newMessage.product_id) {
            const { data: prod } = await supabase
              .from('products')
              .select('id, name, photo_url')
              .eq('id', newMessage.product_id)
              .single();
            productInfo = prod;
          }

          const messageWithProduct = {
            ...newMessage,
            status: 'sent',
            products: productInfo,
          };

          setMessages((prev) => {
            // If the message is from the current user, try to replace the matching optimistic message
            if (newMessage.sender_id === currentUser?.id) {
              const optIndex = prev.findIndex(
                (m) => m.status === 'sending' && m.content === newMessage.content
              );
              if (optIndex !== -1) {
                const nextMessages = [...prev];
                nextMessages[optIndex] = messageWithProduct;
                return nextMessages;
              }
            }

            const exists = prev.some((m) => m.id === newMessage.id);
            if (exists) return prev;
            return [...prev, messageWithProduct];
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
        } else if (status === 'TIMED_OUT') {
          setRealtimeStatus('connecting');
        } else if (status === 'CHANNEL_ERROR') {
          setRealtimeStatus('disconnected');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, authenticated]);

  // Internal helper to insert a message to Supabase
  const performSendMessage = useCallback(async (tempId: string, content: string, productId?: string) => {
    try {
      if (!currentUser) throw new Error('User session not found');

      // Insert message
      const { data: insertedMessage, error: insertError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: currentUser.id,
          content,
          product_id: productId || null,
        })
        .select(`
          *,
          products (
            id,
            name,
            photo_url
          )
        `)
        .single();

      if (insertError) throw insertError;

      // Update parent conversation's last_message_at
      const { error: updateError } = await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      if (updateError) {
        console.error('Failed to update conversation last_message_at:', updateError);
      }

      // Replace the optimistic message with the final sent message
      setMessages((prev) => {
        const alreadyAppended = prev.some((msg) => msg.id === insertedMessage.id);
        if (alreadyAppended) {
          return prev.filter((msg) => msg.id !== tempId);
        }
        return prev.map((msg) => (msg.id === tempId ? { ...insertedMessage, status: 'sent' } : msg));
      });
    } catch (err: any) {
      console.error('Failed to send message:', err);
      // Mark optimistic message as error
      setMessages((prev) =>
        prev.map((msg) => (msg.id === tempId ? { ...msg, status: 'error' } : msg))
      );
    }
  }, [conversationId, currentUser]);

  // Send a message with Optimistic Update
  const sendMessage = useCallback(async (content: string, productId?: string) => {
    if (!conversationId || !authenticated) {
      throw new Error('Supabase client is not authenticated or no conversation selected');
    }
    if (!currentUser) {
      throw new Error('User session not found');
    }

    const tempId = `opt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Fetch product details for optimistic preview if productId is present
    let productPreview = null;
    if (productId) {
      try {
        const { data: prod } = await supabase
          .from('products')
          .select('id, name, photo_url')
          .eq('id', productId)
          .single();
        productPreview = prod;
      } catch (_) {}
    }

    const optimisticMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: currentUser.id,
      content,
      product_id: productId || null,
      created_at: new Date().toISOString(),
      read_at: null,
      status: 'sending',
      products: productPreview
    };

    // Optimistically add message
    setMessages((prev) => [...prev, optimisticMessage]);

    // Perform actual database insert asynchronously
    performSendMessage(tempId, content, productId);
  }, [conversationId, authenticated, currentUser, performSendMessage]);

  // Retry sending a failed message
  const retryMessage = useCallback(async (tempId: string) => {
    const failedMsg = messages.find((m) => m.id === tempId);
    if (!failedMsg) return;

    // Reset status to sending
    setMessages((prev) =>
      prev.map((msg) => (msg.id === tempId ? { ...msg, status: 'sending' } : msg))
    );

    // Re-request database insert
    performSendMessage(tempId, failedMsg.content, failedMsg.product_id);
  }, [messages, performSendMessage]);

  // Mark all unread messages from the other user as read
  const markAsRead = useCallback(async () => {
    if (!conversationId || !authenticated || !currentUser) return;

    // Fast check: check if we actually have any unread messages from the other participant
    const hasUnread = messages.some(
      (msg) => msg.sender_id !== currentUser.id && msg.read_at === null
    );
    if (!hasUnread) return;

    try {
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('messages')
        .update({ read_at: now })
        .eq('conversation_id', conversationId)
        .neq('sender_id', currentUser.id)
        .is('read_at', null);

      if (updateError) throw updateError;

      // Update local state messages to read status
      setMessages((prev) => {
        const stillHasUnread = prev.some(
          (msg) => msg.sender_id !== currentUser.id && msg.read_at === null
        );
        if (!stillHasUnread) return prev;

        return prev.map((msg) =>
          msg.sender_id !== currentUser.id && msg.read_at === null
            ? { ...msg, read_at: now }
            : msg
        );
      });
    } catch (err) {
      console.error('Failed to mark messages as read:', err);
    }
  }, [conversationId, authenticated, currentUser?.id, messages]);

  return {
    messages,
    loading,
    error,
    realtimeStatus,
    sendMessage,
    retryMessage,
    markAsRead,
    refetch: fetchMessages,
  };
}
