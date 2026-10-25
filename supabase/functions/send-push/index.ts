// =============================================================================
// send-push — avisar al cliente que su pedido o su cita cambió, al vendedor que su publicación vence, o a los admins que falló un despliegue
// =============================================================================
//
// Corre en el Edge Runtime de Supabase (Deno), no en la app. Se despliega aparte y
// **no** se compila con el resto del proyecto (los dos `tsconfig` solo miran `src/`).
//
// Que hace: recibe `{ kind: 'order' | 'appointment' | 'listing', id }` o `{ kind: 'deploy' }`, comprueba quien llama,
// lee el pedido, la cita, la publicacion o el ultimo despliegue, arma el aviso segun su estado actual y lo
// manda a todos los dispositivos del dueño (o, en un despliegue fallido, de los admins) (`push_subscriptions`). Un pedido
// de invitado no tiene dueño: avisa a los dispositivos que se suscribieron a **ese pedido** (`order_push_subscriptions`).
//
// La llama la base: el trigger `notify_status_change()` (migracion 0028) hace el POST con
// pg_net cuando cambia el estado de un pedido o de una cita, y `warn_expiring_publications()`
// (migracion 0031, una vez al dia) cuando a una publicacion de Hub Market le quedan siete dias, y `check_deploy_failures()`
// (migracion 0032, cada 10 minutos) para mirar el ultimo despliegue, todos con la cabecera `x-push-secret`. Tambien la acepta un admin con su sesion (el camino de antes, que
// ya no usa el panel). Responde `{ sent, removed }` o `{ sent: 0, reason }`: nunca falla de
// forma que le importe a quien llama, porque el estado ya cambio y un aviso que no sale no
// es motivo para decir que el cambio fallo.
//
// **Quien llama no dice que se avisa.** Solo dice cual pedido o cual cita; el texto, el
// destinatario y el enlace salen de la base y de esta funcion. Por eso tampoco puede
// usarse para escribirle a un tercero lo que sea, aunque alguien tuviera la sesion de un admin
// o el secreto.
//
// Secretos que espera (`supabase secrets set` — ver docs/BACKEND.md):
//
//   VAPID_PUBLIC_KEY    la clave publica (base64url, 65 bytes). Es la misma que va en
//                       `environment.vapidPublicKey` del frontend.
//   VAPID_PRIVATE_KEY   la clave privada (base64url, 32 bytes). SOLO aqui.
//   VAPID_SUBJECT       un contacto: `mailto:equipo@xautohubrd.com`.
//   PUSH_WEBHOOK_SECRET el secreto que manda el trigger de la base en `x-push-secret` (el mismo
//                       valor que `send_push_secret` en el Vault). Sin el, solo entra un admin.
//   SITE_URL            opcional. Base de los enlaces y de los iconos.
//   VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID
//                       los mismos de `build-status`. Solo hacen falta para `deploy`; sin ellos ese aviso no sale.
//
// `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta el runtime.
//
// Depende de las migraciones **0024** (`push_subscriptions`), **0028** (el trigger que la llama) **0031** (el aviso de vencimiento), **0032** (el de despliegue fallido) y **0034** (los avisos de un pedido de invitado). La criptografia de Web Push esta
// en `webpush.mjs`, que se prueba aparte con `node scripts/verify-webpush.mjs`.

import { sendPush } from './webpush.mjs';

const DEFAULT_SITE_URL = 'https://xautohubrd.com';
const TIME_ZONE = 'America/Santo_Domingo';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Reason =
  | 'not-configured'
  | 'method-not-allowed'
  | 'bad-request'
  | 'forbidden'
  | 'not-found'
  | 'guest'
  | 'no-message'
  | 'no-devices'
  | 'unexpected';

