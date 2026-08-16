import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let customToken: string | null = null;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  accessToken: async () => {
    return customToken || supabaseAnonKey;
  }
});

export const setSupabaseCustomToken = (token: string) => {
  customToken = token;
  // Authorize realtime WebSocket client with the custom token
  supabase.realtime.setAuth(token);
};
