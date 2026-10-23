// =============================================================================
// webpush.mjs — Web Push (RFC 8030 + 8291 + 8292) con solo WebCrypto y fetch
// =============================================================================
//
// Lo usa la funcion `send-push`, que corre en Deno (Edge Runtime de Supabase), pero
// no toca ninguna API de Deno: todo es WebCrypto, `fetch` y `TextEncoder`, que tambien
// existen en Node. Por eso `scripts/verify-webpush.mjs` lo prueba aqui, sin desplegar
// nada, y por eso no se trae `web-push` de npm: esta funcion no se puede probar contra
// el Edge Runtime desde este repo (no hay CLI de Supabase ni Deno), y cada import
// remoto seria una forma mas de fallar en el primer despliegue. Ver la nota de
// `club-welcome`.
//
// Que hace Web Push, en corto:
//   1. El navegador le da al sitio una suscripcion: un `endpoint` (la URL del servicio
//      de push de Google, Mozilla o Apple) y dos claves (`p256dh` y `auth`).
//   2. Para avisar, el servidor cifra el mensaje con esas claves (aes128gcm) y lo manda
//      por POST al `endpoint`, firmando la peticion con su clave VAPID (un JWT ES256)
//      para que el servicio de push sepa de quien viene.
//   3. El servicio de push lo entrega al navegador, que lo descifra y lo muestra.

const encoder = new TextEncoder();

/** Bytes → base64url, sin relleno (el formato de todas las claves de Web Push). */
export function b64uEncode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url → bytes. Acepta con o sin relleno. */
export function b64uDecode(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

/**
 * Cifra `payload` (bytes) para una suscripcion, en el formato `aes128gcm` de RFC 8291.
 *
 * `p256dh` y `auth` vienen de la suscripcion, en base64url. `options.keyPair` y
 * `options.salt` existen solo para las pruebas (una clave efimera y una sal fijas);
 * en uso real se generan nuevas en cada mensaje, que es lo que exige el protocolo.
 *
 * El cuerpo que devuelve es un solo registro: sal (16) + tamano de registro (4) +
 * largo de la clave (1) + clave publica efimera (65) + texto cifrado. Con un registro de
 * 4096 caben ~4 KB de mensaje; un aviso de pedido ocupa menos de 400 bytes.
 */
export async function encryptPayload(payload, p256dh, auth, options = {}) {
  const uaPublic = b64uDecode(p256dh);
  const authSecret = b64uDecode(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('p256dh no es una clave P-256 sin comprimir');
  if (authSecret.length !== 16) throw new Error('auth tiene que medir 16 bytes');

  const asKeys =
    options.keyPair ??
    (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  // RFC 8291 §3.4: la clave intermedia mezcla el secreto compartido con el `auth` de
  // la suscripcion y con las dos claves publicas.
  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic);
  const prk = await hkdf(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, prk, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, encoder.encode('Content-Encoding: nonce\0'), 12);

  // Un solo registro y es el ultimo: el delimitador es 0x02.
  const record = concat(payload, new Uint8Array([2]));
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record));

  const header = concat(salt, new Uint8Array([0, 0, 0x10, 0]), new Uint8Array([asPublic.length]), asPublic);
  return concat(header, cipher);
}

/**
 * El encabezado `Authorization` VAPID (RFC 8292): un JWT ES256 con el origen del
 * servicio de push como audiencia, firmado con la clave privada del sitio.
 *
 * `publicKey` es la clave publica (65 bytes, base64url) y `privateKey` el escalar
 * privado (32 bytes, base64url): el formato que sacan las herramientas de VAPID.
 */
export async function vapidAuthorization(endpoint, subject, publicKey, privateKey, nowSeconds = Math.floor(Date.now() / 1000)) {
  const pub = b64uDecode(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('La clave publica VAPID no es valida');

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: b64uEncode(pub.slice(1, 33)),
    y: b64uEncode(pub.slice(33, 65)),
    d: privateKey,
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const claims = {
    aud: new URL(endpoint).origin,
    // Doce horas: el maximo que acepta el servicio de push es 24.
    exp: nowSeconds + 12 * 60 * 60,
    sub: subject,
  };
  const unsigned = `${b64uEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))}.${b64uEncode(
    encoder.encode(JSON.stringify(claims)),
  )}`;
  // WebCrypto firma ECDSA en formato crudo r||s, que es lo que pide JWT.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(unsigned)),
  );

  return `vapid t=${unsigned}.${b64uEncode(signature)}, k=${publicKey}`;
}

/**
 * Manda un aviso a una suscripcion.
 *
 * Devuelve `{ ok, gone, status }`. `gone` es true cuando el servicio de push dice que la
 * suscripcion ya no existe (404 o 410: el usuario desinstalo la app o quito el permiso):
 * quien llama la borra y no vuelve a intentarlo.
 */
export async function sendPush(subscription, payload, vapid, options = {}) {
  const body = await encryptPayload(
    typeof payload === 'string' ? encoder.encode(payload) : payload,
    subscription.p256dh,
    subscription.auth,
  );
  const authorization = await vapidAuthorization(subscription.endpoint, vapid.subject, vapid.publicKey, vapid.privateKey);

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      // Cuanto tiempo guarda el servicio de push el aviso si el telefono esta apagado.
      TTL: String(options.ttl ?? 86400),
      Urgency: options.urgency ?? 'normal',
    },
    body,
  });

  // Se lee y se descarta el cuerpo: en Deno, dejarlo sin consumir deja la conexion colgada.
  await res.text().catch(() => '');
  return { ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410, status: res.status };
}
