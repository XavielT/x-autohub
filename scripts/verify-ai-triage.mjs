// Prueba el handler de supabase/functions/ai-triage-quote/index.ts sin Deno, sin Supabase y sin Anthropic:
//
//   node scripts/verify-ai-triage.mjs
//
// Recorre lo que importa: que solo la base (con el secreto) o un admin la llamen; que los servicios salgan de la tabla y nunca de lo que invente la
// IA; que NUNCA haya precios en lo que se guarda; que frenos, dirección o fuga de combustible sean urgencia "seguridad" por regla fija aunque la IA
// diga "normal"; que el nombre y el teléfono del cliente no viajen a la IA; que la descripción vaya como dato; que el aviso a admins salga aunque la IA
// falle; y que la purga borre las fotos con la API de Storage y solo quite de la fila las que de verdad se borraron.

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

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-triage-')), 'handler.mjs');
await build({ entryPoints: ['supabase/functions/ai-triage-quote/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });

const ID = '11111111-1111-4111-8111-111111111111';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
let secrets, db, ai, calls;

globalThis.Deno = { env: { get: (k) => secrets[k] }, serve: (h) => { globalThis.__handler = h; } };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, init });
  const method = init.method ?? 'GET';
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.startsWith('https://api.anthropic.com/')) {
    calls[calls.length - 1].parsed = JSON.parse(init.body);
    const r = ai();
    return typeof r === 'number' ? new Response('', { status: r }) : json({ content: [{ type: 'text', text: JSON.stringify(r) }], usage: { input_tokens: 900, output_tokens: 150 } });
  }
  if (url.endsWith('/rest/v1/rpc/is_admin')) return json(init.headers.Authorization === 'Bearer token-admin');
  if (url.endsWith('/auth/v1/user')) return json({ id: 'admin-1' });
  if (url.includes('/rest/v1/site_settings')) { const key = decodeURIComponent(url.split('key=eq.')[1]?.split('&')[0] ?? ''); return json(key in db.settings ? [{ value: db.settings[key] }] : []); }
  if (url.endsWith('/rest/v1/rpc/ai_budget_status')) return json([{ tier: 'ok', pct: 1, public_ok: true }]);
  if (url.endsWith('/rest/v1/ai_usage')) return new Response('', { status: 201 });
  if (url.includes('/rest/v1/service_quote_requests?')) return json(db.request ? [db.request] : []);
  if (url.includes('/rest/v1/services?')) return json(db.services);
  if (url.endsWith('/rest/v1/rpc/ai_save_quote_triage')) { db.saved.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
  if (url.endsWith('/rest/v1/rpc/quote_photos_to_purge')) return json(db.purge);
  if (url.endsWith('/rest/v1/rpc/quote_photos_cleared')) { db.cleared = JSON.parse(init.body).p_ids; return new Response(null, { status: 204 }); }
  if (url.includes('/storage/v1/object/quote-photos') && method === 'DELETE') { db.deleted.push(JSON.parse(init.body).prefixes); return new Response('{}', { status: db.deleteStatus }); }
  if (url.includes('/storage/v1/object/quote-photos/')) { const f = decodeURIComponent(url.split('/quote-photos/')[1]); return f in db.files ? new Response(db.files[f]) : new Response('', { status: 404 }); }
  if (url.endsWith('/functions/v1/send-push')) { db.pushes.push({ body: JSON.parse(init.body), headers: init.headers }); return json({ sent: 1 }); }
  return json([], 404);
};

await import(pathToFileURL(out).href);
const handler = globalThis.__handler;

