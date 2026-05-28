import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey && url.startsWith('http'));

// In the native WebView, localStorage can be evicted by the OS, which would
// silently drop the auth session. Back the Supabase session with Capacitor
// Preferences (native key/value store) instead. On web we leave storage
// undefined so supabase-js uses its default localStorage.
const nativeStorage = {
  getItem: (key) => Preferences.get({ key }).then(({ value }) => value),
  setItem: (key, value) => Preferences.set({ key, value }),
  removeItem: (key) => Preferences.remove({ key }),
};

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        ...(Capacitor.isNativePlatform() ? { storage: nativeStorage } : {}),
      },
    })
  : null;
