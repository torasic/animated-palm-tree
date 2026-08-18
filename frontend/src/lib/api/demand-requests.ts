import { apiClient, BASE_URL, WS_BASE_URL } from './client';

export const demandRequestsApi = {
  createDemandRequest: async (data: {
    commodity_name: string;
    category: string;
    quantity_kg_needed: number;
    price_per_kg: number;
    deadline: string;
    latitude: number;
    longitude: number;
  }) => {
    const response = await apiClient('/demand-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.json();
  },

  getOpenDemandRequests: async () => {
    const response = await apiClient('/demand-requests', {
      method: 'GET',
    });
    return response.json();
  },

  getMyDemandRequests: async () => {
    const response = await apiClient('/demand-requests/mine', {
      method: 'GET',
    });
    return response.json();
  },

  getDemandRequestById: async (id: string) => {
    const response = await apiClient(`/demand-requests/${id}`, {
      method: 'GET',
    });
    return response.json();
  },

  commitSupply: async (id: string, quantityKg: number) => {
    const response = await apiClient(`/demand-requests/${id}/commit`, {
      method: 'POST',
      body: JSON.stringify({ quantity_kg: quantityKg }),
    });
    return response.json();
  },

  getCommittedDemandRequests: async () => {
    const response = await apiClient('/demand-requests/committed', {
      method: 'GET',
    });
    return response.json();
  },

  getDemandMatchingCandidates: async (id: string) => {
    const response = await apiClient(`/demand-requests/${id}/candidates`, {
      method: 'GET',
    });
    return response.json();
  },

  matchDemandRequest: async (id: string, productId: string, quantityKg?: number) => {
    const response = await apiClient(`/demand-requests/${id}/match`, {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, quantity_kg: quantityKg }),
    });
    return response.json();
  },

  checkoutDemand: async (id: string, successRedirectUrl: string, failureRedirectUrl: string, transactionId?: string) => {
    let url = `/demand-requests/${id}/checkout?success_redirect_url=${encodeURIComponent(successRedirectUrl)}&failure_redirect_url=${encodeURIComponent(failureRedirectUrl)}`;
    if (transactionId) {
      url += `&transaction_id=${transactionId}`;
    }
    const response = await apiClient(url, {
      method: 'POST',
    });
    return response.json();
  },

  confirmDemandReceived: async (id: string, transactionId?: string) => {
    const url = transactionId
      ? `/demand-requests/${id}/confirm-received?transaction_id=${transactionId}`
      : `/demand-requests/${id}/confirm-received`;
    const response = await apiClient(url, {
      method: 'POST',
    });
    return response.json();
  },

  disputeDemand: async (id: string) => {
    const response = await apiClient(`/demand-requests/${id}/dispute`, {
      method: 'POST',
    });
    return response.json();
  },

  cancelDemandTransaction: async (id: string, transactionId: string) => {
    const response = await apiClient(`/demand-requests/${id}/transactions/${transactionId}/cancel`, {
      method: 'POST',
    });
    return response.json();
  },

  cancelDemandRequest: async (id: string) => {
    const response = await apiClient(`/demand-requests/${id}/cancel`, {
      method: 'POST',
    });
    return response.json();
  },

  updateFulfillmentStatus: async (id: string, status: 'SIAP_DIANTAR' | 'SIAP_DIAMBIL', transactionId?: string) => {
    const url = transactionId
      ? `/demand-requests/${id}/transactions/${transactionId}/fulfillment-status`
      : `/demand-requests/${id}/fulfillment-status`;
    const response = await apiClient(url, {
      method: 'PATCH',
      body: JSON.stringify({ fulfillment_status: status }),
    });
    return response.json();
  },
};

// WebSocket Hook for real-time status updates
import { useEffect, useState } from 'react';

export function useDemandSocket(id: string | null) {
  const [liveData, setLiveData] = useState<{
    quantity_kg_committed?: number;
    status?: string;
    num_petani_committed?: number;
    payment_status?: string;
    escrow_status?: string;
    fulfillment_status?: string;
    marked_ready_at?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    if (!id) return;

    const wsUrl = `${WS_BASE_URL}/ws/demand-requests/${id}`;
    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLiveData(data);
      } catch (err) {
        console.error('Failed to parse demand websocket message:', err);
      }
    };

    return () => {
      socket.close();
    };
  }, [id]);

  return liveData;
}
