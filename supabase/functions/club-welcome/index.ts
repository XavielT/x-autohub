// =============================================================================
// club-welcome — el correo de bienvenida del Club X AutoHub
// =============================================================================
//
// Corre en el Edge Runtime de Supabase (Deno), no en la app. Se despliega
// aparte y **no** se compila con el resto del proyecto: los dos `tsconfig`
// solo miran `src/`, asi que el `Deno` de aqui no le molesta a `ng build`.
//
// Que hace: recibe `{ email }`, comprueba que ese correo se acaba de suscribir
// de verdad, y le manda un correo por Resend. Responde SIEMPRE con
// `{ sent: boolean }` para que el cliente sepa si puede prometer el correo o no
// (ver `email-subscription.service.ts`).
//
// Por que sin dependencias, solo `fetch`: esta funcion no se puede probar ni
// desplegar desde el entorno de desarrollo de este repo (no hay CLI de Supabase
// ni Deno instalados), asi que cada `import` remoto seria una forma mas de
// fallar en el primer despliegue y sin manera de verlo antes. Una consulta a
// PostgREST y un POST a Resend no justifican traerse el cliente entero.
//
// Secretos que espera (`supabase secrets set` — ver docs/BACKEND.md):
//
//   RESEND_API_KEY   obligatorio para enviar. Sin el, la funcion responde
//                    `{ sent: false, reason: 'not-configured' }` y no falla:
//                    la suscripcion ya quedo guardada y el sitio solo cambia
//                    lo que promete.
//   CLUB_FROM_EMAIL  remitente, p. ej. `X AutoHub <club@xautohubrd.com>`.
//                    El dominio tiene que estar verificado en Resend.
//   CLUB_SITE_URL    opcional, para el enlace del correo.
//
// `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta el propio runtime;
// no hay que darlos de alta.

/** Ventana en la que un correo se considera recien suscrito. */
const FRESH_WINDOW_MINUTES = 10;

const DEFAULT_SITE_URL = 'https://xautohubrd.com';

// El origen va abierto porque no es lo que protege esta funcion: eso lo hace
// `verify_jwt` (hay que llamarla con una clave del proyecto) mas la
// comprobacion de que el correo este recien suscrito. Un `Origin` lo escribe
// quien quiera; filtrarlo daria una sensacion de seguridad que no existe.
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Reason =
  | 'not-configured'
  | 'invalid-email'
  | 'method-not-allowed'
  | 'not-subscribed'
  | 'stale'
  | 'send-failed'
  | 'lookup-failed'
  | 'unexpected';

