// Prueba los tipos de aviso que la ronda de IA le sumó a send-push (supabase/functions/send-push/index.ts):
//
//   node scripts/verify-send-push-ai.mjs
//
//   proof_ready (0052)   comprobante que coincide, a los admins
//   moderation (0053)    contenido que la IA ocultó, a moderadores y admins
//   quote_new (0055)     solicitud de cotización nueva, a los admins
//   digest (0056)        "Hoy en el negocio", a los admins
//   maintenance_reminder / maintenance_logged (0058)   al dueño del vehículo
//
// Lo que fija: que cada aviso VUELVE A COMPROBAR en la base lo que dice (el secreto no sirve para avisar de otra cosa), que solo avise a quien toca y que
// no lleve datos personales de un cliente en el texto. Complementa a verify-send-push.mjs (los tipos de antes).

import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { b64uEncode } from '../supabase/functions/send-push/webpush.mjs';

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`   ${ok ? 'OK   ' : 'FALLA'} ${name}${ok ? '' : ` ${extra}`}`);
  if (!ok) failed++;
};

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'send-push-ai-')), 'handler.mjs');
await build({ entryPoints: ['supabase/functions/send-push/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });

const uaKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const p256dh = b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey)));
const auth = b64uEncode(crypto.getRandomValues(new Uint8Array(16)));
const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const ENV = {
  SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
  VAPID_PUBLIC_KEY: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', vapid.publicKey))),
  VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', vapid.privateKey)).d, VAPID_SUBJECT: 'mailto:equipo@xautohubrd.com', PUSH_WEBHOOK_SECRET: 'secreto',
};

const ID = '11111111-1111-4111-8111-111111111111';
const OWNER = '44444444-4444-4444-8444-444444444444';
let db, calls, payloads;

globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { globalThis.__handler = h; } };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, init });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const method = init.method ?? 'GET';
  if (url.includes('/rest/v1/orders?')) return json(db.orders);
  if (url.includes('/rest/v1/order_proof_checks?')) return json(db.checks);
  if (url.includes('/rest/v1/ai_moderation?')) return json(db.moderation);
  if (url.includes('/rest/v1/service_quote_requests?')) return json(db.quotes);
  if (url.includes('/rest/v1/ai_digests?')) return json(db.digests);
  if (url.includes('/rest/v1/profile_vehicles?')) return json(db.vehicles);
  if (url.includes('/rest/v1/vehicle_maintenance_items?') && url.includes('status=in.')) return json(db.due);
  if (url.includes('/rest/v1/vehicle_maintenance_items?')) return json(db.items);
  if (url.includes('/rest/v1/vehicle_makes?')) return json([{ name: 'Toyota' }]);
  if (url.includes('/rest/v1/vehicle_models?')) return json([{ name: 'Corolla' }]);
  if (url.includes('/rest/v1/profiles?')) { db.profilesQuery = url; return json(db.admins); }
  if (url.includes('/rest/v1/push_subscriptions') && method === 'GET') { db.devicesQuery = url; return json([{ id: 1, endpoint: 'https://fcm.googleapis.com/fcm/send/uno', p256dh, auth }]); }
  if (url.startsWith('https://fcm.googleapis.com/fcm/send/')) { payloads.push(url); return new Response('', { status: 201 }); }
  throw new Error(`fetch inesperado: ${url}`);
};
await import(pathToFileURL(out).href);
const handler = globalThis.__handler;

