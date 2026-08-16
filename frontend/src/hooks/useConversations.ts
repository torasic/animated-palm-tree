'use client';

import { useState, useEffect, useCallback } from 'react';
import { conversationsApi } from '../lib/api/conversations';

export function useConversations() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await conversationsApi.getConversations();
      setConversations(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat percakapan');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    conversations,
    loading,
    error,
    refetch: fetchConversations,
  };
}
