import { apiClient, BASE_URL } from './client';

export const authApi = {
  loginWithGoogle: async (idToken: string) => {
    const response = await apiClient('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken }),
    });
    return response.json();
  },

  completeProfile: async (phone: string | null, lat?: number | null, lng?: number | null) => {
    const response = await apiClient('/auth/complete-profile', {
      method: 'POST',
      body: JSON.stringify({
        phone_whatsapp: phone,
        lat: lat ?? null,
        lng: lng ?? null
      }),
    });
    return response.json();
  },

  updateProfile: async (data: { 
    role?: string | null;
    phone_whatsapp?: string | null; 
    phone_number?: string | null; 
    bio?: string | null; 
    theme_color?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    bank_name?: string | null;
    bank_account_number?: string | null;
    bank_account_holder?: string | null;
  }) => {
    const response = await apiClient('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return response.json();
  },


  upgradeToFarmer: async (data: {
    bio: string;
    bank_name: string;
    bank_account_number: string;
    bank_account_holder: string;
  }) => {
    const response = await apiClient('/users/upgrade-to-farmer', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.json();
  },

  updateLocation: async (lat: number, lng: number) => {
    const response = await apiClient('/users/me/location', {
      method: 'PATCH',
      body: JSON.stringify({ lat, lng }),
    });
    return response.json();
  },

  refresh: async () => {
    const response = await apiClient('/auth/refresh', {
      method: 'POST',
    });
    return response.json();
  },

  getMe: async () => {
    const response = await apiClient('/auth/me', {
      method: 'GET',
    });
    return response.json();
  },

  getUserById: async (id: string) => {
    const response = await apiClient(`/users/${id}`, {
      method: 'GET',
    });
    return response.json();
  },

  getFarmers: async (query?: string) => {
    const url = query 
      ? `/users?role=PETANI&q=${encodeURIComponent(query)}` 
      : '/users?role=PETANI';
    const response = await apiClient(url, {
      method: 'GET',
    });
    return response.json();
  },

  uploadAvatar: async (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);

    const response = await fetch(`${BASE_URL}/users/me/avatar`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Gagal mengunggah foto profil: ${response.status}`);
    }

    return response.json();
  },

  getSupabaseToken: async () => {
    const response = await apiClient('/auth/supabase-token', {
      method: 'GET',
    });
    return response.json();
  },

  logout: async () => {
    const response = await apiClient('/auth/logout', {
      method: 'POST',
    });
    return response.json();
  },
};

