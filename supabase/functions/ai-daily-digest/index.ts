// =============================================================================
// ai-daily-digest — "Hoy en el negocio"
// =============================================================================
//
// La dispara pg_cron a las 7:30 a. m. de RD (`request_daily_digest()`, migración 0056, con `x-ai-secret`); un admin también, con su sesión (regenera el de hoy).
//
// LOS NÚMEROS SON DE LA BASE (`business_metrics_compute()`), nunca de la IA. La IA solo REDACTA 5 a 8 líneas y ordena "lo primero que haría hoy" (máximo 3, cada una con
// un enlace a una ruta de /admin de una lista fija). Dos guardas: (1) si la redacción trae un número que no está en las métricas, se descarta y sale la plantilla;
// (2) si la IA falla, el tope está alcanzado o el interruptor está apagado, sale la plantilla sin IA con los mismos números. Los lunes se agrega la comparación contra la
// semana anterior (también calculada aquí, no por la IA). Cuando la llama la base, avisa a los admins por push.
//
// Secretos: ANTHROPIC_API_KEY, AI_CRON_SECRET, PUSH_WEBHOOK_SECRET.

import { callAI } from '../_shared/ai.ts';
import { readEnv, rpc, type Env } from '../_shared/db.ts';
import { corsHeaders, refuse, reply, triggerOrAdmin, unavailableReply } from '../_shared/guard.ts';
import type { Schema } from '../_shared/schema.ts';

/** Las únicas rutas a las que el resumen puede enlazar. */
const ROUTES: Record<string, string> = {
  '/admin/pedidos': 'Pedidos',
  '/admin/taller/citas': 'Citas',
  '/admin/taller/solicitudes': 'Solicitudes de cotización',
  '/admin/moderacion': 'Moderación',
  '/admin/inventario': 'Inventario',
  '/admin/ajustes': 'Ajustes',
};

type Metrics = Record<string, unknown> & {
  date: string;
  week: Record<string, number>;
  ai_spend: { spent_usd: number; cap_usd: number; pct: number };
  out_of_stock_searched: { name: string; searches: number }[];
  search_gaps: { query: string; searches: number }[];
};

const SCHEMA: Schema = {
  t: 'object',
  props: {
    lines: { t: 'array', of: { t: 'string', max: 220 }, max: 8 },
    priorities: { t: 'array', of: { t: 'object', props: { text: { t: 'string', max: 160 }, route: { t: 'string', max: 60 } } }, max: 3 },
  },
};

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));
const rd = (v: number) => `RD$ ${Math.round(v).toLocaleString('en-US')}`;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Hoy en RD (YYYY-MM-DD) y si es lunes. */
export function todayInRd(now = new Date()): { date: string; isMonday: boolean } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, isMonday: get('weekday') === 'Mon' };
}

/** La plantilla sin IA: los mismos números, en el mismo orden de importancia. */
export function templateBody(m: Metrics, monday: boolean): string {
  const lines: string[] = [];
  const proofs = n(m['awaiting_payment_with_proof']);
  if (proofs > 0) lines.push(`- ${plural(proofs, 'pedido espera', 'pedidos esperan')} confirmación de pago con comprobante listo para revisar.`);
  const noProof = n(m['awaiting_payment_no_proof_24h']);
  if (noProof > 0) lines.push(`- ${plural(noProof, 'pedido lleva', 'pedidos llevan')} más de 24 horas sin comprobante.`);
  lines.push(`- Pedidos nuevos en 24 horas: ${n(m['orders_new_24h'])}. Vendido hoy (solo pagado): ${rd(n(m['sold_today_rd']))}.`);
  const quotes = n(m['quotes_unanswered_24h']);
  if (quotes > 0) lines.push(`- ${plural(quotes, 'solicitud de cotización lleva', 'solicitudes de cotización llevan')} más de 24 horas sin responder.`);
  lines.push(`- Citas: ${n(m['appointments_today'])} hoy y ${n(m['appointments_tomorrow'])} mañana${n(m['appointments_unconfirmed']) > 0 ? `; ${n(m['appointments_unconfirmed'])} sin confirmar` : ''}.`);
  const low = n(m['low_stock']);
  const out = n(m['out_of_stock']);
  if (low > 0 || out > 0) lines.push(`- Inventario: ${low} con stock bajo (${n(m['low_stock_threshold'])} o menos) y ${out} agotados.`);
  for (const item of m.out_of_stock_searched.slice(0, 3)) lines.push(`- Agotado y buscado: ${item.name} (${item.searches} búsquedas esta semana).`);
  const mod = n(m['moderation_pending']);
  if (mod > 0) lines.push(`- ${plural(mod, 'publicación espera', 'publicaciones esperan')} moderación.`);
  const hidden = n(m['hidden_by_ai']);
  if (hidden > 0) lines.push(`- La IA tiene ${hidden} contenido(s) oculto(s) por riesgo alto: conviene confirmar que no fue un error.`);
  const exp = n(m['publications_expiring_7d']);
  if (exp > 0) lines.push(`- ${plural(exp, 'publicación vence', 'publicaciones vencen')} en los próximos 7 días.`);
  if (n(m['reviews_new_24h']) > 0) lines.push(`- Reseñas nuevas: ${n(m['reviews_new_24h'])}.`);
  if (m.search_gaps.length > 0) lines.push(`- Búsquedas sin resultado (demanda perdida): ${m.search_gaps.slice(0, 5).map((g) => `«${g.query}» (${g.searches})`).join(', ')}.`);
  lines.push(`- Gasto de IA del mes: ${m.ai_spend.pct}% del tope.`);

  if (monday) {
    const w = m.week;
    lines.push('', '**Comparación con la semana anterior**');
    lines.push(`- Pedidos: ${n(w['orders_7d'])} (antes ${n(w['orders_prev_7d'])}). Vendido: ${rd(n(w['sold_7d']))} (antes ${rd(n(w['sold_prev_7d']))}).`);
    lines.push(`- Citas pedidas: ${n(w['appointments_7d'])} (antes ${n(w['appointments_prev_7d'])}). Solicitudes de cotización: ${n(w['quotes_7d'])} (antes ${n(w['quotes_prev_7d'])}).`);
  }
  return lines.join('\n');
}

