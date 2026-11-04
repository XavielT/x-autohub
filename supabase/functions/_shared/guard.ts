// =============================================================================
// Guardas de acceso de las Edge Functions de IA
// =============================================================================
//
//   · CORS limitado a xautohubrd.com, *.vercel.app y localhost:4200.
//   · `requireRole`: la sesión del usuario y su rol se comprueban llamando a la base COMO EL USUARIO (con su JWT, con la
//     clave anon), nunca con la service_role: lo que dice `is_admin()` es lo que manda.
//   · `anonGuard`: para endpoints abiertos, `ai_rate_check()` por hash de IP.
//   · `triggerOrAdmin`: la base (pg_net/pg_cron) entra con el secreto compartido `AI_CRON_SECRET` en `x-ai-secret`.
//   · Tamaño máximo de cuerpo.

import { rpc, type Env } from './db.ts';
import { sha256 } from './ai.ts';

const ALLOWED_ORIGIN = /^https:\/\/((www\.)?xautohubrd\.com|[a-z0-9-]+\.vercel\.app)$|^http:\/\/localhost:4200$/i;

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    // Sin origen reconocido no se devuelve ninguno: el navegador bloquea la respuesta.
    ...(ALLOWED_ORIGIN.test(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ai-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

export function reply(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } });
}

/** `{ ok: false, code }` con el estado HTTP que toca. */
export const refuse = (req: Request, status: number, code: string) => reply(req, status, { ok: false, code });

/** `ia_no_disponible` va con 200: no es un error de quien llama, el front sigue por su camino de siempre. */
export const unavailableReply = (req: Request) => reply(req, 200, { ok: false, code: 'ia_no_disponible' });

/** Comparación en tiempo constante. */
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Lee el cuerpo JSON con un tope de bytes. `null` si es demasiado grande o no es JSON. */
export async function readJson(req: Request, maxBytes = 64_000): Promise<Record<string, unknown> | null> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) return null;
  try {
    const text = await req.text();
    if (new TextEncoder().encode(text).length > maxBytes) return null;
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type Role = 'admin' | 'moderator';

/** El usuario que llama, si su JWT es válido y tiene el rol pedido. Se pregunta a la base como él. */
export async function requireRole(env: Env, req: Request, role: Role): Promise<{ userId: string } | null> {
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return null;
  try {
    const asUser = { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization, 'Content-Type': 'application/json' };
    const fn = role === 'admin' ? 'is_admin' : 'is_moderator_or_admin';
    const allowed = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: asUser, body: '{}' });
    if (!allowed.ok || (await allowed.json()) !== true) return null;
    const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: asUser });
    if (!who.ok) return null;
    const user = (await who.json()) as { id?: string };
    return user.id ? { userId: user.id } : null;
  } catch {
    return null;
  }
}

/** Cualquier usuario con sesión (no importa el rol). */
export async function requireUser(env: Env, req: Request): Promise<{ userId: string } | null> {
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return null;
  try {
    const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization },
    });
    if (!who.ok) return null;
    const user = (await who.json()) as { id?: string };
    return user.id ? { userId: user.id } : null;
  } catch {
    return null;
  }
}

/** La base (con el secreto compartido) o un admin con su sesión. Sin `AI_CRON_SECRET` solo queda el admin. */
export async function triggerOrAdmin(
  env: Env,
  req: Request,
): Promise<{ via: 'database' | 'admin'; userId: string | null } | null> {
  const secret = Deno.env.get('AI_CRON_SECRET') ?? '';
  const sent = req.headers.get('x-ai-secret') ?? '';
  if (secret !== '' && sameSecret(sent, secret)) return { via: 'database', userId: null };
  const admin = await requireRole(env, req, 'admin');
  return admin ? { via: 'admin', userId: admin.userId } : null;
}

/** Hash de la IP de quien llama (nunca la IP). */
export async function ipHash(req: Request): Promise<string> {
  const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('cf-connecting-ip') ?? 'desconocida').split(',')[0].trim();
  return (await sha256(`${Deno.env.get('AI_CRON_SECRET') ?? 'xah'}:${ip}`)).slice(0, 32);
}

/** Límite para endpoints abiertos. `ok` si todavía cabe. Si la base no responde, se niega (cerrado por defecto). */
export async function anonGuard(
  env: Env,
  req: Request,
  name: string,
  windowSeconds: number,
  max: number,
): Promise<{ ok: boolean; hash: string }> {
  const hash = await ipHash(req);
  const allowed = await rpc<boolean>(env, 'ai_rate_check', { p_key: `${name}:${hash}`, p_window_seconds: windowSeconds, p_max: max });
  return { ok: allowed === true, hash };
}