function answer(status: number, sent: boolean, reason?: Reason): Response {
  return new Response(JSON.stringify(reason ? { sent, reason } : { sent }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function isValidEmail(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

/**
 * El cuerpo del correo. Mismo fondo, mismo amarillo y misma promesa que la
 * seccion "Unete al club" del home — quien se suscribe ahi tiene que reconocer
 * de donde salio esto.
 *
 * Todo va en linea y con tablas: los clientes de correo no cargan hojas de
 * estilo externas y varios ignoran flexbox y grid.
 */
function welcomeHtml(siteUrl: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bienvenido al Club X AutoHub</title>
  </head>
  <body style="margin:0;padding:0;background-color:#121212;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#121212;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#1a1a1a;border:1px solid #2e2e2e;border-radius:16px;">
            <tr>
              <td style="padding:36px 32px 8px 32px;">
                <p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#ffb300;">
                  Club X AutoHub
                </p>
                <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:1.2;color:#ffffff;">
                  Bienvenido al <span style="color:#ffb300;">Club</span> X AutoHub
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 8px 32px;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#e6e6e6;">
                  Ya eres parte de la comunidad motorizada mas grande de RD. De aqui en adelante
                  recibes alertas de productos de tu interes, ofertas en piezas y acceso a
                  eventos exclusivos.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <a href="${siteUrl}" style="display:inline-block;background-color:#ffb300;color:#121212;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;padding:13px 24px;border-radius:8px;">
                  Entrar a X AutoHub
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 32px 32px;border-top:1px solid #2a2a2a;">
                <p style="margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#929090;">
                  Te escribimos porque registraste este correo en X AutoHub. Si no quieres seguir
                  recibiendo estos mensajes, responde a este correo con la palabra
                  <strong style="color:#b8b8b8;">BAJA</strong> y te sacamos de la lista.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Version en texto plano. Sin esto el correo puntua peor en los filtros. */
function welcomeText(siteUrl: string): string {
  return [
    'Bienvenido al Club X AutoHub',
    '',
    'Ya eres parte de la comunidad motorizada mas grande de RD. De aqui en adelante',
    'recibes alertas de productos de tu interes, ofertas en piezas y acceso a',
    'eventos exclusivos.',
    '',
    `Entrar a X AutoHub: ${siteUrl}`,
    '',
    'Te escribimos porque registraste este correo en X AutoHub. Si no quieres seguir',
    'recibiendo estos mensajes, responde a este correo con la palabra BAJA y te',
    'sacamos de la lista.',
  ].join('\n');
}

/**
 * Comprueba que el correo este en `club_subscriptions` y que la fila sea
 * reciente.
 *
 * Es lo que evita que la funcion sea un relay abierto: aunque alguien consiga
 * llamarla con la clave anon (que es publica, va en el bundle del sitio), solo
 * puede provocar el envio a una direccion que **acaba** de darse de alta, o
 * sea la que el propio flujo ya iba a mandar. Ni correos a terceros, ni
 * reenvios en bucle a un suscriptor viejo.
 *
 * Va con la clave `service_role` porque `club_subscriptions` no tiene politica
 * de select para `anon` a proposito (migracion 0002): la lista de correos no se
 * puede leer desde el navegador.
 */
async function isFreshSubscriber(
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string,
): Promise<{ ok: true } | { ok: false; reason: Reason }> {
  const since = new Date(Date.now() - FRESH_WINDOW_MINUTES * 60_000).toISOString();
  const query =
    `${supabaseUrl}/rest/v1/club_subscriptions` +
    `?select=email&email=eq.${encodeURIComponent(email)}` +
    `&created_at=gte.${encodeURIComponent(since)}&limit=1`;

  const res = await fetch(query, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!res.ok) {
    console.error('[club-welcome] no se pudo consultar club_subscriptions', res.status, await res.text());
    return { ok: false, reason: 'lookup-failed' };
  }

  const rows = (await res.json()) as unknown[];
  if (!Array.isArray(rows) || rows.length === 0) {
    // Puede ser abuso, o un suscriptor de hace tiempo pidiendo el correo otra
    // vez. Las dos cosas se rechazan igual; no se distingue a proposito, para
    // no confirmarle a nadie si una direccion esta o no en la lista.
    return { ok: false, reason: 'not-subscribed' };
  }

  return { ok: true };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return answer(405, false, 'method-not-allowed');
  }

  try {
    const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null;

    if (!isValidEmail(email)) {
      return answer(400, false, 'invalid-email');
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('CLUB_FROM_EMAIL');
    const siteUrl = Deno.env.get('CLUB_SITE_URL') ?? DEFAULT_SITE_URL;

    // Sin configurar no es un error: es el estado normal hasta que Xaviel cree
    // la cuenta de Resend. La suscripcion ya esta guardada y el sitio dira
    // "Ya eres parte del club" en vez de prometer un correo.
    if (!resendKey || !from) {
      return answer(200, false, 'not-configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[club-welcome] falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno');
      return answer(500, false, 'unexpected');
    }

    const fresh = await isFreshSubscriber(supabaseUrl, serviceRoleKey, email);
    if (!fresh.ok) {
      return answer(fresh.reason === 'lookup-failed' ? 500 : 403, false, fresh.reason);
    }

    const send = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Bienvenido al Club X AutoHub',
        html: welcomeHtml(siteUrl),
        text: welcomeText(siteUrl),
      }),
    });

    if (!send.ok) {
      console.error('[club-welcome] Resend rechazo el envio', send.status, await send.text());
      return answer(502, false, 'send-failed');
    }

    return answer(200, true);
  } catch (error) {
    console.error('[club-welcome] fallo inesperado', error);
    return answer(500, false, 'unexpected');
  }
});
