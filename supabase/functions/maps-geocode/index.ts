// =============================================================================
// maps-geocode — de una dirección o un place_id a coordenadas, y a la inversa
// =============================================================================
//
// Pública (checkout, /publicar de Hub Market y el panel): límite por IP, caché de 30 días y gasto a `ai_usage` con feature `maps_geocode`. Entrada, una de tres:
//   { place_id }          lo que el visitante eligió en el autocompletar
//   { address }           una dirección escrita (se busca solo en RD)
//   { lat, lng }          geocodificación inversa (al soltar el pin del mapa de Hub Market): devuelve municipio y sector en texto
// Si lo encontrado cae fuera de RD responde `in_do: false` y el cliente muestra un mensaje amable. Clave de SERVIDOR; nada de claves en el navegador.

import { cacheGet, cacheSet, gate, sha256 } from '../_shared/ai.ts';
import { readEnv } from '../_shared/db.ts';
import { anonGuard, corsHeaders, readJson, refuse, reply, unavailableReply } from '../_shared/guard.ts';
import { geocode, normText, type GeoResult } from '../_shared/maps.ts';

const TTL = 30 * 24 * 3600;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return refuse(req, 405, 'method-not-allowed');
  const env = readEnv();
  if (!env) return unavailableReply(req);

  const guard = await anonGuard(env, req, 'maps-geocode', 60, 20);
  if (!guard.ok) return refuse(req, 429, 'demasiadas_busquedas');

  const body = await readJson(req, 1000);
  const placeId = typeof body?.place_id === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(body.place_id) ? body.place_id : undefined;
  const address = typeof body?.address === 'string' && body.address.trim().length >= 3 && body.address.length <= 200 ? body.address.trim() : undefined;
  const lat = typeof body?.lat === 'number' && body.lat >= -90 && body.lat <= 90 ? body.lat : undefined;
  const lng = typeof body?.lng === 'number' && body.lng >= -180 && body.lng <= 180 ? body.lng : undefined;
  const reverse = lat !== undefined && lng !== undefined;
  if (!placeId && !address && !reverse) return refuse(req, 400, 'bad-request');

  // La clave de la caché: lo que se pide, normalizado. La inversa se redondea a ~100 m para que pines cercanos compartan resultado.
  const raw = placeId ? `p:${placeId}` : reverse ? `r:${lat!.toFixed(3)},${lng!.toFixed(3)}` : `a:${normText(address!)}`;
  const key = `maps-geo:${(await sha256(raw)).slice(0, 40)}`;
  const cached = await cacheGet<GeoResult>(env, key);
  if (cached) return reply(req, 200, { ok: true, data: cached });

  const g = await gate(env, 'address', 'maps');
  if (!g.ok) return unavailableReply(req);

  const result = await geocode(env, { placeId, address, lat, lng });
  if (!result) return reply(req, 200, { ok: true, data: { found: false } });
  await cacheSet(env, key, result, TTL);
  return reply(req, 200, { ok: true, data: result });
});
