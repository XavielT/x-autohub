// Prueba el handler de supabase/functions/send-push/index.ts sin Deno ni Supabase:
//
//   node scripts/verify-send-push.mjs
//
// Empaqueta la funcion con esbuild (ya viene con Angular), le pone un `Deno` y un `fetch`
// de mentira (la base y el servicio de push), y recorre lo que importa: que solo un admin la
// llame, que el texto salga de la base y no del navegador, que un invitado no reciba nada,
// que un dispositivo caido se borre y que sin claves no falle.
//
// Complementa a `scripts/verify-webpush.mjs`, que prueba la criptografia.

import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { b64uEncode } from '../supabase/functions/send-push/webpush.mjs';

const enc = new TextEncoder();
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`   ${ok ? 'OK   ' : 'FALLA'} ${name}${ok ? '' : ` ${extra}`}`);
  if (!ok) failed++;
};

// --- Empaquetar la funcion ----------------------------------------------------------
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'send-push-')), 'handler.mjs');
await build({ entryPoints: ['supabase/functions/send-push/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });

// --- Un navegador y un sitio de mentira --------------------------------------------
const uaKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const p256dh = b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey)));
const auth = b64uEncode(crypto.getRandomValues(new Uint8Array(16)));
const vapidKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const vapidPublic = b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', vapidKeys.publicKey)));
const vapidPrivate = (await crypto.subtle.exportKey('jwk', vapidKeys.privateKey)).d;

const ENV = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  VAPID_PUBLIC_KEY: vapidPublic,
  VAPID_PRIVATE_KEY: vapidPrivate,
  VAPID_SUBJECT: 'mailto:equipo@xautohubrd.com',
};

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const GUEST_ID = '22222222-2222-4222-8222-222222222222';
const APPT_ID = '33333333-3333-4333-8333-333333333333';
const OWNER = '44444444-4444-4444-8444-444444444444';

let env = { ...ENV };
let db;
let pushStatus;
let calls;

globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { globalThis.__handler = h; } };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, init });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  if (url.endsWith('/rest/v1/rpc/is_admin')) return json(init.headers.Authorization === 'Bearer token-admin');
  if (url.includes('/rest/v1/orders?')) return json(db.orders.filter((o) => url.includes(`id=eq.${o.id}`)));
  if (url.includes('/rest/v1/service_appointments?')) return json(db.appointments.filter((a) => url.includes(`id=eq.${a.id}`)));
  if (url.includes('/rest/v1/hub_market_items?')) return json(db.listings.filter((l) => url.includes(`id=eq.${l.id}&`)));
  if (url.includes('/rest/v1/push_subscriptions') && (init.method ?? 'GET') === 'GET') return json(db.devices);
  if (url.includes('/rest/v1/push_subscriptions') && init.method === 'DELETE') return new Response(null, { status: 204 });
  if (url.startsWith('https://push.example/')) return new Response('', { status: pushStatus[url] ?? 201 });
  throw new Error(`fetch inesperado: ${url}`);
};

await import(pathToFileURL(out).href);
const handler = globalThis.__handler;

function reset() {
  env = { ...ENV };
  calls = [];
  pushStatus = {};
  db = {
    orders: [
      { id: ORDER_ID, order_number: 1001, status: 'shipped', user_id: OWNER },
      { id: GUEST_ID, order_number: 1002, status: 'shipped', user_id: null },
    ],
    appointments: [{ id: APPT_ID, appointment_number: 2001, status: 'confirmed', user_id: OWNER, scheduled_at: '2026-11-05T14:30:00Z' }],
    devices: [{ id: 1, endpoint: 'https://push.example/uno', p256dh, auth }],
    listings: [
      { id: 501, title: 'Faros LED', seller_id: OWNER, expires_at: new Date(Date.now() + 3.5 * 86400000).toISOString(), status: 'aprobado', is_active: true, is_test: false, sold_at: null },
    ],
  };
}
const ask = async (body, token = 'token-admin', method = 'POST', extra = {}) => {
  const res = await handler(new Request('https://f.supabase.co/functions/v1/send-push', {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  }));
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};
const pushes = () => calls.filter((c) => c.url.startsWith('https://push.example/'));

