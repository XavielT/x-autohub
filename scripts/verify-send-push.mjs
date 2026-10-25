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
  VERCEL_TOKEN: 'vercel-token',
  VERCEL_PROJECT_ID: 'prj_123',
  VERCEL_TEAM_ID: 'team_123',
};

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const GUEST_ID = '22222222-2222-4222-8222-222222222222';
const APPT_ID = '33333333-3333-4333-8333-333333333333';
const OWNER = '44444444-4444-4444-8444-444444444444';
const ADMIN_USER = '55555555-5555-4555-8555-555555555555';

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
  if (url.startsWith('https://api.vercel.com/v6/deployments')) {
    if (db.vercelStatus !== 200) return new Response('', { status: db.vercelStatus });
    return json({ deployments: db.deployments });
  }
  if (url.includes('/rest/v1/profiles?')) return json(db.admins);
  if (url.includes('/rest/v1/deploy_alerts') && (init.method ?? 'GET') === 'GET') {
    return json(db.alerts.filter((a) => url.includes(`deployment_id=eq.${a.deployment_id}&`)));
  }
  if (url.includes('/rest/v1/deploy_alerts') && init.method === 'DELETE') {
    const id = decodeURIComponent(url.split('deployment_id=eq.')[1] ?? '');
    db.alerts = db.alerts.filter((a) => a.deployment_id !== id);
    return new Response(null, { status: 204 });
  }
  if (url.includes('/rest/v1/deploy_alerts') && init.method === 'POST') {
    const row = JSON.parse(init.body);
    if (db.alerts.some((a) => a.deployment_id === row.deployment_id)) return new Response('conflict', { status: 409 });
    db.alerts.push(row);
    return json([row], 201);
  }
  if (url.includes('/rest/v1/hub_market_items?')) return json(db.listings.filter((l) => url.includes(`id=eq.${l.id}&`)));
  if (url.includes('/rest/v1/order_push_subscriptions') && (init.method ?? 'GET') === 'GET') {
    return json(db.orderDevices.filter((d) => url.includes(`order_id=eq.${d.order_id}`)));
  }
  if (url.includes('/rest/v1/order_push_subscriptions') && init.method === 'DELETE') return new Response(null, { status: 204 });
  if (url.includes('/rest/v1/appointment_push_subscriptions') && (init.method ?? 'GET') === 'GET') {
    return json(db.apptDevices.filter((d) => url.includes(`appointment_id=eq.${d.appointment_id}`)));
  }
  if (url.includes('/rest/v1/appointment_push_subscriptions') && init.method === 'DELETE') return new Response(null, { status: 204 });
  if (url.includes('/rest/v1/push_subscriptions') && (init.method ?? 'GET') === 'GET') return json(db.devices);
  if (url.includes('/rest/v1/push_subscriptions') && init.method === 'DELETE') return new Response(null, { status: 204 });
  if (url.startsWith('https://fcm.googleapis.com/fcm/send/')) return new Response('', { status: pushStatus[url] ?? 201 });
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
    devices: [{ id: 1, endpoint: 'https://fcm.googleapis.com/fcm/send/uno', p256dh, auth }],
    orderDevices: [],
    apptDevices: [],
    vercelStatus: 200,
    deployments: [{ uid: 'dpl_fallido', readyState: 'ERROR', meta: { githubCommitMessage: 'Cambio que rompio el build\n\ncuerpo largo' } }],
    admins: [{ id: ADMIN_USER }],
    alerts: [],
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
const pushes = () => calls.filter((c) => c.url.startsWith('https://fcm.googleapis.com/fcm/send/'));

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
check('un pedido de invitado sin dispositivos suscritos no tiene a quien avisar', r.body.reason === 'no-devices' && pushes().length === 0);

console.log('→ Los avisos de un pedido de invitado');
const dispositivo = (id, order_id = GUEST_ID, endpoint = 'https://fcm.googleapis.com/fcm/send/invitado') => ({ id, order_id, endpoint, p256dh, auth });
reset();
db.orderDevices = [dispositivo(1)];
r = await ask({ kind: 'order', id: GUEST_ID });
check('avisa a los dispositivos suscritos a ese pedido', r.status === 200 && r.body.sent === 1, JSON.stringify(r));
check('los busco por pedido, no por cuenta', calls.some((c) => c.url.includes(`order_push_subscriptions?select=id,endpoint,p256dh,auth&order_id=eq.${GUEST_ID}`)) && !calls.some((c) => c.url.includes('/rest/v1/push_subscriptions')));
check('un estado que no es final no borra los dispositivos', !calls.some((c) => c.init.method === 'DELETE'));

