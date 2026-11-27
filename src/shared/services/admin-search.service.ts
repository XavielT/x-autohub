import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { unwrap } from '../../core/supabase/supabase-error';
import { DEFAULT_SEARCH_SYNONYMS, normalizeSynonymTerms } from '../utils/search-synonyms';

/** Un grupo de términos que la búsqueda trata como lo mismo. */
export interface SynonymGroup {
  id: number;
  terms: string[];
}

/** Algo que la gente buscó y no encontró nada. */
export interface SearchGap {
  query: string;
  searches: number;
  lastSeen: Date;
}

const SYNONYM_COLUMNS = 'id, terms';

/**
 * La búsqueda desde el panel (`/admin/busqueda`): los grupos de sinónimos y las búsquedas sin resultado.
 *
 * Escribir `search_synonym_groups` es solo de un admin (RLS) y el trigger de la base normaliza y valida; `normalizeSynonymTerms`
 * hace lo mismo aquí para dar el mensaje antes de viajar. Los alias de cada producto siguen en el formulario del producto.
 */
@Injectable({ providedIn: 'root' })
export class AdminSearchService {
  private readonly supabase = inject(SupabaseService);

  /** El modo simulado arranca con la misma siembra que la migración. */
  private mockGroups: SynonymGroup[] = DEFAULT_SEARCH_SYNONYMS.map((terms, i) => ({ id: i + 1, terms: [...terms] }));
  private mockId = this.mockGroups.length;

  getSynonyms(): Observable<SynonymGroup[]> {
    if (this.supabase.shouldUseMockData()) return of(this.mockGroups.map((g) => ({ ...g, terms: [...g.terms] })));

    return from(this.supabase.db.from('search_synonym_groups').select(SYNONYM_COLUMNS).order('id')).pipe(
      map((res) => unwrap(res).map((row) => ({ id: row.id, terms: row.terms }))),
    );
  }

  addSynonyms(rawTerms: readonly string[]): Observable<SynonymGroup> {
    let terms: string[];
    try {
      terms = normalizeSynonymTerms(rawTerms);
    } catch (e) {
      return throwError(() => e);
    }

    if (this.supabase.shouldUseMockData()) {
      const group = { id: ++this.mockId, terms };
      this.mockGroups = [...this.mockGroups, group];
      return of(group);
    }

    return from(this.supabase.db.from('search_synonym_groups').insert({ terms }).select(SYNONYM_COLUMNS).single()).pipe(
      map((res) => {
        const row = unwrap(res);
        return { id: row.id, terms: row.terms };
      }),
    );
  }

  updateSynonyms(id: number, rawTerms: readonly string[]): Observable<SynonymGroup> {
    let terms: string[];
    try {
      terms = normalizeSynonymTerms(rawTerms);
    } catch (e) {
      return throwError(() => e);
    }

    if (this.supabase.shouldUseMockData()) {
      this.mockGroups = this.mockGroups.map((g) => (g.id === id ? { id, terms } : g));
      return of({ id, terms });
    }

    return from(this.supabase.db.from('search_synonym_groups').update({ terms }).eq('id', id).select(SYNONYM_COLUMNS).single()).pipe(
      map((res) => {
        const row = unwrap(res);
        return { id: row.id, terms: row.terms };
      }),
    );
  }

  removeSynonyms(id: number): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.mockGroups = this.mockGroups.filter((g) => g.id !== id);
      return of(undefined);
    }

    return from(this.supabase.db.from('search_synonym_groups').delete().eq('id', id)).pipe(
      map((res) => {
        if (res.error) throw new Error('No pudimos borrar el grupo.');
      }),
    );
  }

  /** Lo más buscado sin resultado en los últimos días (`admin_search_gaps()`, solo admin). */
  getGaps(days = 30, limit = 30): Observable<SearchGap[]> {
    if (this.supabase.shouldUseMockData()) {
      return of([
        { query: 'espejo retrovisor', searches: 4, lastSeen: new Date() },
        { query: 'cornetas', searches: 2, lastSeen: new Date() },
      ]);
    }

    return from(this.supabase.db.rpc('admin_search_gaps', { p_days: days, p_limit: limit })).pipe(
      map((res) =>
        unwrap(res).map((row) => ({ query: row.query_norm, searches: Number(row.searches), lastSeen: new Date(row.last_seen) })),
      ),
    );
  }
}
