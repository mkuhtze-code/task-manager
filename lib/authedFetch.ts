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
    body: JSON.stringify(body),
  });
  return res.json();
}
