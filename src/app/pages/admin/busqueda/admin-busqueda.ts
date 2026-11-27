import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Skeleton } from '../../../../shared/ui/skeleton/skeleton';
import { ProductModel } from '../../../../shared/models/product.model';
import { AdminSearchService, SearchGap, SynonymGroup } from '../../../../shared/services/admin-search.service';
import { ProductService } from '../../../../shared/services/product.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { normalizeTerm } from '../../../../shared/utils/search-synonyms';

/** Cuántos resultados enseña la prueba de búsqueda. */
const TEST_LIMIT = 8;

/**
 * La búsqueda de la tienda desde el panel (`/admin/busqueda`).
 *
 * Tres cosas en una pantalla: **probar** una búsqueda y ver qué salió; ver lo que la gente buscó y **no encontró** (la demanda perdida,
 * de `search_log`); y los **sinónimos**: términos que el buscador trata como lo mismo ("parachoques = bumper = defensa"). Los alias
 * de un solo producto siguen en su formulario de Inventario.
 */
@Component({
  selector: 'app-admin-busqueda',
  imports: [DatePipe, Skeleton],
  templateUrl: './admin-busqueda.html',
  styleUrl: './admin-busqueda.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminBusqueda implements OnInit {
  private readonly search = inject(AdminSearchService);
  private readonly products = inject(ProductService);
  private readonly toast = inject(ToastService);

  readonly groups = signal<SynonymGroup[]>([]);
  readonly gaps = signal<SearchGap[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal('');

  // Probar una búsqueda.
  readonly testQuery = signal('');
  readonly testResults = signal<ProductModel[] | null>(null);
  readonly testTotal = signal(0);
  readonly isTesting = signal(false);

  // Sinónimos.
  readonly filter = signal('');
  readonly newTerms = signal('');
  readonly newError = signal('');
  readonly isAdding = signal(false);
  /** Lo que se está escribiendo para añadir un término a cada grupo. */
  readonly extra = signal<Record<number, string>>({});
  /** El grupo cuyo "Borrar" espera el segundo toque. */
  readonly confirmingId = signal<number | null>(null);

  readonly shown = computed(() => {
    const q = normalizeTerm(this.filter());
    const all = this.groups();
    return q === '' ? all : all.filter((g) => g.terms.some((t) => t.includes(q)));
  });

  ngOnInit(): void {
    this.search.getSynonyms().subscribe({
      next: (groups) => {
        this.groups.set(groups);
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set('No pudimos cargar los sinónimos.');
        this.isLoading.set(false);
      },
    });
    // Las búsquedas sin resultado son un extra: si falla, la sección queda vacía.
    this.search.getGaps().subscribe({ next: (g) => this.gaps.set(g), error: () => undefined });
  }

  // --- Probar ---------------------------------------------------------------

  setTestQuery(event: Event): void {
    this.testQuery.set((event.target as HTMLInputElement).value);
  }

  runTest(query = this.testQuery()): void {
    const text = query.trim();
    this.testQuery.set(text);
    if (text.length < 2 || this.isTesting()) return;

    this.isTesting.set(true);
    this.products.searchProducts({ query: text, limit: TEST_LIMIT }).subscribe({
      next: (res) => {
        this.testResults.set(res.items);
        this.testTotal.set(res.total);
        this.isTesting.set(false);
      },
      error: () => {
        this.toast.show('No pudimos probar la búsqueda.', 'error');
        this.isTesting.set(false);
      },
    });
  }

  // --- Sinónimos ------------------------------------------------------------

  setFilter(event: Event): void {
    this.filter.set((event.target as HTMLInputElement).value);
  }

  setNewTerms(event: Event): void {
    this.newTerms.set((event.target as HTMLInputElement).value);
    this.newError.set('');
  }

  /** Los términos escritos: separados por coma. */
  private parse(text: string): string[] {
    return text.split(',');
  }

  addGroup(): void {
    if (this.isAdding()) return;
    this.isAdding.set(true);
    this.search.addSynonyms(this.parse(this.newTerms())).subscribe({
      next: (group) => {
        this.groups.update((all) => [group, ...all]);
        this.newTerms.set('');
        this.newError.set('');
        this.isAdding.set(false);
        this.toast.show('Sinónimos guardados. La búsqueda ya los usa.');
      },
      error: (e: Error) => {
        this.newError.set(e.message);
        this.isAdding.set(false);
      },
    });
  }

  /** Una búsqueda sin resultado pasa a ser el primer término de un grupo nuevo. */
  startFromGap(gap: SearchGap): void {
    this.newTerms.set(`${gap.query}, `);
    this.newError.set('');
    queueMicrotask(() => document.querySelector<HTMLInputElement>('#sy-new')?.focus());
  }

  setExtra(id: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.extra.update((all) => ({ ...all, [id]: value }));
  }

  addTerm(group: SynonymGroup): void {
    const text = (this.extra()[group.id] ?? '').trim();
    if (text === '') return;
    this.save(group, [...group.terms, ...this.parse(text)], () => this.extra.update((all) => ({ ...all, [group.id]: '' })));
  }

  removeTerm(group: SynonymGroup, term: string): void {
    if (group.terms.length <= 2) {
      this.toast.show('Un grupo necesita al menos dos términos. Si ya no sirve, bórralo.', 'error');
      return;
    }
    this.save(group, group.terms.filter((t) => t !== term));
  }

  private save(group: SynonymGroup, terms: string[], done?: () => void): void {
    this.search.updateSynonyms(group.id, terms).subscribe({
      next: (updated) => {
        this.groups.update((all) => all.map((g) => (g.id === updated.id ? updated : g)));
        done?.();
      },
      error: (e: Error) => this.toast.show(e.message, 'error'),
    });
  }

  /** El primer toque pide confirmar; el segundo borra. */
  removeGroup(group: SynonymGroup): void {
    if (this.confirmingId() !== group.id) {
      this.confirmingId.set(group.id);
      return;
    }

    this.search.removeSynonyms(group.id).subscribe({
      next: () => {
        this.confirmingId.set(null);
        this.groups.update((all) => all.filter((g) => g.id !== group.id));
        this.toast.show('Grupo borrado.');
      },
      error: (e: Error) => {
        this.confirmingId.set(null);
        this.toast.show(e.message, 'error');
      },
    });
  }
}
