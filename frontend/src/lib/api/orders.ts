import { apiClient, BASE_URL, WS_BASE_URL } from './client';

export const ordersApi = {
  createOrder: async (data: { product_id: string; quantity_kg: number }) => {
    const response = await apiClient('/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.json();
  },

  getOrders: async () => {
    const response = await apiClient('/orders', {
      method: 'GET',
    });
    return response.json();
  },

  getIncomingOrders: async (skip = 0, limit = 20) => {
    const response = await apiClient(`/orders/incoming?skip=${skip}&limit=${limit}`, {
      method: 'GET',
    });
    return response.json();
  },

  getMyPurchases: async (skip = 0, limit = 20) => {
    const response = await apiClient(`/orders/my-purchases?skip=${skip}&limit=${limit}`, {
      method: 'GET',
    });
    return response.json();
  },

  updateOrderStatus: async (orderId: string, status: string) => {
    const response = await apiClient(`/orders/${orderId}/status?status=${status}`, {
      method: 'PATCH',
    });
    return response.json();
  },

  confirmOrderSuccess: async (orderId: string) => {
    const response = await apiClient(`/orders/${orderId}/confirm-success`, {
      method: 'PATCH',
    });
    return response.json();
  },

  checkoutOrder: async (orderId: string, successRedirectUrl: string, failureRedirectUrl: string) => {
    const response = await apiClient(
      `/orders/${orderId}/checkout?success_redirect_url=${encodeURIComponent(successRedirectUrl)}&failure_redirect_url=${encodeURIComponent(failureRedirectUrl)}`,
      {
        method: 'POST',
      }
    );
    return response.json();
  },

  confirmOrderReceived: async (orderId: string) => {
    const response = await apiClient(`/orders/${orderId}/confirm-received`, {
      method: 'POST',
    });
    return response.json();
  },

  disputeOrder: async (orderId: string) => {
    const response = await apiClient(`/orders/${orderId}/dispute`, {
      method: 'POST',
    });
    return response.json();
  },
};

// WebSocket Hook for real-time status updates
import { useEffect, useState } from 'react';

export function useOrderSocket(orderId: string | null) {
  const [data, setData] = useState<{
    status: string | null;
    payment_status: string | null;
    escrow_status: string | null;
  }>({
    status: null,
    payment_status: null,
    escrow_status: null,
  });

  useEffect(() => {
    if (!orderId) return;

    const wsUrl = `${WS_BASE_URL}/ws/orders/${orderId}`;
    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        setData({
          status: payload.status || null,
          payment_status: payload.payment_status || null,
          escrow_status: payload.escrow_status || null,
        });
      } catch (err) {
        console.error('Failed to parse order socket event:', err);
      }
    };

    return () => {
      socket.close();
    };
  }, [orderId]);

  return data;
}
