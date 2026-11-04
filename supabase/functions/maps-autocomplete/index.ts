// =============================================================================
// maps-autocomplete — sugerencias de dirección (Places API New, solo RD)
// =============================================================================
//
// Pública (el checkout la usan visitantes sin sesión): límite por IP, mínimo 3 letras, caché de un día por consulta, y el gasto de Google va a `ai_usage` con la feature
// `maps_autocomplete` contra `maps_monthly_cap_usd`. La clave de Google es de SERVIDOR (`GOOGLE_MAPS_API_KEY`): ninguna clave en el navegador. Cualquier fallo responde
// `ia_no_disponible` y el formulario sigue a mano. `session_token` agrupa las teclas de una misma búsqueda (lo exige la facturación de Places).

import { cacheGet, cacheSet, gate, sha256 } from '../_shared/ai.ts';
import { readEnv } from '../_shared/db.ts';
import { anonGuard, corsHeaders, readJson, refuse, reply, unavailableReply } from '../_shared/guard.ts';
import { normText, placesAutocomplete, type Suggestion } from '../_shared/maps.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return refuse(req, 405, 'method-not-allowed');
  const env = readEnv();
  if (!env) return unavailableReply(req);

  const guard = await anonGuard(env, req, 'maps-autocomplete', 60, 40);
  if (!guard.ok) return refuse(req, 429, 'demasiadas_busquedas');

  const body = await readJson(req, 1000);
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  if (query.length < 3 || query.length > 100) return refuse(req, 400, 'bad-request');
  const token = typeof body?.session_token === 'string' && UUID.test(body.session_token) ? body.session_token : null;

  const key = `maps-ac:${(await sha256(normText(query))).slice(0, 40)}`;
  const cached = await cacheGet<Suggestion[]>(env, key);
  if (cached) return reply(req, 200, { ok: true, data: { suggestions: cached } });

  const g = await gate(env, 'address', 'maps');
  if (!g.ok) return unavailableReply(req);

  const suggestions = await placesAutocomplete(env, query, token);
  if (!suggestions) return unavailableReply(req);
  if (suggestions.length > 0) await cacheSet(env, key, suggestions, 24 * 3600);
  return reply(req, 200, { ok: true, data: { suggestions } });
});
