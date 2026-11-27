import { Injectable, inject, signal } from '@angular/core';
import { AdminSearchService } from './admin-search.service';
import { DEFAULT_SEARCH_SYNONYMS } from '../utils/search-synonyms';

/**
 * Los grupos de sinónimos vigentes, para ofrecer "otras formas de buscarlo" en `/buscar`. Es lectura pública (la tabla no tiene nada
 * sensible); se pide una sola vez y, mientras llega o si falla, se usa la siembra de la migración, que es casi lo mismo.
 */
@Injectable({ providedIn: 'root' })
export class SearchSynonymsService {
  private readonly source = inject(AdminSearchService);
  private asked = false;

  readonly groups = signal<readonly (readonly string[])[]>(DEFAULT_SEARCH_SYNONYMS);

  /** Pide los grupos de la base la primera vez; las demás no hace nada. */
  ensureLoaded(): void {
    if (this.asked) return;
    this.asked = true;
    this.source.getSynonyms().subscribe({
      next: (list) => {
        if (list.length > 0) this.groups.set(list.map((g) => g.terms));
      },
      error: () => undefined,
    });
  }
}
