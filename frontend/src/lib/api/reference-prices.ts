import { apiClient } from './client';

export const referencePricesApi = {
  getReferencePrices: async (page = 1, limit = 20, commodity?: string, search?: string, region?: string) => {
    let url = `/reference-prices?page=${page}&limit=${limit}`;
    if (commodity && commodity !== 'ALL') {
      url += `&commodity=${encodeURIComponent(commodity)}`;
    }
    if (region) {
      url += `&region=${encodeURIComponent(region)}`;
    }
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }
    const response = await apiClient(url, {
      method: 'GET',
    });
    return response.json();
  },
  getPriceHistory: async (commodity?: string, region?: string, days = 30) => {
    let url = `/reference-prices/history?days=${days}`;
    if (commodity && commodity !== 'ALL') {
      url += `&commodity=${encodeURIComponent(commodity)}`;
    }
    if (region) {
      url += `&region=${encodeURIComponent(region)}`;
    }
    const response = await apiClient(url, {
      method: 'GET',
    });
    return response.json();
  },
  getPriceDivergence: async (commodity: string, region = 'Nasional', days = 90) => {
    const url = `/reference-prices/divergence?commodity=${encodeURIComponent(commodity)}&region=${encodeURIComponent(region)}&days=${days}`;
    const response = await apiClient(url, {
      method: 'GET',
    });
    return response.json();
  },
};
