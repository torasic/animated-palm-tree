import { apiClient } from './client';

export interface RatingCreate {
  transaction_type: 'PRODUCT_PURCHASE' | 'DEMAND_FULFILLMENT';
  reference_id: string;
  score: number;
  comment?: string;
}

export interface RatingResponse {
  id: string;
  rater_id: string;
  rated_id: string;
  role_context: 'AS_SELLER' | 'AS_BUYER';
  transaction_type: 'PRODUCT_PURCHASE' | 'DEMAND_FULFILLMENT';
  reference_id: string;
  score: number;
  comment?: string;
  created_at: string;
  rater_name?: string;
}

export const ratingsApi = {
  submitRating: async (data: RatingCreate) => {
    const response = await apiClient('/ratings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.json();
  },

  getUserRatingsAsSeller: async (userId: string) => {
    const response = await apiClient(`/ratings/user/${userId}/seller`, {
      method: 'GET',
    });
    return response.json();
  },

  getUserRatingsAsBuyer: async (userId: string) => {
    const response = await apiClient(`/ratings/user/${userId}/buyer`, {
      method: 'GET',
    });
    return response.json();
  },
};