const reset = () => {
  calls = [];
  payloads = [];
  db = {
    orders: [{ order_number: 1042, status: 'awaiting_payment' }], checks: [{ verdict: 'coincide' }],
    moderation: [{ target_type: 'social_comment', auto_action: 'oculto', restored_at: null }],
    quotes: [{ code: 'XAH-C-0007', status: 'nueva' }],
    digests: [{ body_md: '- **2** pedidos esperan confirmación de pago.\n- Otra línea', created_at: new Date().toISOString() }],
    vehicles: [{ user_id: OWNER, make_id: 1, model_id: 100, model_text: null, year: 2015, maintenance_reminders: true }],
    due: [{ label: 'Aceite y filtro' }, { label: 'Bujías' }],
    items: [{ label: 'Aceite y filtro', source: 'taller', updated_at: new Date().toISOString(), profile_vehicle_id: 7 }],
    admins: [{ id: 'admin-1' }], profilesQuery: '', devicesQuery: '',
  };
};
const ask = async (body) => {
  const res = await handler(new Request('https://p.supabase.co/functions/v1/send-push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer anon', 'x-push-secret': 'secreto' }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

console.log('→ proof_ready (comprobante que coincide)');
reset();
let r = await ask({ kind: 'proof_ready', id: ID });
check('con el último veredicto "coincide" y el pedido esperando pago, avisa a los admins', r.body.sent === 1 && /role=eq\.admin/.test(db.profilesQuery));
reset(); db.checks = [{ verdict: 'revisar' }];
r = await ask({ kind: 'proof_ready', id: ID });
check('si el último veredicto no es "coincide", no avisa (aunque tengan el secreto)', r.body.reason === 'no-message' && payloads.length === 0);
reset(); db.orders = [{ order_number: 1042, status: 'paid' }];
r = await ask({ kind: 'proof_ready', id: ID });
check('si el pedido ya no espera el pago, no avisa', r.body.reason === 'no-message');
reset(); db.orders = [];
check('un pedido que no existe: 404', (await ask({ kind: 'proof_ready', id: ID })).status === 404);
check('un id que no es uuid: 400', (await ask({ kind: 'proof_ready', id: 5 })).status === 400);

console.log('→ moderation (la IA ocultó algo)');
reset();
r = await ask({ kind: 'moderation', id: 77 });
check('avisa a moderadores Y admins', r.body.sent === 1 && /role=in\.\(admin,moderador\)/.test(db.profilesQuery), db.profilesQuery);
reset(); db.moderation = [{ target_type: 'review', auto_action: 'ninguna', restored_at: null }];
check('si no se ocultó nada, no avisa', (await ask({ kind: 'moderation', id: 77 })).body.reason === 'no-message');
reset(); db.moderation = [{ target_type: 'review', auto_action: 'oculto', restored_at: '2026-11-04T00:00:00Z' }];
check('si ya lo restauró un moderador, no avisa', (await ask({ kind: 'moderation', id: 77 })).body.reason === 'no-message');
check('el id tiene que ser un entero', (await ask({ kind: 'moderation', id: ID })).status === 400);
reset();
await ask({ kind: 'proof_ready', id: ID });
check('los avisos de comprobante solo van a admins (no a moderadores)', !/moderador/.test(db.profilesQuery));

console.log('→ quote_new (solicitud de cotización)');
reset();
r = await ask({ kind: 'quote_new', id: ID });
check('avisa a los admins con el código, sin nombre ni teléfono del cliente', r.body.sent === 1 && !/contact_name|contact_phone/.test(calls.map((c) => c.url).join(' ')));
reset(); db.quotes = [{ code: 'XAH-C-0007', status: 'respondida' }];
check('si ya no es nueva, no avisa', (await ask({ kind: 'quote_new', id: ID })).body.reason === 'no-message');
reset(); db.quotes = [];
check('una solicitud que no existe: 404', (await ask({ kind: 'quote_new', id: ID })).status === 404);

console.log('→ digest (Hoy en el negocio)');
reset();
r = await ask({ kind: 'digest' });
check('avisa a los admins con la primera línea del resumen (sin símbolos de Markdown)', r.body.sent === 1);
reset(); db.digests = [{ body_md: '- viejo', created_at: new Date(Date.now() - 3600_000).toISOString() }];
check('un resumen de hace una hora no vuelve a sonar', (await ask({ kind: 'digest' })).body.reason === 'no-message');
reset(); db.digests = [];
check('sin resumen, nada', (await ask({ kind: 'digest' })).body.reason === 'no-message');

console.log('→ maintenance_reminder (toca mantenimiento)');
reset();
r = await ask({ kind: 'maintenance_reminder', id: 7 });
check('avisa al dueño del vehículo (no a los admins)', r.body.sent === 1 && /user_id=eq\./.test(db.devicesQuery) && db.devicesQuery.includes(OWNER), db.devicesQuery);
reset(); db.vehicles[0].maintenance_reminders = false;
check('si apagó los recordatorios, no avisa aunque tengan el secreto', (await ask({ kind: 'maintenance_reminder', id: 7 })).body.reason === 'no-message');
reset(); db.due = [];
check('sin renglones por vencer, no avisa', (await ask({ kind: 'maintenance_reminder', id: 7 })).body.reason === 'no-message');
reset(); db.vehicles = [];
check('un vehículo que no existe: 404', (await ask({ kind: 'maintenance_reminder', id: 7 })).status === 404);

console.log('→ maintenance_logged (el taller registró un servicio)');
reset();
r = await ask({ kind: 'maintenance_logged', id: 3 });
check('avisa al dueño', r.body.sent === 1 && db.devicesQuery.includes(OWNER));
reset(); db.items[0].source = 'usuario';
check('si no lo registró el taller, no avisa', (await ask({ kind: 'maintenance_logged', id: 3 })).body.reason === 'no-message');
reset(); db.items[0].updated_at = new Date(Date.now() - 3600_000).toISOString();
check('un registro de hace una hora no vuelve a sonar', (await ask({ kind: 'maintenance_logged', id: 3 })).body.reason === 'no-message');

console.log(failed === 0 ? '\n✓ send-push (IA) en verde.' : `\n✗ ${failed} problema(s).`);
process.exit(failed === 0 ? 0 : 1);
