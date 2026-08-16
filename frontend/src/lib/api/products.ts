import { apiClient, BASE_URL } from './client';

export const productsApi = {
  createProduct: async (formData: FormData) => {
    const response = await fetch(`${BASE_URL}/products`, {
      method: 'POST',
      body: formData,
      // Note: Do not set Content-Type header when sending FormData, 
      // the browser will set it automatically with the boundary
      credentials: 'include',
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `API error: ${response.status}`);
    }
    
    return response.json();
  },

  getProducts: async (skip = 0, limit = 20, sellerId?: string) => {
    let url = `/products?skip=${skip}&limit=${limit}`;
    if (sellerId) {
      url += `&seller_id=${sellerId}`;
    }
    const response = await apiClient(url, {
      method: 'GET',
    });
    return response.json();
  },

  getProductsCount: async () => {
    const response = await apiClient('/products/count', {
      method: 'GET',
    });
    return response.json();
  },

  getProductById: async (id: string) => {
    const response = await apiClient(`/products/${id}`, {
      method: 'GET',
    });
    return response.json();
  },

  getNearbyProducts: async (lat: number, lng: number, radiusKm: number) => {
    const response = await apiClient(`/products/nearby?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`, {
      method: 'GET',
    });
    return response.json();
  },

  updateProduct: async (id: string, data: Record<string, unknown>) => {
    const response = await apiClient(`/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return response.json();
  },
  
  getLiveStats: async () => {
    const response = await apiClient('/reference-prices/count', {
      method: 'GET',
    });
    return response.json();
  },

  getPersonalStats: async () => {
    const response = await apiClient('/products/personal-stats', {
      method: 'GET',
    });
    return response.json();
  },

  getMyProducts: async () => {
    const response = await apiClient('/products/me', {
      method: 'GET',
    });
    return response.json();
  },

  deleteProduct: async (id: string) => {
    const response = await apiClient(`/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'DITUTUP' }),
    });
    return response.json();
  },
};
