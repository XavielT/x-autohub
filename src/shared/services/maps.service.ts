import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { AiService } from './ai.service';
import { AddressSuggestion, GeoConfidence, GeoPoint, NormalizedAddress, PlaceLookup } from '../models/maps.model';

/** Lo que responden `maps-geocode` y `ai-normalize-address` (los campos en inglés de la API). */
interface GeoPayload {
  found?: false;
  lat?: number | null;
  lng?: number | null;
  place_id?: string | null;
  formatted?: string | null;
  province?: string | null;
  municipality?: string | null;
  sector?: string | null;
  in_do?: boolean;
  confidence?: string;
  geo_confidence?: string;
  reference?: string | null;
}

const CONFIDENCES: readonly GeoConfidence[] = ['alta', 'media', 'baja'];
const toConfidence = (value: string | undefined): GeoConfidence =>
  (CONFIDENCES as readonly string[]).includes(value ?? '') ? (value as GeoConfidence) : 'baja';

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function toPoint(p: GeoPayload, confidence: string | undefined): GeoPoint | null {
  if (!isFiniteNumber(p.lat) || !isFiniteNumber(p.lng)) return null;
  return {
    lat: p.lat,
    lng: p.lng,
    placeId: p.place_id ?? null,
    formatted: p.formatted ?? null,
    province: p.province ?? null,
    municipality: p.municipality ?? null,
    sector: p.sector ?? null,
    confidence: toConfidence(confidence),
  };
}

/**
 * Direcciones con Google Maps, **siempre a través de las Edge Functions** (`maps-autocomplete`, `maps-geocode`,
 * `ai-normalize-address`): ninguna clave de Google llega al navegador. Nada de esto bloquea un formulario: si el servicio no
 * está (modo simulado, tope alcanzado, red caída) devuelve vacío o `none` y la persona escribe la dirección a mano.
 */
@Injectable({ providedIn: 'root' })
export class MapsService {
  private readonly ai = inject(AiService);
  private token: string | null = null;

  /**
   * El token de una búsqueda: agrupa las teclas de un mismo autocompletar (así lo factura Google). Se renueva al elegir
   * una sugerencia. Sin `crypto.randomUUID` (navegador viejo) simplemente no se manda y la búsqueda funciona igual.
   */
  private sessionToken(): string | null {
    if (this.token) return this.token;
    try {
      this.token = crypto.randomUUID();
    } catch {
      this.token = null;
    }
    return this.token;
  }

  suggest(query: string): Observable<AddressSuggestion[]> {
    const text = query.trim();
    if (text.length < 3) return of([]);
    const session_token = this.sessionToken();
    return this.ai.call<{ suggestions?: { place_id: string; text: string }[] }>('maps-autocomplete', { query: text, ...(session_token ? { session_token } : {}) }).pipe(
      map((out) => (out.ok ? (out.data.suggestions ?? []).map((s) => ({ placeId: s.place_id, text: s.text })) : [])),
    );
  }

  /** Lo que la persona eligió del autocompletar: se geocodifica y se cierra la sesión de facturación. */
  place(placeId: string): Observable<PlaceLookup> {
    this.token = null;
    return this.geocode({ place_id: placeId });
  }

  /** Una dirección escrita (el panel, el taller). */
  search(address: string): Observable<PlaceLookup> {
    return this.geocode({ address: address.trim() });
  }

  /** De un pin del mapa a municipio y sector en texto. */
  reverse(lat: number, lng: number): Observable<PlaceLookup> {
    return this.geocode({ lat, lng });
  }

  private geocode(body: Record<string, unknown>): Observable<PlaceLookup> {
    return this.ai.call<GeoPayload>('maps-geocode', body).pipe(
      map((out): PlaceLookup => {
        if (!out.ok || out.data.found === false) return { kind: 'none' };
        if (out.data.in_do === false) return { kind: 'outside' };
        const point = toPoint(out.data, out.data.confidence);
        return point ? { kind: 'found', point } : { kind: 'none' };
      }),
    );
  }

  /** Una dirección informal dominicana: provincia, municipio, sector, referencia y, si se logra, un punto. */
  normalize(text: string): Observable<NormalizedAddress | null> {
    const value = text.trim();
    if (value.length < 5 || value.length > 200) return of(null);
    return this.ai.call<GeoPayload>('ai-normalize-address', { text: value }).pipe(
      map((out) =>
        out.ok
          ? {
              province: out.data.province ?? null,
              municipality: out.data.municipality ?? null,
              sector: out.data.sector ?? null,
              reference: out.data.reference ?? null,
              point: toPoint(out.data, out.data.geo_confidence),
            }
          : null,
      ),
    );
  }
}
