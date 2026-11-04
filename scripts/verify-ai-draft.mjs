// Prueba el handler de supabase/functions/ai-draft-reply/index.ts sin Deno, sin Supabase y sin Anthropic:
//
//   node scripts/verify-ai-draft.mjs
//
// Recorre lo que importa: que solo un admin la llame; que a la IA NUNCA le lleguen el teléfono, el correo ni la dirección del cliente (solo el primer nombre y los datos del
// caso); que el escenario salga del estado en la base; que un borrador con enlaces o números inventados se descarte (la pantalla usa la plantilla sin IA); y que la función
// no escriba nada: solo devuelve un texto (no hay bot: el dueño toca "enviar" en WhatsApp).

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

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-draft-')), 'handler.mjs');
await build({ entryPoints: ['supabase/functions/ai-draft-reply/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });

const ID = '11111111-1111-4111-8111-111111111111';
let secrets, db, ai, calls;
globalThis.Deno = { env: { get: (k) => secrets[k] }, serve: (h) => { globalThis.__handler = h; } };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, init });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.startsWith('https://api.anthropic.com/')) {
    calls[calls.length - 1].parsed = JSON.parse(init.body);
    const r = ai();
    return typeof r === 'number' ? new Response('', { status: r }) : json({ content: [{ type: 'text', text: JSON.stringify(r) }], usage: { input_tokens: 400, output_tokens: 90 } });
  }
  if (url.endsWith('/rest/v1/rpc/is_admin')) return json(init.headers.Authorization === 'Bearer token-admin');
  if (url.endsWith('/auth/v1/user')) return json({ id: 'admin-1' });
  if (url.includes('/rest/v1/site_settings')) { const key = decodeURIComponent(url.split('key=eq.')[1]?.split('&')[0] ?? ''); return json(key in db.settings ? [{ value: db.settings[key] }] : []); }
  if (url.endsWith('/rest/v1/rpc/ai_budget_status')) return json([{ tier: 'ok', pct: 1, public_ok: true }]);
  if (url.endsWith('/rest/v1/ai_usage')) return new Response('', { status: 201 });
  if (url.includes('/rest/v1/orders?')) { calls[calls.length - 1].select = url; return json(db.order ? [db.order] : []); }
  if (url.includes('/rest/v1/order_proof_checks?')) return json(db.check ? [db.check] : []);
  if (url.includes('/rest/v1/service_appointments?')) { calls[calls.length - 1].select = url; return json(db.appointment ? [db.appointment] : []); }
  if (url.includes('/rest/v1/services?')) return json([{ title: 'Alineación' }]);
  if (url.includes('/rest/v1/service_quote_requests?')) { calls[calls.length - 1].select = url; return json(db.quote ? [db.quote] : []); }
  return json([], 404);
};
await import(pathToFileURL(out).href);
const handler = globalThis.__handler;
const lib = await import(pathToFileURL(out).href);

