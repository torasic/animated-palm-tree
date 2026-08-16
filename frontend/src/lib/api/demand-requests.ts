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

  checkoutDemand: async (id: string, successRedirectUrl: string, failureRedirectUrl: string) => {
    const response = await apiClient(
      `/demand-requests/${id}/checkout?success_redirect_url=${encodeURIComponent(successRedirectUrl)}&failure_redirect_url=${encodeURIComponent(failureRedirectUrl)}`,
      {
        method: 'POST',
      }
    );
    return response.json();
  },

  confirmDemandReceived: async (id: string) => {
    const response = await apiClient(`/demand-requests/${id}/confirm-received`, {
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

  cancelDemandRequest: async (id: string) => {
    const response = await apiClient(`/demand-requests/${id}/cancel`, {
      method: 'POST',
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