function answer(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

const refuse = (status: number, reason: Reason) => answer(status, { sent: 0, reason });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo que se le dice al cliente en cada estado de un pedido. Los que faltan no avisan. */
const ORDER_MESSAGES: Record<string, string> = {
  paid: 'Recibimos tu pago. Ya vamos a preparar tu pedido.',
  preparing: 'Estamos preparando tu pedido.',
  shipped: 'Tu pedido salió y va en camino.',
  ready_for_pickup: 'Tu pedido está listo: pásalo a retirar por el taller.',
  delivered: '¡Entregado! Gracias por tu compra.',
  cancelled: 'Tu pedido fue cancelado. Abre el pedido para ver el detalle.',
};

const APPOINTMENT_MESSAGES: Record<string, (when: string) => string> = {
  confirmed: (when) => `Tu cita está confirmada: ${when}.`,
  in_progress: () => 'Ya estamos trabajando en tu vehículo.',
  done: () => 'Tu servicio quedó listo. ¡Gracias!',
  cancelled: () => 'Tu cita fue cancelada.',
};

interface Notice {
  userId: string | null;
  /** Si es true, el aviso va a todos los admins y `userId` no se usa. */
  admins?: boolean;
  title: string;
  body: string;
  /** Ruta dentro del sitio a la que lleva tocar el aviso. */
  path: string;
  /** Agrupa avisos: uno nuevo con la misma etiqueta reemplaza al anterior. Por defecto, la ruta. */
  tag?: string;
  /** Un pedido de invitado: los dispositivos salen de `order_push_subscriptions` y no de una cuenta. */
  guestOrderId?: string;
  /** El estado ya no va a cambiar (entregado, cancelado): tras avisar se borran los dispositivos del pedido. */
  final?: boolean;
}

/** Los estados de un pedido que no cambian más. */
const FINAL_ORDER_STATUSES = ['delivered', 'cancelled'];

/** Cuantos dias antes de vencer se avisa. Es el mismo `RENEW_WARNING_DAYS` del frontend y la ventana de la migracion 0031. */
const LISTING_WARNING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** El estado de un despliegue de Vercel que termino mal. */
const FAILED_DEPLOYMENT = 'ERROR';

async function rest<T>(supabaseUrl: string, key: string, path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    console.error('[send-push] fallo una consulta', path, res.status, await res.text());
    return null;
  }
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}

/** Compara dos textos sin cortarse en el primer caracter distinto (no filtra cuanto acerto quien adivina). */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** ¿Quien llama es admin? Se le pregunta a la base con **su** sesion, no con la del servicio. */
async function callerIsAdmin(supabaseUrl: string, anonKey: string, authorization: string): Promise<boolean> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: authorization, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) return false;
  return (await res.json()) === true;
}

async function orderNotice(supabaseUrl: string, serviceKey: string, id: string): Promise<Notice | 'not-found' | 'no-message'> {
  const rows = await rest<{ order_number: number; status: string; user_id: string | null }[]>(
    supabaseUrl,
    serviceKey,
    `orders?select=order_number,status,user_id&id=eq.${id}&limit=1`,
  );
  const order = rows?.[0];
  if (!order) return 'not-found';

  const body = ORDER_MESSAGES[order.status];
  if (!body) return 'no-message';
  return {
    userId: order.user_id,
    // Sin dueño, el aviso va a quien activó los avisos de este pedido desde /pedido/:id.
    guestOrderId: order.user_id ? undefined : id,
    final: FINAL_ORDER_STATUSES.includes(order.status),
    title: `Pedido #${order.order_number}`,
    body,
    path: `/pedido/${id}`,
  };
}

