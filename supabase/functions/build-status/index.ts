// =============================================================================
// build-status — cómo va el último despliegue de producción (para la barra de /admin)
// =============================================================================
//
// Corre en el Edge Runtime de Supabase (Deno), no en la app. Se despliega aparte y
// **no** se compila con el resto del proyecto (los dos `tsconfig` solo miran `src/`).
//
// Qué hace: le pregunta a la API de Vercel por el último despliegue de producción y
// devuelve su estado en un formato pequeño. La barra de `/admin` ("Publicar ahora") lo usa
// para decir si la publicación pedida terminó bien, sigue construyéndose o falló: hasta
// ahora solo sabía cuándo se *pidió* (migraciones 0026 y 0027).
//
// **Solo la llama un admin con su sesión.** Se le pregunta a la base (`is_admin()`) con **su**
// JWT, igual que `send-push`. El token de Vercel nunca sale de aquí: lo que devuelve es el
// estado, la hora y el mensaje del commit, nada que no se vea en el dashboard de Vercel.
//
// Responde `{ configured: false }` (200) si falta el token: la barra lo trata como "no
// disponible" y el panel sigue igual. Nunca falla de forma que le importe al panel.
//
// Secretos que espera (`supabase secrets set` — ver docs/BACKEND.md):
//
//   VERCEL_TOKEN        un token de Vercel (Account Settings → Tokens) con acceso al equipo
//                       del proyecto. Solo lectura de despliegues; no hace falta más.
//   VERCEL_PROJECT_ID   el id del proyecto (`prj_…`, está en `.vercel/project.json`).
//   VERCEL_TEAM_ID      el id del equipo (`team_…`), si el proyecto es de un equipo.
//
// `SUPABASE_URL` y `SUPABASE_ANON_KEY` los inyecta el runtime.
//
// Se prueba aparte con `node scripts/verify-build-status.mjs`.

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

/** Lo que entiende la interfaz. Cualquier estado de Vercel que no se conozca cae en `unknown`. */
type BuildState = 'queued' | 'building' | 'ready' | 'error' | 'canceled' | 'unknown';

interface VercelDeployment {
  uid?: string;
  state?: string;
  readyState?: string;
  created?: number;
  buildingAt?: number;
  ready?: number;
  inspectorUrl?: string;
  meta?: { githubCommitMessage?: string };
}

function answer(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Los estados de Vercel (`QUEUED`, `INITIALIZING`, `BUILDING`, `READY`, `ERROR`, `CANCELED`) → los nuestros. */
export function toBuildState(raw: string | undefined): BuildState {
  switch ((raw ?? '').toUpperCase()) {
    case 'QUEUED':
      return 'queued';
    case 'INITIALIZING':
    case 'BUILDING':
      return 'building';
    case 'READY':
      return 'ready';
    case 'ERROR':
      return 'error';
    case 'CANCELED':
      return 'canceled';
    default:
      return 'unknown';
  }
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

export function toBuild(deployment: VercelDeployment) {
  const inspector = deployment.inspectorUrl;
  return {
    state: toBuildState(deployment.readyState ?? deployment.state),
    createdAt: deployment.created ? new Date(deployment.created).toISOString() : null,
    readyAt: deployment.ready ? new Date(deployment.ready).toISOString() : null,
    // Una sola línea: el primer renglón del mensaje del commit, sin pasar de 140 caracteres.
    message: (deployment.meta?.githubCommitMessage ?? '').split('\n')[0].slice(0, 140),
    // Solo se devuelve un enlace al propio Vercel; nada más sale de aquí.
    inspectorUrl: typeof inspector === 'string' && inspector.startsWith('https://vercel.com/') ? inspector : null,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST' && req.method !== 'GET') return answer(405, { error: 'method-not-allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return answer(200, { configured: false });

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization || !(await callerIsAdmin(supabaseUrl, anonKey, authorization))) {
    return answer(403, { error: 'forbidden' });
  }

  const token = Deno.env.get('VERCEL_TOKEN');
  const projectId = Deno.env.get('VERCEL_PROJECT_ID');
  if (!token || !projectId) return answer(200, { configured: false });

  const params = new URLSearchParams({ projectId, target: 'production', limit: '1' });
  const teamId = Deno.env.get('VERCEL_TEAM_ID');
  if (teamId) params.set('teamId', teamId);

  try {
    const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.error('[build-status] Vercel respondio', res.status);
      return answer(200, { configured: true, available: false });
    }
    const data = (await res.json()) as { deployments?: VercelDeployment[] };
    const latest = data.deployments?.[0];
    if (!latest) return answer(200, { configured: true, available: false });

    return answer(200, { configured: true, available: true, build: toBuild(latest) });
  } catch (error) {
    console.error('[build-status] no se pudo leer Vercel', error);
    return answer(200, { configured: true, available: false });
  }
});
