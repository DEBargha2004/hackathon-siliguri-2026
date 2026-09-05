import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LOCAL_STORAGE_URL_KEY = "dhr_supabase_url";
const LOCAL_STORAGE_KEY_KEY = "dhr_supabase_anon_key";

const DEFAULT_SUPABASE_URL = "https://vixlxbkvelkdgmebajqc.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_D1u71FpOd15Jf_5b3JI4oA_tqSoOarv";

export function getSupabaseCredentials(): { url: string; anonKey: string } {
  const envUrl =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
    (typeof process !== "undefined" && process.env?.VITE_SUPABASE_URL) ||
    DEFAULT_SUPABASE_URL;

  const envKey =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    (typeof process !== "undefined" && process.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    DEFAULT_SUPABASE_KEY;

  let storedUrl = "";
  let storedKey = "";
  if (typeof window !== "undefined" && window.localStorage) {
    storedUrl = window.localStorage.getItem(LOCAL_STORAGE_URL_KEY) || "";
    storedKey = window.localStorage.getItem(LOCAL_STORAGE_KEY_KEY) || "";
  }

  return {
    url: (storedUrl || envUrl || DEFAULT_SUPABASE_URL).trim(),
    anonKey: (storedKey || envKey || DEFAULT_SUPABASE_KEY).trim(),
  };
}

export function setSupabaseCustomCredentials(
  url: string,
  anonKey: string,
): void {
  if (typeof window !== "undefined" && window.localStorage) {
    if (url && anonKey) {
      window.localStorage.setItem(LOCAL_STORAGE_URL_KEY, url.trim());
      window.localStorage.setItem(LOCAL_STORAGE_KEY_KEY, anonKey.trim());
    } else {
      window.localStorage.removeItem(LOCAL_STORAGE_URL_KEY);
      window.localStorage.removeItem(LOCAL_STORAGE_KEY_KEY);
    }
  }
  // Reset cached client
  cachedClient = null;
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseCredentials();
  return Boolean(
    url &&
    anonKey &&
    url.startsWith("http") &&
    !url.includes("your-project-ref") &&
    anonKey.length > 20,
  );
}

let cachedClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (cachedClient) {
    return cachedClient;
  }

  const { url, anonKey } = getSupabaseCredentials();
  try {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    return cachedClient;
  } catch (err) {
    console.error("[Supabase] Failed to initialize Supabase client:", err);
    return null;
  }
}
