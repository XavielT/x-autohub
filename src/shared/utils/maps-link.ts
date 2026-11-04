import { GeoConfidence } from '../models/maps.model';

/**
 * Un enlace a Google Maps **sin API ni clave**: es solo una URL que abre la app o el sitio de Maps. Con coordenadas (y el
 * `place_id`, si se tiene) cae exacto; sin ellas busca el texto de la dirección.
 */
export function googleMapsUrl(target: { lat?: number | null; lng?: number | null; placeId?: string | null } | null, fallbackText = ''): string | null {
  const hasPoint = target && typeof target.lat === 'number' && typeof target.lng === 'number';
  if (hasPoint) {
    const place = target.placeId ? `&query_place_id=${encodeURIComponent(target.placeId)}` : '';
    return `https://www.google.com/maps/search/?api=1&query=${target.lat},${target.lng}${place}`;
  }
  const text = fallbackText.trim();
  return text ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${text}, República Dominicana`)}` : null;
}

/** Cómo llegar a un punto desde donde esté la persona (Maps pide el origen al abrirse). */
export function googleMapsDirectionsUrl(target: { lat?: number | null; lng?: number | null } | null, fallbackText = ''): string | null {
  const hasPoint = target && typeof target.lat === 'number' && typeof target.lng === 'number';
  const destination = hasPoint ? `${target.lat},${target.lng}` : fallbackText.trim() ? `${fallbackText.trim()}, República Dominicana` : '';
  return destination ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}` : null;
}

/** Cómo se le dice al admin qué tan fiable es el punto. */
export const GEO_CONFIDENCE_LABEL: Record<GeoConfidence, string> = {
  alta: 'ubicación exacta',
  media: 'ubicación aproximada',
  baja: 'ubicación muy aproximada',
};
