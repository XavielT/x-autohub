// Precios de los modelos, en UN solo archivo. USD por millón de tokens (entrada / salida).
// Son estimaciones para el tope mensual, no una factura: si Anthropic cambia las tarifas se cambia aquí y en ningún otro lado.
// Las imágenes ya vienen contadas dentro de `input_tokens` (la API las factura como tokens de entrada).

export interface ModelPrice {
  inPerM: number;
  outPerM: number;
}

export const PRICES: Record<string, ModelPrice> = {
  'claude-haiku-4-5-20251001': { inPerM: 1, outPerM: 5 },
  'claude-sonnet-5': { inPerM: 3, outPerM: 15 },
};

/** Un modelo que no está en la tabla se cobra como el más caro (mejor pasarse que quedarse corto con el tope). */
const FALLBACK: ModelPrice = { inPerM: 3, outPerM: 15 };

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model] ?? FALLBACK;
  return Math.round(((inputTokens * p.inPerM + outputTokens * p.outPerM) / 1_000_000) * 1e6) / 1e6;
}

/** Costo fijo por llamada de Google Maps (USD). Estimado con las tarifas públicas por solicitud. */
export const MAPS_COST: Record<string, number> = {
  maps_autocomplete: 0.00283,
  maps_geocode: 0.005,
};
