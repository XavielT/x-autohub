// =============================================================================
// send-push — avisar al cliente que su pedido o su cita cambió de estado
// =============================================================================
//
// Corre en el Edge Runtime de Supabase (Deno), no en la app. Se despliega aparte y
// **no** se compila con el resto del proyecto (los dos `tsconfig` solo miran `src/`).
//
// Que hace: recibe `{ kind: 'order' | 'appointment', id }`, comprueba que quien llama
// es un admin, lee el pedido o la cita de la base, arma el aviso segun su estado
// actual y lo manda a todos los dispositivos del dueño (`push_subscriptions`).
//
// Lo llama el panel justo despues de `set_order_status()` / `set_appointment_status()`
// (ver `push.service.ts`). Responde `{ sent, removed }` o `{ sent: 0, reason }`: nunca
// falla de forma que le importe al panel, porque el estado ya cambio y un aviso que no
// sale no es motivo para decirle al equipo que el cambio fallo.
//
// **El navegador no dice que se avisa.** Solo dice cual pedido o cual cita; el texto, el
// destinatario y el enlace salen de la base y de esta funcion. Por eso tampoco puede
// usarse para escribirle a un tercero lo que sea, aunque alguien tuviera la sesion de un admin.
//
// Secretos que espera (`supabase secrets set` — ver docs/BACKEND.md):
//
//   VAPID_PUBLIC_KEY    la clave publica (base64url, 65 bytes). Es la misma que va en
//                       `environment.vapidPublicKey` del frontend.
//   VAPID_PRIVATE_KEY   la clave privada (base64url, 32 bytes). SOLO aqui.
//   VAPID_SUBJECT       un contacto: `mailto:equipo@xautohubrd.com`.
//   SITE_URL            opcional. Base de los enlaces y de los iconos.
//
// `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta el runtime.
//
// Depende de la migracion **0024** (`push_subscriptions`). La criptografia de Web Push esta
// en `webpush.mjs`, que se prueba aparte con `node scripts/verify-webpush.mjs`.

import { sendPush } from './webpush.mjs';

const DEFAULT_SITE_URL = 'https://xautohubrd.com';
const TIME_ZONE = 'America/Santo_Domingo';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  title: string;
  body: string;
  /** Ruta dentro del sitio a la que lleva tocar el aviso. */
  path: string;
}

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
  return { userId: order.user_id, title: `Pedido #${order.order_number}`, body, path: `/pedido/${id}` };
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

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization || !(await callerIsAdmin(supabaseUrl, anonKey, authorization))) {
    return refuse(403, 'forbidden');
  }

  let input: { kind?: unknown; id?: unknown };
  try {
    input = await req.json();
  } catch {
    return refuse(400, 'bad-request');
  }
  if ((input.kind !== 'order' && input.kind !== 'appointment') || typeof input.id !== 'string' || !UUID.test(input.id)) {
    return refuse(400, 'bad-request');
  }

  try {
    const notice =
      input.kind === 'order'
        ? await orderNotice(supabaseUrl, serviceKey, input.id)
        : await appointmentNotice(supabaseUrl, serviceKey, input.id);
    if (notice === 'not-found') return refuse(404, 'not-found');
    if (notice === 'no-message') return refuse(200, 'no-message');
    // Un pedido o una cita de invitado no tiene dueño: no hay a quien avisar.
    if (!notice.userId) return refuse(200, 'guest');

    const devices = await rest<{ id: number; endpoint: string; p256dh: string; auth: string }[]>(
      supabaseUrl,
      serviceKey,
      `push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${notice.userId}`,
    );
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
        tag: notice.path,
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
    if (gone.length > 0) {
      await rest(supabaseUrl, serviceKey, `push_subscriptions?id=in.(${gone.join(',')})`, { method: 'DELETE' });
    }

    return answer(200, { sent, removed: gone.length });
  } catch (error) {
    console.error('[send-push] error inesperado', error);
    return refuse(200, 'unexpected');
  }
});