const reset = () => {
  secrets = { ANTHROPIC_API_KEY: 'sk-ant-falsa', SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  db = {
    settings: {}, check: null,
    order: { order_number: 1042, status: 'paid', fulfillment_type: 'pickup', total: 4500.5, full_name: 'MARIA del Carmen Perez' },
    appointment: { appointment_number: 2001, status: 'confirmed', scheduled_at: '2026-11-05T14:30:00Z', contact_name: 'juan perez', service_id: 4 },
    quote: { code: 'XAH-C-0007', status: 'nueva', contact_name: 'Ana Lopez', ai_triage: { missing_info: ['¿Desde cuándo pasa?', '¿Hace ruido al girar?'] } },
  };
  ai = () => ({ message: 'Hola Maria, ya recibimos tu pago del pedido 1042. Estamos preparándolo y te avisamos. Gracias. — X AutoHub' });
  calls = [];
};
const call = (body, headers = { Authorization: 'Bearer token-admin' }) =>
  handler(new Request('https://p.supabase.co/functions/v1/ai-draft-reply', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://xautohubrd.com', ...headers }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, reply: await r.json() }));
const anthropic = () => calls.filter((c) => c.url.startsWith('https://api.anthropic.com/'));
const userText = () => anthropic()[0].parsed.messages[0].content.at(-1).text;

console.log('\nAcceso');
reset();
check('sin sesión: 403', (await call({ kind: 'order', id: ID }, {})).status === 403);
check('un usuario que no es admin: 403', (await call({ kind: 'order', id: ID }, { Authorization: 'Bearer token-comun' })).status === 403);
check('un tipo desconocido: 400', (await call({ kind: 'carta', id: ID })).status === 400);
check('un id inválido: 400', (await call({ kind: 'order', id: 'x' })).status === 400);
check('y no se llamó a Anthropic', anthropic().length === 0);
reset(); db.order = null;
check('un pedido que no existe: 404', (await call({ kind: 'order', id: ID })).status === 404);

console.log('\nLo que le llega a la IA');
reset();
let r = await call({ kind: 'order', id: ID });
check('devuelve el borrador', r.reply.ok && /pedido 1042/.test(r.reply.data.message));
check('solo se piden las columnas necesarias: nada de teléfono, correo ni dirección', calls.find((c) => c.select)?.select && !/contact_phone|contact_email|address/.test(calls.find((c) => c.select).select));
check('el cliente llega solo por su primer nombre (Maria, no el nombre completo)', userText().includes('Maria') && !/del Carmen|Perez/i.test(userText()));
check('el nombre va como dato, dentro de <datos>', userText().includes('<datos>'));
check('el sistema prohíbe inventar precios, fechas y enlaces', /NO inventes precios/.test(anthropic()[0].parsed.system) && /NO pongas enlaces/.test(anthropic()[0].parsed.system));
check('usa el modelo rápido', anthropic()[0].parsed.model === 'claude-haiku-4-5-20251001');
check('no hay herramientas ni escrituras: ningún POST a tablas ni PATCH', calls.every((c) => !['PATCH', 'DELETE', 'PUT'].includes(c.init.method ?? 'GET')));
reset();
await call({ kind: 'order', id: ID, variant: 3 });
check('"Otra versión" le pide palabras distintas (versión 3 de 3)', /Versión 3 de 3/.test(userText()));

console.log('\nEl escenario sale del estado en la base');
for (const [status, word] of [['paid', 'pago_recibido'], ['shipped', 'enviado'], ['ready_for_pickup', 'listo_para_retiro'], ['preparing', 'preparando']]) {
  reset(); db.order.status = status;
  await call({ kind: 'order', id: ID });
  check(`estado ${status} → ${word}`, userText().includes(word));
}
reset(); db.order.status = 'awaiting_payment'; db.check = { verdict: 'ilegible' };
await call({ kind: 'order', id: ID });
check('esperando pago con un comprobante ilegible → pedirle que lo reenvíe', userText().includes('comprobante_ilegible'));
reset(); db.order.status = 'awaiting_payment';
await call({ kind: 'order', id: ID });
check('esperando pago sin comprobante leído → seguimos esperando', userText().includes('esperando_pago'));

console.log('\nCitas y solicitudes');
reset();
ai = () => ({ message: 'Hola Juan, tu cita 2001 está confirmada para el jueves. Te esperamos. — X AutoHub' });
r = await call({ kind: 'appointment', id: ID });
check('una cita confirmada: lleva el número, el servicio y la hora (en hora de RD) como datos del caso', r.reply.ok && /confirmada/.test(userText()) && /Alineación/.test(userText()) && /Cita número 2001/.test(userText()));
check('de la cita no se piden el teléfono ni notas', !/contact_phone|notes/.test(calls.find((c) => c.select)?.select ?? ''));
reset();
ai = () => ({ message: 'Hola Ana, recibimos tu solicitud XAH-C-0007. ¿Nos cuentas?\n• ¿Desde cuándo pasa?\n• ¿Hace ruido al girar?\nX AutoHub' });
r = await call({ kind: 'quote', id: ID });
check('una solicitud con preguntas pendientes: las incluye', r.reply.ok && /cotizacion_faltan_datos/.test(userText()) && /Desde cuándo pasa/.test(userText()));
check('sin el teléfono del cliente', !/contact_phone/.test(calls.find((c) => c.select)?.select ?? ''));
reset(); db.quote.ai_triage = null;
await call({ kind: 'quote', id: ID });
check('sin preguntas pendientes: "en revisión"', /cotizacion_en_revision/.test(userText()));

console.log('\nBorradores descartados (la pantalla usa la plantilla sin IA)');
reset(); ai = () => ({ message: 'Hola Maria, tu pedido 1042 sale mañana y llega en 2 días. Mira https://xautohubrd.com/seguir' });
r = await call({ kind: 'order', id: ID });
check('un borrador con un enlace se descarta', r.reply.code === 'ia_no_disponible');
reset(); ai = () => ({ message: 'Hola Maria, tu pedido 1042 cuesta RD$ 9999 en total. Gracias, X AutoHub.' });
r = await call({ kind: 'order', id: ID });
check('un monto que no está en los datos (9999) se descarta', r.reply.code === 'ia_no_disponible');
reset(); ai = () => ({ message: 'Hola Maria, tu pedido 1042 por RD$ 4501 está en camino. Gracias, X AutoHub.' });
r = await call({ kind: 'order', id: ID });
check('el total redondeado de los datos (4501) sí pasa', r.reply.ok);
reset(); ai = () => ({ message: 'Hola' });
r = await call({ kind: 'order', id: ID });
check('un borrador vacío o demasiado corto se descarta', r.reply.code === 'ia_no_disponible');
check('numbersInContext y hasLink', lib.numbersInContext('pedido 1042 y 2 cosas', 'Pedido número 1042') && !lib.numbersInContext('pedido 77', 'Pedido número 1042') && lib.hasLink('mira www.algo.com') && !lib.hasLink('sin enlaces'));

console.log('\nFallos');
reset(); ai = () => 500;
r = await call({ kind: 'order', id: ID });
check('con la IA caída: ia_no_disponible', r.reply.code === 'ia_no_disponible');
reset(); db.settings.ai_feature_reply_draft = false;
r = await call({ kind: 'order', id: ID });
check('con el interruptor apagado: sin llamadas', r.reply.code === 'ia_no_disponible' && anthropic().length === 0);

console.log(failed === 0 ? '\nTodo en orden.' : `\n${failed} comprobaciones fallaron.`);
process.exit(failed === 0 ? 0 : 1);
