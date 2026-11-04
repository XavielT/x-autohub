import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { SelectedVehicle } from '../models/product.model';
import { AiService } from './ai.service';

/** Lo que entendió la IA de una frase de búsqueda, ya validado por el servidor contra las listas reales del sitio. */
export interface ParsedSearch {
  makeId: number | null;
  makeName: string | null;
  modelId: number | null;
  modelName: string | null;
  year: number | null;
  categorySlug: string | null;
  categoryName: string | null;
  terms: string[];
  partNumber: string | null;
  intent: 'comprar' | 'servicio' | 'info' | 'otro';
  correctedQuery: string | null;
}

interface ParsedPayload {
  skipped?: string;
  make_id: number | null;
  make_name: string | null;
  model_id: number | null;
  model_name: string | null;
  year: number | null;
  category_slug: string | null;
  category_name: string | null;
  terms: string[];
  part_number: string | null;
  intent: ParsedSearch['intent'];
  corrected_query: string | null;
}

/** Una propuesta de la IA para un modelo escrito a mano en un garaje. Solo propone: un clic del admin la aplica. */
export interface ModelProposal {
  makeId: number;
  makeName: string;
  modelText: string;
  vehicles: number;
  canonical: { id: number; name: string } | null;
  createName: string | null;
  confidence: number;
}

/** Una propuesta de alias para un producto que existe, a partir de una búsqueda sin resultado. */
export interface AliasProposal {
  productId: number;
  productName: string;
  alias: string;
  query: string;
  confidence: number;
}

/**
 * La búsqueda inteligente (migración 0054): entiende "faros corolla 2015" y propone filtros, sin ser un chat. Cualquier fallo devuelve `null` y el
 * buscador sigue exactamente como antes, en silencio. También escribe el registro de búsquedas (sin datos personales) y, para el admin, propone
 * modelos y alias.
 */
@Injectable({ providedIn: 'root' })
export class AiSearchService {
  private readonly ai = inject(AiService);
  private readonly supabase = inject(SupabaseService);

  /**
   * ¿Vale la pena preguntarle a la IA? Heurística primero: un número de parte o un SKU se busca tal cual, y si la búsqueda normal ya trajo buenos resultados
   * y la frase no menciona un año ni hay un vehículo elegido, tampoco se gasta.
   */
  shouldAsk(query: string, storeTotal: number, hasVehicle: boolean): boolean {
    const q = query.trim();
    if (q.length < 3 || q.length > 120) return false;
    if (looksLikePartNumber(q)) return false;
    const hasYear = /\b(19[5-9]\d|20\d{2})\b/.test(q);
    return storeTotal < 3 || hasYear || (hasVehicle && storeTotal < 12);
  }

  /** La frase interpretada, o `null` si la IA no está, la frase es un número de parte o no hay nada útil que entender. */
  parse(query: string, vehicle: SelectedVehicle | null): Observable<ParsedSearch | null> {
    return this.ai
      .call<ParsedPayload>('ai-parse-search', {
        query: query.trim(),
        ...(vehicle ? { vehicle: { make_id: vehicle.makeId, model_id: vehicle.modelId, year: vehicle.year } } : {}),
      })
      .pipe(
        map((out) => (out.ok && !out.data.skipped ? toParsed(out.data) : null)),
        catchError(() => of(null)),
      );
  }

  /** Anota la búsqueda (saneada en la base) para saber qué se pide y no se encuentra. No falla nunca ni se espera. */
  logSearch(query: string, resultCount: number, hadVehicle: boolean): void {
    if (this.supabase.shouldUseMockData()) return;
    void Promise.resolve(this.supabase.db.rpc('log_search', { p_query: query, p_result_count: resultCount, p_had_vehicle: hadVehicle })).catch(() => undefined);
  }

  /** (Admin) Propone el modelo canónico, o crear uno, para los modelos que la gente escribió a mano. */
  proposeModels(): Observable<ModelProposal[]> {
    return this.ai.call<{ items: { make_id: number; make_name: string; model_text: string; vehicles: number; canonical: { id: number; name: string } | null; create_name: string | null; confidence: number }[] }>('ai-match-models', { action: 'models' }).pipe(
      map((out) =>
        out.ok
          ? out.data.items.map((i) => ({ makeId: i.make_id, makeName: i.make_name, modelText: i.model_text, vehicles: i.vehicles, canonical: i.canonical, createName: i.create_name, confidence: i.confidence }))
          : [],
      ),
    );
  }

  /** (Admin) Propone alias de producto a partir de las búsquedas sin resultado. */
  proposeAliases(): Observable<AliasProposal[]> {
    return this.ai.call<{ items: { product_id: number; product_name: string; alias: string; query: string; confidence: number }[] }>('ai-match-models', { action: 'aliases' }).pipe(
      map((out) => (out.ok ? out.data.items.map((i) => ({ productId: i.product_id, productName: i.product_name, alias: i.alias, query: i.query, confidence: i.confidence })) : [])),
    );
  }
}

/** Un número de parte o un SKU: se busca tal cual. Es el mismo criterio que usa la edge. */
export function looksLikePartNumber(query: string): boolean {
  const q = query.trim();
  if (/^xah-?\d{3,}$/i.test(q)) return true;
  if (/^[A-Za-z0-9][A-Za-z0-9\-./]{4,}$/.test(q) && /\d/.test(q)) return true;
  return /^\d{3,}[\s-]\d{3,}$/.test(q);
}

export function toParsed(p: ParsedPayload): ParsedSearch | null {
  const parsed: ParsedSearch = {
    makeId: p.make_id,
    makeName: p.make_name,
    modelId: p.model_id,
    modelName: p.model_name,
    year: p.year,
    categorySlug: p.category_slug,
    categoryName: p.category_name,
    terms: p.terms ?? [],
    partNumber: p.part_number,
    intent: p.intent,
    correctedQuery: p.corrected_query,
  };
  const understood = parsed.makeId || parsed.year || parsed.categorySlug || parsed.partNumber || parsed.terms.length > 0 || parsed.correctedQuery || parsed.intent === 'servicio';
  return understood ? parsed : null;
}

/** Los chips de "Entendí: Toyota Corolla 2015 · Luces". */
export function understoodChips(p: ParsedSearch): string[] {
  const vehicle = [p.makeName, p.modelName, p.year].filter(Boolean).join(' ');
  return [vehicle, p.categoryName ?? '', ...(p.partNumber ? [`N.º ${p.partNumber}`] : [])].filter((c) => c !== '');
}