reset();
db.orders[1].status = 'delivered';
db.orderDevices = [dispositivo(1)];
r = await ask({ kind: 'order', id: GUEST_ID });
check('al avisar un estado final (entregado) se borran los dispositivos del pedido', r.body.sent === 1 && calls.some((c) => c.init.method === 'DELETE' && c.url.endsWith(`order_push_subscriptions?order_id=eq.${GUEST_ID}`)));

reset();
db.orders[1].status = 'cancelled';
db.orderDevices = [dispositivo(1)];
await ask({ kind: 'order', id: GUEST_ID });
check('tambien al cancelarse', calls.some((c) => c.init.method === 'DELETE' && c.url.endsWith(`order_push_subscriptions?order_id=eq.${GUEST_ID}`)));

reset();
db.orderDevices = [dispositivo(7, GUEST_ID, 'https://fcm.googleapis.com/fcm/send/caido')];
pushStatus['https://fcm.googleapis.com/fcm/send/caido'] = 410;
r = await ask({ kind: 'order', id: GUEST_ID });
check('un dispositivo caido (410) se borra de la tabla del pedido, no de la de cuentas', r.body.removed === 1 && calls.some((c) => c.init.method === 'DELETE' && c.url.endsWith('order_push_subscriptions?id=in.(7)')) && !calls.some((c) => c.init.method === 'DELETE' && c.url.endsWith('push_subscriptions?id=in.(7)') && !c.url.includes('order_')));

reset();
db.orderDevices = [dispositivo(1, '99999999-9999-4999-8999-999999999999')];
r = await ask({ kind: 'order', id: GUEST_ID });
check('los dispositivos de otro pedido no reciben el aviso de este', r.body.reason === 'no-devices' && pushes().length === 0);

reset();
db.orderDevices = [dispositivo(1, ORDER_ID)];
r = await ask({ kind: 'order', id: ORDER_ID });
check('un pedido con dueño avisa a su cuenta y nunca a la tabla de invitados', r.body.sent === 1 && !calls.some((c) => c.url.includes('order_push_subscriptions')));

reset();
db.orders[1].status = 'awaiting_payment';
db.orderDevices = [dispositivo(1)];
r = await ask({ kind: 'order', id: GUEST_ID });
check('un estado que no se avisa no manda nada a un invitado', r.body.reason === 'no-message' && pushes().length === 0);

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

console.log('→ El aviso de un despliegue fallido');
const deploy = (token = 'anon') => ask({ kind: 'deploy' }, token, 'POST', { 'x-push-secret': 'secreto-de-la-base' });
const conSecreto = () => { reset(); env.PUSH_WEBHOOK_SECRET = 'secreto-de-la-base'; };
conSecreto();
r = await deploy();
check('un despliegue fallido avisa a los admins', r.status === 200 && r.body.sent === 1, JSON.stringify(r));
check('se busco a los admins (por su rol), no a un usuario cualquiera', calls.some((c) => c.url.includes('profiles?select=id&role=eq.admin')));
check('y a los dispositivos de esos admins', calls.some((c) => c.url.includes(`push_subscriptions?select=id,endpoint,p256dh,auth&user_id=in.(${ADMIN_USER})`)));
check('se pregunto a Vercel por el ultimo despliegue de produccion, con el token del servidor', calls.some((c) => c.url.includes('projectId=prj_123') && c.url.includes('target=production') && c.url.includes('teamId=team_123') && c.init.headers.Authorization === 'Bearer vercel-token'));
check('queda anotado de cual se aviso', db.alerts.length === 1 && db.alerts[0].deployment_id === 'dpl_fallido');
r = await deploy();
check('la siguiente vez (10 minutos despues) no repite el aviso', r.body.reason === 'no-message' && pushes().length === 1, JSON.stringify(r));
conSecreto();
db.deployments[0].readyState = 'READY';
r = await deploy();
check('si el ultimo salio bien, no avisa', r.body.reason === 'no-message' && pushes().length === 0 && db.alerts.length === 0);
for (const estado of ['BUILDING', 'QUEUED', 'CANCELED']) {
  conSecreto();
  db.deployments[0].readyState = estado;
  r = await deploy();
  check(`un despliegue ${estado} no es un fallo`, r.body.reason === 'no-message' && pushes().length === 0);
}
conSecreto();
db.deployments = [];
r = await deploy();
check('sin despliegues no hay nada que avisar', r.body.reason === 'no-message');
conSecreto();
db.vercelStatus = 500;
r = await deploy();
check('si Vercel no responde, no avisa ni falla', r.status === 200 && r.body.reason === 'no-message' && pushes().length === 0);
conSecreto();
delete env.VERCEL_TOKEN;
r = await deploy();
check('sin el token de Vercel no se pregunta ni se avisa', r.body.reason === 'no-message' && !calls.some((c) => c.url.startsWith('https://api.vercel.com')));
conSecreto();
db.admins = [];
r = await deploy();
check('sin admins no hay a quien avisar', r.body.reason === 'no-devices' && pushes().length === 0);
conSecreto();
db.devices = [];
r = await deploy();
check('si ningun admin activo los avisos, NO se anota: el que los active despues se entera del fallo que sigue vigente', r.body.reason === 'no-devices' && db.alerts.length === 0);
conSecreto();
pushStatus['https://fcm.googleapis.com/fcm/send/uno'] = 500;
r = await deploy();
check('si el aviso no llega a ningun dispositivo (500), se deshace la anotacion: el siguiente sondeo lo reintenta', r.body.sent === 0 && db.alerts.length === 0 && calls.some((c) => c.init.method === 'DELETE' && c.url.includes('deploy_alerts?deployment_id=eq.dpl_fallido')));
conSecreto();
r = await deploy();
check('y si llega, queda anotado', r.body.sent === 1 && db.alerts.length === 1 && db.alerts[0].deployment_id === 'dpl_fallido');
conSecreto();
db.alerts.push({ deployment_id: 'dpl_fallido' });
r = await deploy();
check('uno ya avisado no vuelve a salir', r.body.reason === 'no-message' && pushes().length === 0);
r = await ask({ kind: 'deploy' }, null);
check('sin el secreto de la base ni un admin, no entra', r.status === 403);
conSecreto();
db.deployments[0].meta = { githubCommitMessage: 'x'.repeat(300) };
await deploy();
const enviado = calls.find((c) => c.url.startsWith('https://fcm.googleapis.com/fcm/send/'));
check('un mensaje de commit larguisimo no impide el aviso', enviado !== undefined);

