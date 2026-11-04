// Prueba el handler de supabase/functions/ai-daily-digest/index.ts sin Deno, sin Supabase y sin Anthropic:
//
//   node scripts/verify-ai-digest.mjs
//
// Recorre lo que importa: que solo la base (con el secreto) o un admin la llamen; que los números salgan de las métricas de la base y la IA solo redacte (si
// inventa un número, se tira su texto y sale la plantilla); que sin IA (caída, tope, interruptor) salga la plantilla con los mismos números; que los enlaces solo
// vayan a rutas de /admin de una lista fija; que los lunes traiga la comparación; y que el aviso a admins salga solo cuando lo pide el reloj de la base.

import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`   ${ok ? 'OK   ' : 'FALLA'} ${name}${ok ? '' : ` ${extra}`}`);
  if (!ok) failed++;
};

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-digest-')), 'handler.mjs');
await build({ entryPoints: ['supabase/functions/ai-daily-digest/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });

const METRICS = {
  date: '2026-11-04', orders_new_24h: 7, awaiting_payment_with_proof: 2, awaiting_payment_no_proof_24h: 1, sold_today_rd: 18450, low_stock_threshold: 3, low_stock: 4, out_of_stock: 2,
  out_of_stock_searched: [{ name: 'Faro LED H4', searches: 9 }], appointments_today: 3, appointments_tomorrow: 5, appointments_unconfirmed: 2, quotes_unanswered_24h: 1, quotes_new: 3,
  moderation_pending: 4, hidden_by_ai: 1, publications_expiring_7d: 2, reviews_new_24h: 2, search_gaps: [{ query: 'bumper hilux', searches: 6 }], ai_spend: { spent_usd: 2.5, cap_usd: 25, pct: 10 },
  week: { orders_7d: 31, orders_prev_7d: 24, sold_7d: 120000, sold_prev_7d: 95000, appointments_7d: 12, appointments_prev_7d: 10, quotes_7d: 8, quotes_prev_7d: 5 },
};

let secrets, db, ai, calls;
globalThis.Deno = { env: { get: (k) => secrets[k] }, serve: (h) => { globalThis.__handler = h; } };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, init });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.startsWith('https://api.anthropic.com/')) {
    calls[calls.length - 1].parsed = JSON.parse(init.body);
    const r = ai();
    return typeof r === 'number' ? new Response('', { status: r }) : json({ content: [{ type: 'text', text: JSON.stringify(r) }], usage: { input_tokens: 1200, output_tokens: 200 } });
  }
  if (url.endsWith('/rest/v1/rpc/is_admin')) return json(init.headers.Authorization === 'Bearer token-admin');
  if (url.endsWith('/auth/v1/user')) return json({ id: 'admin-1' });
  if (url.includes('/rest/v1/site_settings')) { const key = decodeURIComponent(url.split('key=eq.')[1]?.split('&')[0] ?? ''); return json(key in db.settings ? [{ value: db.settings[key] }] : []); }
  if (url.endsWith('/rest/v1/rpc/ai_budget_status')) return json([{ tier: 'ok', pct: 1, public_ok: true }]);
  if (url.endsWith('/rest/v1/ai_usage')) return new Response('', { status: 201 });
  if (url.endsWith('/rest/v1/rpc/business_metrics_compute')) return db.metrics ? json(db.metrics) : json([], 500);
  if (url.endsWith('/rest/v1/rpc/ai_save_digest')) { db.saved.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
  if (url.endsWith('/functions/v1/send-push')) { db.pushes.push({ body: JSON.parse(init.body), headers: init.headers }); return json({ sent: 1 }); }
  return json([], 404);
};

const lib = await import(pathToFileURL(out).href);
const handler = globalThis.__handler;

