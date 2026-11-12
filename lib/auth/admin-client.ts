'use client';

import { getSupabase } from '@/lib/supabaseClient';

export async function getAdminAuthHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra };
  try {
    const supabase = getSupabase();
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch {
    // Best-effort token extraction; server routes still verify session cookies if present
  }
  return headers;
}

export async function adminFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const baseHeaders: Record<string, string> = {};
  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        baseHeaders[k] = v;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) {
        baseHeaders[k] = v;
      }
    } else {
      Object.assign(baseHeaders, init.headers);
    }
  }

  const headers = await getAdminAuthHeaders(baseHeaders);
  return fetch(input, {
    ...init,
    credentials: 'include',
    headers,
  });
}