console.log('→ Los avisos de una cita de invitado');
const GUEST_APPT = '66666666-6666-4666-8666-666666666666';
const citaInvitada = (status = 'confirmed') => ({ id: GUEST_APPT, appointment_number: 2002, status, user_id: null, scheduled_at: '2026-11-05T14:30:00Z' });
const dispCita = (id, appointment_id = GUEST_APPT, endpoint = 'https://fcm.googleapis.com/fcm/send/cita') => ({ id, appointment_id, endpoint, p256dh, auth });

reset();
db.appointments.push(citaInvitada());
db.apptDevices = [dispCita(1)];
r = await ask({ kind: 'appointment', id: GUEST_APPT });
check('avisa a los dispositivos suscritos a esa cita', r.status === 200 && r.body.sent === 1, JSON.stringify(r));
check('los busco por cita, no por cuenta ni por pedido', calls.some((c) => c.url.includes(`appointment_push_subscriptions?select=id,endpoint,p256dh,auth&appointment_id=eq.${GUEST_APPT}`)) && !calls.some((c) => c.url.includes('/rest/v1/push_subscriptions') || c.url.includes('order_push_subscriptions')));
check('un estado que no es final (confirmada) no borra los dispositivos', !calls.some((c) => c.init.method === 'DELETE'));

reset();
db.appointments.push(citaInvitada('done'));
db.apptDevices = [dispCita(1)];
r = await ask({ kind: 'appointment', id: GUEST_APPT });
check('al avisar que quedo lista (estado final) se borran los dispositivos de esa cita', r.body.sent === 1 && calls.some((c) => c.init.method === 'DELETE' && c.url.endsWith(`appointment_push_subscriptions?appointment_id=eq.${GUEST_APPT}`)));

reset();
db.appointments.push(citaInvitada('cancelled'));
db.apptDevices = [dispCita(1)];
await ask({ kind: 'appointment', id: GUEST_APPT });
check('tambien al cancelarse', calls.some((c) => c.init.method === 'DELETE' && c.url.endsWith(`appointment_push_subscriptions?appointment_id=eq.${GUEST_APPT}`)));

reset();
db.appointments.push(citaInvitada());
r = await ask({ kind: 'appointment', id: GUEST_APPT });
check('una cita de invitado sin dispositivos no tiene a quien avisar', r.body.reason === 'no-devices' && pushes().length === 0);

reset();
db.appointments.push(citaInvitada());
db.apptDevices = [dispCita(1, '99999999-9999-4999-8999-999999999999')];
r = await ask({ kind: 'appointment', id: GUEST_APPT });
check('los dispositivos de otra cita no reciben el aviso de esta', r.body.reason === 'no-devices' && pushes().length === 0);

