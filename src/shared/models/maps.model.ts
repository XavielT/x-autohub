/** Qué tan exacto es un punto: `alta` (el techo de la casa), `media` (el centro de una calle o sector), `baja` (aproximado o sin punto). */
export type GeoConfidence = 'alta' | 'media' | 'baja';

export interface AddressSuggestion {
  placeId: string;
  text: string;
}

/** Un lugar ya geocodificado, siempre dentro de RD (lo de fuera se descarta antes de llegar aquí). */
export interface GeoPoint {
  lat: number;
  lng: number;
  placeId: string | null;
  formatted: string | null;
  province: string | null;
  municipality: string | null;
  sector: string | null;
  confidence: GeoConfidence;
}

/** El resultado de buscar un lugar: encontrado, fuera de RD, o sin resultado. */
export type PlaceLookup = { kind: 'found'; point: GeoPoint } | { kind: 'outside' } | { kind: 'none' };

/** Una dirección informal ("al lado del colmado Lalo, Pantoja") ya interpretada por la IA. */
export interface NormalizedAddress {
  province: string | null;
  municipality: string | null;
  sector: string | null;
  reference: string | null;
  /** `null` si no se pudo ubicar: el pedido sigue igual, solo sin coordenadas. */
  point: GeoPoint | null;
}

export const OUTSIDE_DR_MESSAGE = 'Esa dirección parece estar fuera de República Dominicana. Solo entregamos en RD: escríbela a mano o elige otra.';