const GOOD = () => ({
  lines: ['Hay 2 pedidos con comprobante listos para confirmar.', 'Vendiste RD$ 18,450 hoy.', 'Tienes 3 citas hoy y 5 mañana.', 'Hay 1 solicitud de cotización sin responder.', 'El Faro LED H4 está agotado y lo buscaron 9 veces.'],
  priorities: [{ text: 'Confirma los pagos con comprobante', route: '/admin/pedidos' }, { text: 'Responde la solicitud pendiente', route: '/admin/taller/solicitudes' }],
});
const reset = () => {
  secrets = { ANTHROPIC_API_KEY: 'sk-ant-falsa', AI_CRON_SECRET: 'cron-secreto', PUSH_WEBHOOK_SECRET: 'push-secreto', SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  db = { settings: {}, saved: [], pushes: [], metrics: structuredClone(METRICS) };
  ai = GOOD;
  calls = [];
};
const call = (headers = { 'x-ai-secret': 'cron-secreto' }) =>
  handler(new Request('https://p.supabase.co/functions/v1/ai-daily-digest', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://xautohubrd.com', ...headers }, body: '{}' })).then(async (r) => ({ status: r.status, reply: await r.json() }));
const anthropic = () => calls.filter((c) => c.url.startsWith('https://api.anthropic.com/'));

console.log('\nAcceso');
reset();
check('sin secreto ni sesión: 403', (await call({})).status === 403);
check('un usuario que no es admin: 403', (await call({ Authorization: 'Bearer token-comun' })).status === 403);
check('un admin con su sesión sí', (await call({ Authorization: 'Bearer token-admin' })).status === 200);

console.log('\nCon IA');
reset();
let r = await call();
let saved = db.saved[0];
check('guarda el resumen redactado por la IA', r.reply.data.ai_generated === true && saved.p_ai === true);
check('lleva las líneas de la IA y "Lo primero que haría hoy" con enlaces a rutas de /admin', saved.p_body.includes('2 pedidos con comprobante') && saved.p_body.includes('**Lo primero que haría hoy**') && saved.p_body.includes('(/admin/pedidos)'));
check('las métricas guardadas son las de la base (no las de la IA)', JSON.stringify(saved.p_metrics) === JSON.stringify(METRICS));
check('a la IA se le dan las métricas como la verdad, y el sistema le prohíbe inventar números', anthropic()[0].parsed.messages[0].content.at(-1).text.includes('"sold_today_rd":18450') && /NUNCA inventes ni calcules números nuevos/.test(anthropic()[0].parsed.system));
check('usa el modelo rápido', anthropic()[0].parsed.model === 'claude-haiku-4-5-20251001');
check('lo pide el reloj de la base: avisa a admins con el secreto de push', db.pushes.length === 1 && db.pushes[0].body.kind === 'digest' && db.pushes[0].headers['x-push-secret'] === 'push-secreto');
reset();
await call({ Authorization: 'Bearer token-admin' });
check('regenerarlo desde el panel NO vuelve a sonar', db.pushes.length === 0);

console.log('\nLa IA no inventa números ni rutas');
reset();
ai = () => ({ lines: ['Vendiste RD$ 99,999 hoy.', 'Hay 2 pedidos con comprobante.', 'Tienes 3 citas hoy.'], priorities: [] });
r = await call();
check('un número que no está en las métricas: se descarta la redacción y sale la plantilla', r.reply.data.ai_generated === false && db.saved[0].p_ai === false && !db.saved[0].p_body.includes('99,999'));
check('la plantilla trae los números reales', db.saved[0].p_body.includes('RD$ 18,450') && db.saved[0].p_body.includes('3 hoy y 5 mañana'));
reset();
ai = () => ({ lines: ['Hay 2 pedidos esperando.', 'Vendiste RD$ 18,450.', 'Tienes 3 citas hoy.'], priorities: [{ text: 'Mira esto', route: 'https://malo.example' }, { text: 'Y esto', route: '/admin/ajustes' }] });
await call();
check('una ruta fuera de la lista se descarta; las de la lista se enlazan', !db.saved[0].p_body.includes('malo.example') && db.saved[0].p_body.includes('(/admin/ajustes)'));
reset();
ai = () => ({ lines: ['Una', 'Dos'], priorities: [] });
await call();
check('con menos de 3 líneas no se usa: plantilla', db.saved[0].p_ai === false);
check('numbersCheckOut acepta los números de las métricas (con comas) y del 1 al 3', lib.numbersCheckOut('Vendiste RD$ 18,450 y tienes 3 citas, 5 mañana', METRICS) && lib.numbersCheckOut('1. Primero', METRICS));
check('y rechaza uno inventado', !lib.numbersCheckOut('Vendiste 77 mil', METRICS));

console.log('\nSin IA: la plantilla con los mismos números');
reset(); ai = () => 500;
r = await call();
check('con la IA caída sale la plantilla y se guarda', r.reply.ok && r.reply.data.ai_generated === false && db.saved.length === 1);
check('la plantilla dice lo importante primero: pagos con comprobante, y trae el gasto de IA', db.saved[0].p_body.startsWith('- 2 pedidos esperan confirmación de pago') && db.saved[0].p_body.includes('Gasto de IA del mes: 10% del tope'));
check('con la IA caída igual avisa a admins (el resumen existe)', db.pushes.length === 1);
reset(); db.settings.ai_feature_digest = false;
await call();
check('con el interruptor apagado: plantilla y ninguna llamada a la IA', db.saved[0].p_ai === false && anthropic().length === 0);
reset(); db.settings.ai_enabled = false;
await call();
check('con la IA apagada: plantilla', db.saved[0].p_ai === false && anthropic().length === 0);
reset(); db.metrics = null;
r = await call();
check('si la base no da las métricas: ia_no_disponible y no se guarda nada', r.reply.code === 'ia_no_disponible' && db.saved.length === 0);

console.log('\nLa plantilla');
const m0 = { ...METRICS, awaiting_payment_with_proof: 0, awaiting_payment_no_proof_24h: 0, quotes_unanswered_24h: 0, low_stock: 0, out_of_stock: 0, out_of_stock_searched: [], moderation_pending: 0, hidden_by_ai: 0, publications_expiring_7d: 0, reviews_new_24h: 0, search_gaps: [], appointments_unconfirmed: 0 };
const quiet = lib.templateBody(m0, false);
check('un día tranquilo no inventa alertas', !/esperan|llevan|agotados|moderación|vencen|oculto|Reseñas/.test(quiet));
check('siempre dice pedidos nuevos, lo vendido, las citas y el gasto de IA', /Pedidos nuevos en 24 horas: 7/.test(quiet) && /RD\$ 18,450/.test(quiet) && /Citas: 3 hoy y 5 mañana\./.test(quiet) && /Gasto de IA/.test(quiet));
check('un pedido en singular se escribe en singular', lib.templateBody({ ...m0, awaiting_payment_with_proof: 1 }, false).includes('1 pedido espera'));
const monday = lib.templateBody(METRICS, true);
check('el lunes trae la comparación con la semana anterior, con números de la base', monday.includes('**Comparación con la semana anterior**') && monday.includes('Pedidos: 31 (antes 24)') && monday.includes('RD$ 120,000 (antes RD$ 95,000)'));
check('un día normal no la trae', !lib.templateBody(METRICS, false).includes('Comparación'));
check('todayInRd da la fecha de RD y si es lunes', lib.todayInRd(new Date('2026-11-02T14:00:00Z')).isMonday === true && lib.todayInRd(new Date('2026-11-02T14:00:00Z')).date === '2026-11-02' && lib.todayInRd(new Date('2026-11-04T02:00:00Z')).date === '2026-11-03');

console.log(failed === 0 ? '\nTodo en orden.' : `\n${failed} comprobaciones fallaron.`);
process.exit(failed === 0 ? 0 : 1);