console.log('→ Quien puede llamarla');
reset();
check('OPTIONS responde para el navegador (CORS)', (await ask(null, null, 'OPTIONS')).status === 204);
check('un GET no es valido', (await ask(null, 'token-admin', 'GET')).status === 405);
let r = await ask({ kind: 'order', id: ORDER_ID }, 'token-cliente');
check('un cliente (no admin) recibe 403 y no se manda nada', r.status === 403 && r.body.reason === 'forbidden' && pushes().length === 0);
r = await ask({ kind: 'order', id: ORDER_ID }, null);
check('sin sesion tambien 403', r.status === 403);

console.log('→ La base la llama con su secreto (migracion 0028)');
reset();
env.PUSH_WEBHOOK_SECRET = 'secreto-de-la-base';
const isAdminCalls = () => calls.filter((c) => c.url.endsWith('/rest/v1/rpc/is_admin')).length;
r = await ask({ kind: 'order', id: ORDER_ID }, 'anon', 'POST', { 'x-push-secret': 'secreto-de-la-base' });
check('con el secreto correcto avisa, aunque el JWT sea el anon', r.status === 200 && r.body.sent === 1, JSON.stringify(r));
check('y no le pregunta a la base si es admin', isAdminCalls() === 0);
r = await ask({ kind: 'appointment', id: APPT_ID }, 'anon', 'POST', { 'x-push-secret': 'secreto-de-la-base' });
check('tambien avisa de una cita', r.status === 200 && r.body.sent === 1, JSON.stringify(r));
calls = [];
r = await ask({ kind: 'order', id: ORDER_ID }, 'anon', 'POST', { 'x-push-secret': 'otro-secreto' });
check('un secreto equivocado es 403 y no se manda nada', r.status === 403 && pushes().length === 0);
r = await ask({ kind: 'order', id: ORDER_ID }, 'anon', 'POST', { 'x-push-secret': 'secreto-de-la-base-y-mas' });
check('uno que solo empieza igual, tambien', r.status === 403);
r = await ask({ kind: 'order', id: ORDER_ID }, 'token-cliente');
check('con el secreto configurado, sin mandarlo, un cliente sigue sin entrar', r.status === 403);
r = await ask({ kind: 'order', id: ORDER_ID }, 'token-admin');
check('y un admin con su sesion sigue entrando', r.status === 200 && r.body.sent === 1);
r = await ask({ kind: 'order', id: "1; drop table orders" }, 'anon', 'POST', { 'x-push-secret': 'secreto-de-la-base' });
check('con el secreto tampoco se salta la validacion del id', r.status === 400);
reset();
r = await ask({ kind: 'order', id: ORDER_ID }, 'anon', 'POST', { 'x-push-secret': '' });
check('sin PUSH_WEBHOOK_SECRET configurado, un secreto vacio no abre nada', r.status === 403 && pushes().length === 0);

console.log('→ Lo que se le pide');
reset();
check('un kind desconocido es una peticion mala', (await ask({ kind: 'cualquiera', id: ORDER_ID })).status === 400);
check('un id que no es uuid, tambien', (await ask({ kind: 'order', id: "1; drop table orders" })).status === 400);
check('un pedido que no existe es 404', (await ask({ kind: 'order', id: '99999999-9999-4999-8999-999999999999' })).status === 404);

console.log('→ El aviso de un pedido');
reset();
r = await ask({ kind: 'order', id: ORDER_ID });
check('un pedido enviado avisa a su dueño', r.status === 200 && r.body.sent === 1 && r.body.removed === 0, JSON.stringify(r));
check('se manda cifrado al dispositivo, con la firma VAPID', pushes().length === 1 && pushes()[0].init.headers['Content-Encoding'] === 'aes128gcm' && String(pushes()[0].init.headers.Authorization).startsWith('vapid t='));
check('se busco al dueño del pedido, no a otro', calls.some((c) => c.url.includes(`push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${OWNER}`)));
db.orders[0].status = 'awaiting_payment';
calls = [];
r = await ask({ kind: 'order', id: ORDER_ID });
check('un estado que no se avisa (esperando el pago) no manda nada', r.body.reason === 'no-message' && pushes().length === 0);
r = await ask({ kind: 'order', id: GUEST_ID });
db.orders[1].status = 'shipped';
r = await ask({ kind: 'order', id: GUEST_ID });
check('un pedido de invitado no tiene a quien avisar', r.body.reason === 'guest' && pushes().length === 0);

console.log('→ El aviso de una cita');
reset();
r = await ask({ kind: 'appointment', id: APPT_ID });
check('una cita confirmada avisa', r.body.sent === 1);
db.appointments[0].status = 'no_show';
r = await ask({ kind: 'appointment', id: APPT_ID });
check('una cita que no se presento no se avisa', r.body.reason === 'no-message');