reset();
db.appointments.push(citaInvitada());
db.apptDevices = [dispCita(9, GUEST_APPT, 'https://fcm.googleapis.com/fcm/send/caido')];
pushStatus['https://fcm.googleapis.com/fcm/send/caido'] = 410;
r = await ask({ kind: 'appointment', id: GUEST_APPT });
check('un dispositivo caido (410) se borra de la tabla de la cita', r.body.removed === 1 && calls.some((c) => c.init.method === 'DELETE' && c.url.endsWith('appointment_push_subscriptions?id=in.(9)')));

reset();
db.apptDevices = [dispCita(1, APPT_ID)];
r = await ask({ kind: 'appointment', id: APPT_ID });
check('una cita con dueño avisa a su cuenta y nunca a la tabla de invitados', r.body.sent === 1 && !calls.some((c) => c.url.includes('appointment_push_subscriptions')));

reset();
db.appointments.push(citaInvitada('no_show'));
db.apptDevices = [dispCita(1)];
r = await ask({ kind: 'appointment', id: GUEST_APPT });
check('una cita a la que no se presento no avisa a nadie', r.body.reason === 'no-message' && pushes().length === 0);
check('pero si es de invitado se limpian sus dispositivos: es un estado final y nadie mas los borraria', calls.some((c) => c.init.method === 'DELETE' && c.url.endsWith(`appointment_push_subscriptions?appointment_id=eq.${GUEST_APPT}`)));

reset();
db.appointments.push(citaInvitada('no_show'));
db.appointments.find((a) => a.id === GUEST_APPT).user_id = OWNER;
r = await ask({ kind: 'appointment', id: GUEST_APPT });
check('una cita con dueño a la que no se presento no toca la tabla de invitados', !calls.some((c) => c.url.includes('appointment_push_subscriptions')));

console.log('→ Endpoints que no son de un servicio de push');
reset();
db.devices = [{ id: 1, endpoint: 'https://servidor-ajeno.example/x', p256dh, auth }];
r = await ask({ kind: 'order', id: ORDER_ID });
check('un dispositivo con un endpoint ajeno no recibe una llamada (ni el JWT VAPID)', r.status === 200 && r.body.sent === 0 && !calls.some((c) => c.url.includes('servidor-ajeno')));
for (const malo of ['http://fcm.googleapis.com/fcm/send/x', 'https://fcm.googleapis.com@servidor-ajeno.example/x', 'https://storage.googleapis.com/x', 'https://fcm.googleapis.com.servidor-ajeno.example/x', 'https://push.services.mozilla.com.evil.example/x']) {
  reset();
  db.devices = [{ id: 1, endpoint: malo, p256dh, auth }];
  await ask({ kind: 'order', id: ORDER_ID });
  check(`no se llama a ${malo}`, !calls.some((c) => c.url === malo || c.url.includes('evil.example') || c.url.includes('servidor-ajeno') || c.url.includes('storage.googleapis')));
}
for (const bueno of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://web.push.apple.com/abc', 'https://wns2-par02p.notify.windows.com/w/?token=abc', 'https://android.googleapis.com/gcm/send/abc']) {
  reset();
  db.devices = [{ id: 1, endpoint: bueno, p256dh, auth }];
  pushStatus[bueno] = 201;
  const antes = calls.length;
  await ask({ kind: 'order', id: ORDER_ID });
  check(`si se llama a ${bueno}`, calls.slice(antes).some((c) => c.url === bueno));
}

console.log('→ El recordatorio de una cita');
const enHoras = (h) => new Date(Date.now() + h * 3600000).toISOString();
const recordar = (id = APPT_ID) => ask({ kind: 'appointment_reminder', id });
const conCita = (cambio, id = APPT_ID) => {
  reset();
  env.PUSH_WEBHOOK_SECRET = 'secreto-de-la-base';
  Object.assign(db.appointments.find((a) => a.id === id) ?? db.appointments[db.appointments.push({ id, appointment_number: 3003, status: 'confirmed', user_id: null, scheduled_at: enHoras(10) }) - 1], { status: 'confirmed', scheduled_at: enHoras(10), ...cambio });
};
const sinSecreto = (body) => ask(body, 'anon', 'POST', { 'x-push-secret': 'secreto-de-la-base' });