async function appointmentNotice(supabaseUrl: string, serviceKey: string, id: string): Promise<Notice | 'not-found' | 'no-message'> {
  const rows = await rest<{ appointment_number: number; status: string; user_id: string | null; scheduled_at: string }[]>(
    supabaseUrl,
    serviceKey,
    `service_appointments?select=appointment_number,status,user_id,scheduled_at&id=eq.${id}&limit=1`,
  );
  const appointment = rows?.[0];
  if (!appointment) return 'not-found';

  const message = APPOINTMENT_MESSAGES[appointment.status];
  if (!message) return 'no-message';

  // La hora en hora de Santo Domingo: es la del taller, no la del servidor.
  const when = new Date(appointment.scheduled_at).toLocaleString('es-DO', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
  return { userId: appointment.user_id, title: `Cita #${appointment.appointment_number}`, body: message(when), path: '/perfil' };
}

/**
 * El aviso de una publicacion de Hub Market que esta por vencer. Solo avisa si de verdad esta a la
 * venta, aprobada, con vendedor y dentro de la ventana: aunque alguien llamara con el secreto, no
 * se le puede escribir a un vendedor por una publicacion que no esta por vencer.
 */
async function listingNotice(supabaseUrl: string, serviceKey: string, id: number): Promise<Notice | 'not-found' | 'no-message'> {
  const rows = await rest<
    { title: string; seller_id: string | null; expires_at: string; status: string; is_active: boolean; is_test: boolean; sold_at: string | null }[]
  >(
    supabaseUrl,
    serviceKey,
    `hub_market_items?select=title,seller_id,expires_at,status,is_active,is_test,sold_at&id=eq.${id}&limit=1`,
  );
  const item = rows?.[0];
  if (!item) return 'not-found';

  const left = new Date(item.expires_at).getTime() - Date.now();
  if (!item.is_active || item.is_test || item.status !== 'aprobado' || item.sold_at || left <= 0 || left > LISTING_WARNING_DAYS * DAY_MS) {
    return 'no-message';
  }

  const days = Math.floor(left / DAY_MS);
  const when = days === 0 ? 'vence hoy' : days === 1 ? 'vence mañana' : `vence en ${days} días`;
  return {
    userId: item.seller_id,
    title: 'Tu publicación está por vencer',
    body: `"${item.title}" ${when}. Renuévala desde tu perfil para que siga en Hub Market.`,
    path: '/perfil',
    tag: `/perfil#publicacion-${id}`,
  };
}

/**
 * El aviso de un despliegue de produccion que fallo. Mira el **ultimo** despliegue en Vercel: si termino en
 * error y todavia no se avisó de el, deja anotado su id (antes de mandar, para que dos llamadas seguidas no
 * dupliquen) y avisa a los admins. Si hay uno posterior que salio bien, no hay nada que avisar.
 */
async function deployNotice(supabaseUrl: string, serviceKey: string): Promise<Notice | 'no-message'> {
  const token = Deno.env.get('VERCEL_TOKEN');
  const projectId = Deno.env.get('VERCEL_PROJECT_ID');
  if (!token || !projectId) return 'no-message';

  const params = new URLSearchParams({ projectId, target: 'production', limit: '1' });
  const teamId = Deno.env.get('VERCEL_TEAM_ID');
  if (teamId) params.set('teamId', teamId);

  const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error('[send-push] Vercel respondio', res.status);
    return 'no-message';
  }
  const data = (await res.json()) as { deployments?: { uid?: string; state?: string; readyState?: string; meta?: { githubCommitMessage?: string } }[] };
  const latest = data.deployments?.[0];
  if (!latest?.uid || (latest.readyState ?? latest.state ?? '').toUpperCase() !== FAILED_DEPLOYMENT) return 'no-message';

  const already = await rest<{ deployment_id: string }[]>(
    supabaseUrl,
    serviceKey,
    `deploy_alerts?select=deployment_id&deployment_id=eq.${encodeURIComponent(latest.uid)}&limit=1`,
  );
  // Si no se pudo leer la tabla no se avisa: mejor un aviso de menos que uno cada 10 minutos.
  if (!already || already.length > 0) return 'no-message';

  // `return=representation` y no `minimal`: `rest()` lee el cuerpo, y un 201 vacio lo haria fallar. Si otra llamada
  // anoto el mismo despliegue un instante antes (409), no se avisa dos veces.
  const saved = await rest<{ deployment_id: string }[]>(supabaseUrl, serviceKey, 'deploy_alerts', {
    method: 'POST',
    body: JSON.stringify({ deployment_id: latest.uid }),
    headers: { Prefer: 'return=representation' },
  });
  if (!saved || saved.length === 0) return 'no-message';

  const message = (latest.meta?.githubCommitMessage ?? '').split('\n')[0].slice(0, 100);
  return {
    userId: null,
    admins: true,
    title: 'Falló el despliegue del sitio',
    body: `El sitio sigue con la versión anterior.${message ? ` Cambio: ${message}` : ''} Abre el panel para ver el detalle.`,
    path: '/admin',
    tag: 'deploy-failed',
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return refuse(405, 'method-not-allowed');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!supabaseUrl || !anonKey || !serviceKey || !publicKey || !privateKey || !subject) {
    // Sin las claves la funcion no avisa, y tampoco falla: el panel sigue funcionando.
    return refuse(200, 'not-configured');
  }
  const siteUrl = (Deno.env.get('SITE_URL') || DEFAULT_SITE_URL).replace(/\/+$/, '');

  // O la base (con el secreto compartido) o un admin con su sesion. Un secreto vacio o sin
  // configurar no abre nada: si no hay `PUSH_WEBHOOK_SECRET`, solo queda el camino del admin.
  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '';
  const sentSecret = req.headers.get('x-push-secret') ?? '';
  const fromDatabase = webhookSecret !== '' && sameSecret(sentSecret, webhookSecret);
  if (!fromDatabase) {
    const authorization = req.headers.get('Authorization') ?? '';
    if (!authorization || !(await callerIsAdmin(supabaseUrl, anonKey, authorization))) {
      return refuse(403, 'forbidden');
    }
  }

  let input: { kind?: unknown; id?: unknown };
  try {
    input = await req.json();
  } catch {
    return refuse(400, 'bad-request');
  }
  // Pedidos y citas se identifican con un uuid; las publicaciones, con un entero; un despliegue no lleva id.
  const isListing = input.kind === 'listing';
  const isDeploy = input.kind === 'deploy';
  const idIsValid = isDeploy
    ? true
    : isListing
      ? typeof input.id === 'number' && Number.isSafeInteger(input.id) && input.id > 0
      : typeof input.id === 'string' && UUID.test(input.id);
  if ((input.kind !== 'order' && input.kind !== 'appointment' && !isListing && !isDeploy) || !idIsValid) {
    return refuse(400, 'bad-request');
  }

  try {
    const notice = isDeploy
      ? await deployNotice(supabaseUrl, serviceKey)
      : isListing
        ? await listingNotice(supabaseUrl, serviceKey, input.id as number)
        : input.kind === 'order'
          ? await orderNotice(supabaseUrl, serviceKey, input.id as string)
          : await appointmentNotice(supabaseUrl, serviceKey, input.id as string);
    if (notice === 'not-found') return refuse(404, 'not-found');
    if (notice === 'no-message') return refuse(200, 'no-message');
    // Una cita de invitado, o un pedido sin dueño y sin dispositivos, no tiene a quien avisar.
    if (!notice.admins && !notice.userId && !notice.guestOrderId) return refuse(200, 'guest');

    // El dueño, todos los admins, o los dispositivos de un pedido de invitado.
    let source = '';
    if (notice.guestOrderId) {
      source = `order_push_subscriptions?select=id,endpoint,p256dh,auth&order_id=eq.${notice.guestOrderId}`;
    } else {
      let owners = notice.userId ? `eq.${notice.userId}` : '';
      if (notice.admins) {
        const admins = await rest<{ id: string }[]>(supabaseUrl, serviceKey, 'profiles?select=id&role=eq.admin');
        if (!admins || admins.length === 0) return refuse(200, 'no-devices');
        owners = `in.(${admins.map((a) => a.id).join(',')})`;
      }
      source = `push_subscriptions?select=id,endpoint,p256dh,auth&user_id=${owners}`;
    }
    const devices = await rest<{ id: number; endpoint: string; p256dh: string; auth: string }[]>(supabaseUrl, serviceKey, source);
    if (!devices || devices.length === 0) return refuse(200, 'no-devices');

    // El formato que entiende el service worker de Angular: lo muestra y, al tocarlo,
    // abre (o enfoca) la ruta de `data.onActionClick.default`.
    const url = `${siteUrl}${notice.path}`;
    const payload = JSON.stringify({
      notification: {
        title: notice.title,
        body: notice.body,
        icon: `${siteUrl}/icon-192.png`,
        badge: `${siteUrl}/icon-32.png`,
        tag: notice.tag ?? notice.path,
        data: { url, onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url } } },
      },
    });

    const vapid = { subject, publicKey, privateKey };
    const gone: number[] = [];
    let sent = 0;

    await Promise.all(
      devices.map(async (device) => {
        try {
          const result = await sendPush(device, payload, vapid);
          if (result.ok) sent++;
          else if (result.gone) gone.push(device.id);
          else console.error('[send-push] el servicio de push respondio', result.status);
        } catch (error) {
          console.error('[send-push] no se pudo mandar a un dispositivo', error);
        }
      }),
    );

    // Un dispositivo que ya no existe no se vuelve a intentar.
    const table = notice.guestOrderId ? 'order_push_subscriptions' : 'push_subscriptions';
    if (gone.length > 0) {
      await rest(supabaseUrl, serviceKey, `${table}?id=in.(${gone.join(',')})`, { method: 'DELETE' });
    }
    // Un pedido de invitado que terminó no va a cambiar más: sus dispositivos ya no sirven.
    if (notice.guestOrderId && notice.final) {
      await rest(supabaseUrl, serviceKey, `order_push_subscriptions?order_id=eq.${notice.guestOrderId}`, { method: 'DELETE' });
    }

    return answer(200, { sent, removed: gone.length });
  } catch (error) {
    console.error('[send-push] error inesperado', error);
    return refuse(200, 'unexpected');
  }
});
