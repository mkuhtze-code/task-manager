import { supabase } from '@/lib/supabaseClient';

// Must match basePath in next.config.mjs. Client-side fetch() does not
// automatically apply Next's basePath, so every /api/... request has to
// be prefixed explicitly — this is the one place that happens.
export const API_BASE_PATH = '/app';

export function apiUrl(path: string): string {
  return path.startsWith('/api/') ? `${API_BASE_PATH}${path}` : path;
}

export async function authedFetch(url: string, body: any) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(apiUrl(url), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
}

/** Authenticated GET — returns parsed JSON and ok/status for error handling. */
export async function authedGet<T = Record<string, unknown>>(
  url: string
): Promise<{ ok: boolean; status: number; data: T }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(apiUrl(url), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  let data = {} as T;
  try {
    data = (await res.json()) as T;
  } catch {
    // non-JSON
  }
  return { ok: res.ok, status: res.status, data };
}
