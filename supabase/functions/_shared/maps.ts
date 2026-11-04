// =============================================================================
// Google Maps, del lado del servidor
// =============================================================================
//
// Places API (New) para autocompletar y la API de Geocoding, siempre desde una Edge Function con la clave de SERVIDOR (`GOOGLE_MAPS_API_KEY`). Ninguna clave llega al
// navegador y la CSP no se toca. Región `do`, idioma `es`. Cada llamada se registra en `ai_usage` con feature `maps_*` contra el tope `maps_monthly_cap_usd`.
// La clave de navegador de SGC está restringida por referrer a su dominio y NO sirve aquí: esta es la de servidor.

import { MAPS_COST } from './prices.ts';
import { logUsage } from './ai.ts';
import type { Env } from './db.ts';

const TIMEOUT_MS = 8000;

/** Las 32 provincias, para validar lo que la IA diga de una dirección informal. */
export const PROVINCES = [
  'Azua', 'Bahoruco', 'Barahona', 'Dajabón', 'Distrito Nacional', 'Duarte', 'El Seibo', 'Elías Piña', 'Espaillat', 'Hato Mayor', 'Hermanas Mirabal', 'Independencia',
  'La Altagracia', 'La Romana', 'La Vega', 'María Trinidad Sánchez', 'Monseñor Nouel', 'Monte Cristi', 'Monte Plata', 'Pedernales', 'Peravia', 'Puerto Plata', 'Samaná',
  'San Cristóbal', 'San José de Ocoa', 'San Juan', 'San Pedro de Macorís', 'Sánchez Ramírez', 'Santiago', 'Santiago Rodríguez', 'Santo Domingo', 'Valverde',
] as const;

export const normText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const matchProvince = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const n = normText(value).replace(/^provincia /, '');
  return PROVINCES.find((p) => normText(p) === n) ?? null;
};

export const googleKey = (): string | null => Deno.env.get('GOOGLE_MAPS_API_KEY') || null;

export interface Suggestion {
  place_id: string;
  text: string;
}

export interface GeoResult {
  lat: number;
  lng: number;
  place_id: string;
  formatted: string;
  province: string | null;
  municipality: string | null;
  sector: string | null;
  /** ¿Está en República Dominicana? */
  in_do: boolean;
  /** Qué tan exacto es: ROOFTOP/RANGE_INTERPOLATED = alta, GEOMETRIC_CENTER = media, APPROXIMATE = baja. */
  confidence: 'alta' | 'media' | 'baja';
}

async function timed(url: string, init: RequestInit): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Sugerencias de Places (New), solo de RD. `null` si Google no responde bien (el formulario sigue a mano). */
export async function placesAutocomplete(env: Env, input: string, sessionToken: string | null): Promise<Suggestion[] | null> {
  const key = googleKey();
  if (!key) return null;
  const res = await timed('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text' },
    body: JSON.stringify({ input, includedRegionCodes: ['do'], languageCode: 'es', ...(sessionToken ? { sessionToken } : {}) }),
  });
  await logUsage(env, { feature: 'maps_autocomplete', model: 'google-places', cost_usd: MAPS_COST['maps_autocomplete'], ok: !!res?.ok, error_code: res?.ok ? undefined : `http_${res?.status ?? 'red'}` });
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[] };
  return (data.suggestions ?? []).flatMap((s) => {
    const p = s.placePrediction;
    return p?.placeId && p.text?.text ? [{ place_id: p.placeId, text: p.text.text }] : [];
  }).slice(0, 5);
}

interface GeocodeApi {
  status: string;
  results?: {
    formatted_address: string;
    place_id: string;
    geometry: { location: { lat: number; lng: number }; location_type: string };
    address_components: { long_name: string; short_name: string; types: string[] }[];
  }[];
}

/** Geocodifica por texto, por `place_id` o a la inversa (lat, lng). `null` si no hay resultado. */
export async function geocode(env: Env, q: { address?: string; placeId?: string; lat?: number; lng?: number }): Promise<GeoResult | null> {
  const key = googleKey();
  if (!key) return null;
  const params = new URLSearchParams({ key, language: 'es', region: 'do' });
  if (q.placeId) params.set('place_id', q.placeId);
  else if (q.lat !== undefined && q.lng !== undefined) params.set('latlng', `${q.lat},${q.lng}`);
  else if (q.address) {
    params.set('address', q.address);
    params.set('components', 'country:DO');
  } else return null;

  const res = await timed(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, { method: 'GET' });
  const body = res?.ok ? ((await res.json()) as GeocodeApi) : null;
  await logUsage(env, { feature: 'maps_geocode', model: 'google-geocoding', cost_usd: MAPS_COST['maps_geocode'], ok: body?.status === 'OK' || body?.status === 'ZERO_RESULTS', error_code: body && (body.status === 'OK' || body.status === 'ZERO_RESULTS') ? undefined : `google_${body?.status ?? res?.status ?? 'red'}` });
  const top = body?.status === 'OK' ? body.results?.[0] : undefined;
  if (!top) return null;

  const part = (...types: string[]) => top.address_components.find((c) => types.some((t) => c.types.includes(t)))?.long_name ?? null;
  const country = top.address_components.find((c) => c.types.includes('country'))?.short_name;
  const t = top.geometry.location_type;
  return {
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    place_id: top.place_id,
    formatted: top.formatted_address,
    province: matchProvince(part('administrative_area_level_1')),
    municipality: part('administrative_area_level_2', 'locality'),
    sector: part('sublocality_level_1', 'sublocality', 'neighborhood'),
    in_do: country === 'DO',
    confidence: t === 'ROOFTOP' || t === 'RANGE_INTERPOLATED' ? 'alta' : t === 'GEOMETRIC_CENTER' ? 'media' : 'baja',
  };
}