/** Todos los números que aparecen en las métricas, como cadenas de dígitos (para comprobar que la IA no inventó ninguno). */
export function allowedNumbers(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === 'number' && Number.isFinite(value)) {
    into.add(String(Math.round(Math.abs(value))));
    into.add(String(Math.abs(value)).replace(/\D/g, ''));
  } else if (typeof value === 'string') {
    for (const m of value.match(/\d+/g) ?? []) into.add(m);
  } else if (Array.isArray(value)) {
    for (const v of value) allowedNumbers(v, into);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) allowedNumbers(v, into);
  }
  return into;
}

/** ¿Todos los números del texto salen de las métricas? Del 1 al 3 se permiten (enumeraciones). */
export function numbersCheckOut(text: string, metrics: unknown): boolean {
  const allowed = allowedNumbers(metrics);
  for (const token of text.match(/\d[\d.,]*/g) ?? []) {
    const digits = token.replace(/\D/g, '');
    if (digits === '' || ['1', '2', '3'].includes(digits) || allowed.has(digits) || allowed.has(String(Number(digits)))) continue;
    return false;
  }
  return true;
}

const SYSTEM = [
  'Redactas el resumen de la mañana para el dueño de X AutoHub, una tienda de accesorios y piezas para vehículos con taller propio en República Dominicana. Tono cercano y directo, español dominicano.',
  'Recibes las MÉTRICAS ya calculadas (son la verdad). Devuelve JSON: lines (de 5 a 8 líneas cortas con lo más importante, solo con números que estén en las métricas)',
  'y priorities (máximo 3 cosas "para hacer primero hoy", cada una con text y route, y route EXACTA de esta lista: ' + Object.keys(ROUTES).join(', ') + ').',
  'NUNCA inventes ni calcules números nuevos: usa los que te dan. No des consejos de precios. Ordena por urgencia: dinero esperando confirmación, clientes sin respuesta, inventario, moderación.',
].join('\n');

async function notifyAdmins(env: Env): Promise<void> {
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret) return;
  try {
    await fetch(`${env.SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, 'x-push-secret': secret },
      body: JSON.stringify({ kind: 'digest' }),
    });
  } catch (e) {
    console.error('[ai-daily-digest] aviso', (e as Error).message);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return refuse(req, 405, 'method-not-allowed');
  const env = readEnv();
  if (!env) return unavailableReply(req);

  const caller = await triggerOrAdmin(env, req);
  if (!caller) return refuse(req, 403, 'forbidden');

  const metrics = await rpc<Metrics>(env, 'business_metrics_compute');
  if (!metrics) return unavailableReply(req);

  const { date, isMonday } = todayInRd();
  const template = templateBody(metrics, isMonday);
  let body = template;
  let ai = false;

  const out = await callAI<{ lines: string[]; priorities: { text: string; route: string }[] }>(env, {
    feature: 'digest',
    tier: 'fast',
    system: SYSTEM,
    user: `MÉTRICAS (JSON):\n${JSON.stringify(metrics)}\n\nHoy es ${isMonday ? 'lunes' : 'un día normal'}.`,
    schema: SCHEMA,
    maxTokens: 700,
    userId: caller.userId,
  });

  if (out.ok && out.data.lines.length >= 3) {
    const priorities = out.data.priorities.filter((p) => p.route in ROUTES);
    const text = [...out.data.lines, ...priorities.map((p) => p.text)].join('\n');
    // Un número que no está en las métricas = la IA lo inventó: se tira la redacción y sale la plantilla.
    if (numbersCheckOut(text, metrics)) {
      const parts = [out.data.lines.map((l) => `- ${l.replace(/^[-•]\s*/, '')}`).join('\n')];
      if (priorities.length > 0) {
        parts.push('', '**Lo primero que haría hoy**', priorities.map((p, i) => `${i + 1}. [${p.text}](${p.route})`).join('\n'));
      }
      if (isMonday) parts.push('', template.slice(template.indexOf('**Comparación con la semana anterior**')));
      body = parts.join('\n');
      ai = true;
    }
  }

  await rpc(env, 'ai_save_digest', { p_date: date, p_kind: isMonday ? 'lunes' : 'diario', p_body: body, p_metrics: metrics, p_ai: ai });
  // El aviso solo cuando lo pide el reloj de la base: regenerarlo desde el panel no vuelve a sonar.
  if (caller.via === 'database') await notifyAdmins(env);
  return reply(req, 200, { ok: true, data: { date, ai_generated: ai, kind: isMonday ? 'lunes' : 'diario' } });
});