const reset = () => {
  secrets = { ANTHROPIC_API_KEY: 'sk-ant-falsa', AI_CRON_SECRET: 'cron-secreto', PUSH_WEBHOOK_SECRET: 'push-secreto', SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  db = {
    settings: {}, saved: [], pushes: [], purge: [], cleared: null, deleted: [], deleteStatus: 200,
    request: { id: ID, description: 'Hace un ruido en la suspensión al pasar los policías acostados. Llámame al 809-953-9782', vehicle_text: 'Toyota Corolla 2015', service_id: 2, photos: [`${ID}/0.jpg`] },
    services: [{ id: 1, slug: 'cambio-aceite', title: 'Cambio de aceite', price_from: 1500 }, { id: 2, slug: 'suspension', title: 'Suspensión', price_from: null }, { id: 3, slug: null, title: 'Otro', price_from: null }],
    files: { [`${ID}/0.jpg`]: JPEG },
  };
  ai = () => ({ service_slugs: ['suspension'], urgency: 'pronto', summary: 'Ruido en la suspensión delantera.', missing_info: ['¿Desde cuándo pasa?'], checklist: ['Revisar bujes y gomas'], can_quote_without_inspection: false });
  calls = [];
};
const call = (body, headers = { 'x-ai-secret': 'cron-secreto' }) =>
  handler(new Request('https://p.supabase.co/functions/v1/ai-triage-quote', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://xautohubrd.com', ...headers }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, reply: await r.json() }));
const anthropic = () => calls.filter((c) => c.url.startsWith('https://api.anthropic.com/'));

console.log('\nAcceso');
reset();
check('sin secreto ni sesión: 403', (await call({ action: 'triage', id: ID }, {})).status === 403);
check('un usuario que no es admin: 403', (await call({ action: 'triage', id: ID }, { Authorization: 'Bearer token-comun' })).status === 403);
check('una acción desconocida: 400', (await call({ action: 'borrar' })).status === 400);
check('un id inválido: 400', (await call({ action: 'triage', id: 'x' })).status === 400);
check('una solicitud que no existe: 404', (await (async () => { db.request = null; return call({ action: 'triage', id: ID }); })()).status === 404);
check('un admin con su sesión sí', (await (async () => { reset(); return call({ action: 'triage', id: ID }, { Authorization: 'Bearer token-admin' }); })()).status === 200);

console.log('\nEl triage');
reset();
let r = await call({ action: 'triage', id: ID });
const saved = db.saved[0];
check('responde la urgencia y cuántos servicios', r.reply.ok && r.reply.data.urgency === 'pronto' && r.reply.data.services === 1);
check('guarda el triage con el resumen, lo que falta preguntar y la lista "orientativa"', saved.p_triage.summary.includes('suspensión') && saved.p_triage.missing_info.length === 1 && /Orientativa/.test(saved.p_triage.checklist_note));
check('los servicios salen de la tabla (slug, título y price_from de la base)', JSON.stringify(saved.p_triage.services) === JSON.stringify([{ slug: 'suspension', title: 'Suspensión', price_from: null }]));
check('con fotos usa el modelo smart (visión)', anthropic()[0].parsed.model === 'claude-sonnet-5');
check('la foto viaja como imagen base64', anthropic()[0].parsed.messages[0].content.some((b) => b.type === 'image'));
reset(); db.request.photos = [];
await call({ action: 'triage', id: ID });
check('sin fotos alcanza con el modelo rápido', anthropic()[0].parsed.model === 'claude-haiku-4-5-20251001');
reset(); ai = () => ({ service_slugs: ['inventado', 'cambio-aceite', 'cambio-aceite'], urgency: 'normal', summary: 'x', missing_info: [], checklist: [], can_quote_without_inspection: true });
await call({ action: 'triage', id: ID });
check('un servicio que la IA inventa se descarta, y los repetidos se juntan', db.saved[0].p_triage.services.length === 1 && db.saved[0].p_triage.services[0].slug === 'cambio-aceite');
check('el precio "desde" sale de la base, no de la IA', db.saved[0].p_triage.services[0].price_from === 1500);
check('en lo que se guarda no hay precios inventados (ni "RD$" ni "precio")', !/RD\$|precio/i.test(JSON.stringify({ ...db.saved[0].p_triage, services: [] })));
check('el sistema prohíbe dar precios', /NUNCA des precios/.test(anthropic()[0].parsed.system));

console.log('\nSeguridad (regla fija)');
for (const text of ['Los frenos hacen ruido y el pedal está blando', 'La dirección vibra mucho al manejar', 'Tiene una fuga de gasolina debajo del carro', 'Gotea combustible']) {
  reset(); db.request.description = text; ai = () => ({ service_slugs: [], urgency: 'normal', summary: 'x', missing_info: [], checklist: [], can_quote_without_inspection: true });
  await call({ action: 'triage', id: ID });
  check(`"${text.slice(0, 32)}…": urgencia seguridad aunque la IA diga normal`, db.saved[0].p_urgency === 'seguridad');
}
reset(); db.request.description = 'Quiero cambiar el aceite y el filtro'; ai = () => ({ service_slugs: ['cambio-aceite'], urgency: 'normal', summary: 'x', missing_info: [], checklist: [], can_quote_without_inspection: true });
await call({ action: 'triage', id: ID });
check('algo normal no se marca de seguridad', db.saved[0].p_urgency === 'normal');
reset(); ai = () => ({ service_slugs: [], urgency: 'seguridad', summary: 'x', missing_info: [], checklist: [], can_quote_without_inspection: false });
await call({ action: 'triage', id: ID });
check('si la IA marca seguridad, se respeta (nunca se baja)', db.saved[0].p_urgency === 'seguridad');

console.log('\nDatos del cliente');
reset();
await call({ action: 'triage', id: ID });
const userText = anthropic()[0].parsed.messages[0].content.at(-1).text;
check('la descripción va como dato, dentro de <datos>', userText.includes('<datos>') && userText.indexOf('suspensión') > userText.indexOf('<datos>'));
check('el teléfono escrito en la descripción no se manda', !/953-9782/.test(userText));
check('el nombre y el teléfono del cliente no están en lo que se manda', !/contact_name|contact_phone|8095550134/.test(JSON.stringify(anthropic()[0].parsed)));
check('el sistema dice que lo del cliente es dato, no instrucciones', /nunca instrucciones/.test(anthropic()[0].parsed.system));

console.log('\nAviso a admins y fallos');
reset();
await call({ action: 'triage', id: ID });
check('avisa a los admins con el secreto de push y solo el id', db.pushes.length === 1 && db.pushes[0].body.kind === 'quote_new' && db.pushes[0].body.id === ID && db.pushes[0].headers['x-push-secret'] === 'push-secreto' && Object.keys(db.pushes[0].body).length === 2);
reset(); ai = () => 500;
r = await call({ action: 'triage', id: ID });
check('con la IA caída: ia_no_disponible, sin triage, pero el aviso a admins sale igual', r.reply.code === 'ia_no_disponible' && db.saved.length === 0 && db.pushes.length === 1);
reset(); db.settings.ai_feature_quote_triage = false;
r = await call({ action: 'triage', id: ID });
check('con el interruptor apagado: sin llamadas a la IA y con aviso', r.reply.code === 'ia_no_disponible' && anthropic().length === 0 && db.pushes.length === 1);
reset(); delete secrets.PUSH_WEBHOOK_SECRET;
await call({ action: 'triage', id: ID });
check('sin secreto de push no avisa, y el triage sale igual', db.pushes.length === 0 && db.saved.length === 1);
reset(); db.files = {};
await call({ action: 'triage', id: ID });
check('una foto que no se puede abrir no tumba el triage (va sin ella)', db.saved.length === 1);

console.log('\nPurga de fotos');
reset(); db.purge = [{ id: 'a', photos: ['u1/0.jpg', 'u1/1.jpg'] }, { id: 'b', photos: ['u2/0.jpg'] }];
r = await call({ action: 'purge' });
check('borra las fotos con la API de Storage y quita las filas', r.reply.data.purged === 2 && db.deleted.length === 2 && JSON.stringify(db.deleted[0]) === '["u1/0.jpg","u1/1.jpg"]' && db.cleared.length === 2);
reset(); db.purge = [{ id: 'a', photos: ['u1/0.jpg'] }]; db.deleteStatus = 500;
r = await call({ action: 'purge' });
check('si Storage no las borró, NO se quitan de la fila (se reintenta mañana)', r.reply.data.purged === 0 && db.cleared === null);
reset();
r = await call({ action: 'purge' });
check('sin nada por purgar no hace nada', r.reply.data.purged === 0 && db.deleted.length === 0);
check('la purga también exige secreto o admin', (await call({ action: 'purge' }, {})).status === 403);

console.log(failed === 0 ? '\nTodo en orden.' : `\n${failed} comprobaciones fallaron.`);
process.exit(failed === 0 ? 0 : 1);
