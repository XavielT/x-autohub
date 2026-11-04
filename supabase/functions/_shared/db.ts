// Acceso a la base desde una edge con la service_role (PostgREST). Solo para las funciones de IA.

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export function readEnv(): Env | null {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY };
}

/** Una llamada a PostgREST. Devuelve el JSON, o `null` si falló (nunca lanza: una IA caída no debe tumbar un flujo). */
export async function rest<T>(env: Env, path: string, init: RequestInit = {}): Promise<T | null> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      console.error('[ai] PostgREST', res.status, path.split('?')[0]);
      return null;
    }
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : (null as T);
  } catch (e) {
    console.error('[ai] PostgREST falló', path.split('?')[0], (e as Error).message);
    return null;
  }
}

export const rpc = <T>(env: Env, name: string, args: Record<string, unknown> = {}) =>
  rest<T>(env, `rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });

/** Un ajuste de `site_settings` (jsonb). */
export async function getSetting<T>(env: Env, key: string, fallback: T): Promise<T> {
  const rows = await rest<{ value: T }[]>(env, `site_settings?select=value&key=eq.${encodeURIComponent(key)}&limit=1`);
  return rows && rows.length > 0 ? rows[0].value : fallback;
}
