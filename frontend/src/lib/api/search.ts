import { apiClient } from './client';

export const searchApi = {
  semanticSearch: async (query: string) => {
    const response = await apiClient(`/search?q=${encodeURIComponent(query)}`, {
      method: 'GET',
    });
    return response.json();
  },

  semanticSearchDemands: async (query: string) => {
    const response = await apiClient(`/search/demands?q=${encodeURIComponent(query)}`, {
      method: 'GET',
    });
    return response.json();
  },
};
