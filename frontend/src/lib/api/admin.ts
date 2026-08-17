import { apiClient } from './client';

export interface AdminDisputeResolvePayload {
  action: 'REFUND_BUYER' | 'RELEASE_SELLER';
  admin_note?: string;
}

export const adminApi = {
  getDisputedOrders: async (statusFilter: 'pending' | 'all' = 'all') => {
    const response = await apiClient(`/admin/disputes?status_filter=${statusFilter}`, {
      method: 'GET',
    });
    return response.json();
  },

  resolveDispute: async (orderId: string, data: AdminDisputeResolvePayload) => {
    const response = await apiClient(`/orders/${orderId}/resolve-dispute`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.json();
  },
};
