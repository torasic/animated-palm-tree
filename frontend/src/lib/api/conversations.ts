import { apiClient } from './client';

export const conversationsApi = {
  createConversation: async (productId?: string, sellerId?: string, buyerId?: string) => {
    const response = await apiClient('/conversations', {
      method: 'POST',
      body: JSON.stringify({ 
        product_id: productId || undefined,
        seller_id: sellerId || undefined,
        buyer_id: buyerId || undefined
      }),
    });
    return response.json();
  },

  getConversations: async () => {
    const response = await apiClient('/conversations', {
      method: 'GET',
    });
    return response.json();
  },
};