console.log('→ El aviso de una publicacion por vencer');
reset();
check('sin el secreto de la base ni un admin, no entra', (await ask({ kind: 'listing', id: 501 }, null)).status === 403);
env.PUSH_WEBHOOK_SECRET = 'secreto-de-la-base';
r = await ask({ kind: 'listing', id: 501 }, 'anon', 'POST', { 'x-push-secret': 'secreto-de-la-base' });
check('a 3 dias de vencer avisa a su vendedor', r.status === 200 && r.body.sent === 1, JSON.stringify(r));
check('se busco al vendedor de la publicacion, no a otro', calls.some((c) => c.url.includes(`push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${OWNER}`)));
r = await ask({ kind: 'listing', id: '501' }, 'anon', 'POST', { 'x-push-secret': 'secreto-de-la-base' });
check('el id de una publicacion es un entero, no un texto', r.status === 400);
r = await ask({ kind: 'listing', id: 'x' }, 'anon', 'POST', { 'x-push-secret': 'secreto-de-la-base' });
check('ni basura', r.status === 400);
r = await ask({ kind: 'listing', id: 999 }, 'anon', 'POST', { 'x-push-secret': 'secreto-de-la-base' });
check('una publicacion que no existe es 404', r.status === 404);
const fuera = async (cambio) => {
  reset();
  env.PUSH_WEBHOOK_SECRET = 'secreto-de-la-base';
  Object.assign(db.listings[0], cambio);
  calls = [];
  const res = await ask({ kind: 'listing', id: 501 }, 'anon', 'POST', { 'x-push-secret': 'secreto-de-la-base' });
  return res.body.reason === 'no-message' && pushes().length === 0;
};
check('con plazo de sobra (20 dias) no avisa: no se le escribe a nadie por lo que no esta por vencer', await fuera({ expires_at: new Date(Date.now() + 20 * 86400000).toISOString() }));
check('ya vencida, tampoco', await fuera({ expires_at: new Date(Date.now() - 3600000).toISOString() }));
check('vendida, tampoco', await fuera({ sold_at: new Date().toISOString() }));
check('de prueba, tampoco', await fuera({ is_test: true }));
check('pendiente, tampoco', await fuera({ status: 'pendiente' }));
check('desactivada, tampoco', await fuera({ is_active: false }));
reset();
env.PUSH_WEBHOOK_SECRET = 'secreto-de-la-base';
db.listings[0].seller_id = null;
r = await ask({ kind: 'listing', id: 501 }, 'anon', 'POST', { 'x-push-secret': 'secreto-de-la-base' });
check('una publicacion sembrada, sin vendedor, no tiene a quien avisar', r.body.reason === 'guest');

console.log('→ Dispositivos');
reset();
db.devices = [];
r = await ask({ kind: 'order', id: ORDER_ID });
check('sin dispositivos no hay nada que mandar', r.body.reason === 'no-devices');
reset();
db.devices = [
  { id: 1, endpoint: 'https://push.example/vivo', p256dh, auth },
  { id: 2, endpoint: 'https://push.example/caido', p256dh, auth },
];
pushStatus['https://push.example/caido'] = 410;
r = await ask({ kind: 'order', id: ORDER_ID });
check('manda a todos y cuenta los que llegaron', r.body.sent === 1 && r.body.removed === 1, JSON.stringify(r));
check('el dispositivo caido (410) se borra de la base', calls.some((c) => c.init.method === 'DELETE' && c.url.endsWith('push_subscriptions?id=in.(2)')));
reset();
pushStatus['https://push.example/uno'] = 500;
r = await ask({ kind: 'order', id: ORDER_ID });
check('un 500 no borra el dispositivo ni hace fallar al panel', r.status === 200 && r.body.sent === 0 && r.body.removed === 0 && !calls.some((c) => c.init.method === 'DELETE'));

console.log('→ Configuracion');
reset();
delete env.VAPID_PRIVATE_KEY;
r = await ask({ kind: 'order', id: ORDER_ID });
check('sin las claves responde not-configured, con 200, y no manda', r.status === 200 && r.body.reason === 'not-configured' && pushes().length === 0);

console.log(failed === 0 ? '\n✓ send-push en verde.' : `\n✗ ${failed} problema(s).`);
process.exit(failed === 0 ? 0 : 1);
