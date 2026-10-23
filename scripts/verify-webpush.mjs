// Prueba de supabase/functions/send-push/webpush.mjs sin desplegar nada:
//
//   node scripts/verify-webpush.mjs
//
// Hace de navegador: genera una suscripcion (claves P-256 + secreto `auth`), deja que
// `webpush.js` cifre un mensaje para ella, lo descifra como lo haria el navegador
// (RFC 8291, escrito aparte aqui) y comprueba que la firma VAPID se verifica con la clave
// publica. Tambien manda un aviso a un servidor local para ver los encabezados y el
// manejo de 404/410.
//
// No es un oraculo independiente: cifrar y descifrar salen de la misma lectura del RFC.
// El contraste con la implementacion de referencia (`web-push` + `http_ece`) se hizo una
// vez a mano, al escribir el modulo; si lo tocas, vuelve a hacerlo.

import http from 'node:http';
import { b64uDecode, b64uEncode, encryptPayload, sendPush, vapidAuthorization } from '../supabase/functions/send-push/webpush.mjs';

const enc = new TextEncoder();
const dec = new TextDecoder();
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`   ${ok ? 'OK   ' : 'FALLA'} ${name}${ok ? '' : ` ${extra}`}`);
  if (!ok) failed++;
};

const concat = (...p) => {
  const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of p) { out.set(x, o); o += x.length; }
  return out;
};
const hkdf = async (salt, ikm, info, len) =>
  new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));

/** Lo que haria el navegador con el cuerpo recibido. */
async function decrypt(body, uaKeys, authSecret) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const idLen = body[20];
  const asPublic = body.slice(21, 21 + idLen);
  const cipher = body.slice(21 + idLen);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey));
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaKeys.privateKey, 256));
  const prk = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, prk, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, enc.encode('Content-Encoding: nonce\0'), 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cipher));
  return { rs, idLen, text: plain.slice(0, plain.lastIndexOf(2)) };
}

// El "navegador": una suscripcion de mentira.
const uaKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const p256dh = b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey)));
const authSecret = crypto.getRandomValues(new Uint8Array(16));
const auth = b64uEncode(authSecret);

// El sitio: un par VAPID, en el formato que usan las herramientas (publica de 65 bytes, privada de 32).
const vapidKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const vapidPublic = b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', vapidKeys.publicKey)));
const vapidPrivate = (await crypto.subtle.exportKey('jwk', vapidKeys.privateKey)).d;

console.log('→ Cifrado (RFC 8291)');
{
  const message = 'Tu pedido #1001 salió: ya va en camino. ñandú';
  const body = await encryptPayload(enc.encode(message), p256dh, auth);
  const { rs, idLen, text } = await decrypt(body, uaKeys, authSecret);
  check('el navegador recupera el mensaje tal cual (con acentos)', dec.decode(text) === message);
  check('el registro mide 4096 y la clave efimera 65 bytes', rs === 4096 && idLen === 65);
  const other = await encryptPayload(enc.encode(message), p256dh, auth);
  check('dos cifrados del mismo mensaje no se parecen (clave y sal nuevas cada vez)', b64uEncode(body) !== b64uEncode(other));
  let rejected = false;
  try { await encryptPayload(enc.encode('x'), p256dh, b64uEncode(new Uint8Array(8))); } catch { rejected = true; }
  check('un auth que no mide 16 bytes se rechaza', rejected);
  const tampered = body.slice(); tampered[tampered.length - 1] ^= 1;
  let failedDecrypt = false;
  try { await decrypt(tampered, uaKeys, authSecret); } catch { failedDecrypt = true; }
  check('un cuerpo alterado no se descifra', failedDecrypt);
}

console.log('→ Firma VAPID (RFC 8292)');
{
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', 'mailto:equipo@xautohubrd.com', vapidPublic, vapidPrivate, 1_800_000_000);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
  check('el encabezado tiene la forma "vapid t=<jwt>, k=<clave>"', !!m);
  if (m) {
    const [, h, c, s, k] = m;
    const claims = JSON.parse(dec.decode(b64uDecode(c)));
    check('la audiencia es el origen del servicio de push, sin la ruta', claims.aud === 'https://fcm.googleapis.com');
    check('vence en 12 horas y lleva el contacto', claims.exp === 1_800_000_000 + 43200 && claims.sub === 'mailto:equipo@xautohubrd.com');
    check('la cabecera del JWT es ES256', JSON.parse(dec.decode(b64uDecode(h))).alg === 'ES256');
    check('k es la clave publica', k === vapidPublic);
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vapidKeys.publicKey, b64uDecode(s), enc.encode(`${h}.${c}`));
    check('la firma se verifica con la clave publica', valid);
    check('la firma es r||s de 64 bytes', b64uDecode(s).length === 64);
  }
}

console.log('→ Envio (contra un servidor local)');
{
  const seen = [];
  let nextStatus = 201;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (d) => chunks.push(d));
    req.on('end', () => {
      seen.push({ headers: req.headers, body: new Uint8Array(Buffer.concat(chunks)) });
      res.statusCode = nextStatus;
      res.end('x');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const endpoint = `http://127.0.0.1:${server.address().port}/push/abc`;
  const sub = { endpoint, p256dh, auth };
  const vapid = { subject: 'mailto:equipo@xautohubrd.com', publicKey: vapidPublic, privateKey: vapidPrivate };

  const ok = await sendPush(sub, JSON.stringify({ notification: { title: 'Pedido #1001' } }), vapid);
  check('un 201 es entregado', ok.ok && !ok.gone && ok.status === 201);
  const h = seen[0].headers;
  check('manda aes128gcm, TTL y el encabezado VAPID', h['content-encoding'] === 'aes128gcm' && h['ttl'] === '86400' && String(h['authorization']).startsWith('vapid t='));
  const { text } = await decrypt(seen[0].body, uaKeys, authSecret);
  check('lo que llega se descifra en el navegador', JSON.parse(dec.decode(text)).notification.title === 'Pedido #1001');

  nextStatus = 410;
  const gone = await sendPush(sub, '{}', vapid);
  check('un 410 marca la suscripcion como caida', !gone.ok && gone.gone);
  nextStatus = 404;
  check('un 404 tambien', (await sendPush(sub, '{}', vapid)).gone);
  nextStatus = 500;
  const bad = await sendPush(sub, '{}', vapid);
  check('un 500 es un fallo, pero la suscripcion no se da por caida', !bad.ok && !bad.gone);
  server.close();
}

console.log(failed === 0 ? '\n✓ Web Push en verde.' : `\n✗ ${failed} problema(s).`);
process.exit(failed === 0 ? 0 : 1);