conCita({});
r = await sinSecreto({ kind: 'appointment_reminder', id: APPT_ID });
check('una cita confirmada para dentro de 10 horas recuerda a su dueño', r.status === 200 && r.body.sent === 1, JSON.stringify(r));
check('se busco a su dueño, no a un invitado', calls.some((c) => c.url.includes(`push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${OWNER}`)) && !calls.some((c) => c.url.includes('appointment_push_subscriptions')));
check('un recordatorio no borra nada', !calls.some((c) => c.init.method === 'DELETE'));

for (const estado of ['requested', 'in_progress', 'done', 'cancelled', 'no_show']) {
  conCita({ status: estado });
  r = await sinSecreto({ kind: 'appointment_reminder', id: APPT_ID });
  check(`una cita ${estado} no se recuerda`, r.body.reason === 'no-message' && pushes().length === 0);
}

conCita({ scheduled_at: enHoras(30) });
r = await sinSecreto({ kind: 'appointment_reminder', id: APPT_ID });
check('una cita de dentro de 30 horas todavia no toca: no se le escribe a nadie por una cita lejana', r.body.reason === 'no-message' && pushes().length === 0);

conCita({ scheduled_at: enHoras(-1) });
r = await sinSecreto({ kind: 'appointment_reminder', id: APPT_ID });
check('una cita que ya paso, tampoco', r.body.reason === 'no-message' && pushes().length === 0);

conCita({ scheduled_at: enHoras(24.5) });
r = await sinSecreto({ kind: 'appointment_reminder', id: APPT_ID });
check('el margen de la hora del cron cubre una cita a 24.5 horas', r.body.sent === 1);

conCita({ user_id: null }, GUEST_APPT);
db.apptDevices = [dispCita(1)];
r = await sinSecreto({ kind: 'appointment_reminder', id: GUEST_APPT });
check('una cita de invitado recuerda a los dispositivos suscritos a esa cita', r.body.sent === 1 && calls.some((c) => c.url.includes(`appointment_push_subscriptions?select=id,endpoint,p256dh,auth&appointment_id=eq.${GUEST_APPT}`)), JSON.stringify(r));
check('y no los borra (no es un estado final)', !calls.some((c) => c.init.method === 'DELETE'));

conCita({ user_id: null }, GUEST_APPT);
r = await sinSecreto({ kind: 'appointment_reminder', id: GUEST_APPT });
check('una cita de invitado sin dispositivos no tiene a quien recordar', r.body.reason === 'no-devices' && pushes().length === 0);

conCita({});
r = await sinSecreto({ kind: 'appointment_reminder', id: '99999999-9999-4999-8999-999999999999' });
check('una cita que no existe es 404', r.status === 404);
r = await sinSecreto({ kind: 'appointment_reminder', id: 'no-es-uuid' });
check('un id que no es uuid es una peticion mala', r.status === 400);
r = await ask({ kind: 'appointment_reminder', id: APPT_ID }, null);
check('sin el secreto de la base ni un admin, no entra', r.status === 403);

console.log('→ Dispositivos');
reset();
db.devices = [];
r = await ask({ kind: 'order', id: ORDER_ID });
check('sin dispositivos no hay nada que mandar', r.body.reason === 'no-devices');
reset();
db.devices = [
  { id: 1, endpoint: 'https://fcm.googleapis.com/fcm/send/vivo', p256dh, auth },
  { id: 2, endpoint: 'https://fcm.googleapis.com/fcm/send/caido', p256dh, auth },
];
pushStatus['https://fcm.googleapis.com/fcm/send/caido'] = 410;
r = await ask({ kind: 'order', id: ORDER_ID });
check('manda a todos y cuenta los que llegaron', r.body.sent === 1 && r.body.removed === 1, JSON.stringify(r));
check('el dispositivo caido (410) se borra de la base', calls.some((c) => c.init.method === 'DELETE' && c.url.endsWith('push_subscriptions?id=in.(2)')));
reset();
pushStatus['https://fcm.googleapis.com/fcm/send/uno'] = 500;
r = await ask({ kind: 'order', id: ORDER_ID });
check('un 500 no borra el dispositivo ni hace fallar al panel', r.status === 200 && r.body.sent === 0 && r.body.removed === 0 && !calls.some((c) => c.init.method === 'DELETE'));

console.log('→ Configuracion');
reset();
delete env.VAPID_PRIVATE_KEY;
r = await ask({ kind: 'order', id: ORDER_ID });
check('sin las claves responde not-configured, con 200, y no manda', r.status === 200 && r.body.reason === 'not-configured' && pushes().length === 0);

console.log(failed === 0 ? '\n✓ send-push en verde.' : `\n✗ ${failed} problema(s).`);
process.exit(failed === 0 ? 0 : 1);
