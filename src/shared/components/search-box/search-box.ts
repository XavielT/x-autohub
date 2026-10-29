import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { ProductSuggestion } from '../../models/product.model';
import { ProductService } from '../../services/product.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';

/** Lo que tarda en pedir sugerencias después de la última tecla. */
export const SUGGESTION_DEBOUNCE_MS = 250;
/** Cuántas sugerencias se muestran. */
export const MAX_SUGGESTIONS = 6;
/** Menos letras que esto no pide nada: una "a" encuentra media tienda. */
const MIN_CHARS = 2;

/**
 * El buscador de la tienda, con sugerencias al escribir.
 *
 * Sale en tres sitios (el navbar de escritorio, la barra de arriba del teléfono y
 * el home), con dos tamaños (`variant`). Pide las sugerencias a `searchProducts()`
 * —la misma búsqueda de la tienda— esperando 250 ms desde la última tecla, y si
 * llega una respuesta vieja cuando ya escribieron otra cosa la descarta
 * (`switchMap`). Enter lleva a `/buscar?q=…`.
 */
@Component({
  selector: 'app-search-box',
  imports: [DecimalPipe],
  templateUrl: './search-box.html',
  styleUrl: './search-box.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'onDocumentClick($event)' },
})
export class SearchBox {
  private readonly products = inject(ProductService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly supabase = inject(SupabaseService);

  readonly variant = input<'navbar' | 'hero'>('navbar');
  readonly placeholder = input('Busca piezas, accesorios, marcas…');
  /** Distingue los `id` cuando el buscador está más de una vez en la página. */
  readonly idPrefix = input('sb');

  readonly query = signal('');
  readonly suggestions = signal<ProductSuggestion[]>([]);
  readonly isOpen = signal(false);
  readonly activeIndex = signal(-1);
  /** Hay una petición en vuelo: spinner en el campo, "Buscando…" en el panel, botón apagado. */
  readonly isSearching = signal(false);
  /** El texto de la última búsqueda que terminó; con él se sabe si "sin resultados" es de lo que hay escrito. */
  readonly searchedText = signal('');

  /** Sugerencias ya pedidas en esta sesión, por texto: volver a un prefijo no vuelve a la red. */
  private readonly cache = new Map<string, ProductSuggestion[]>();
  private preloaded = false;

  private readonly typed$ = new Subject<string>();

  constructor() {
    this.typed$
      .pipe(
        debounceTime(SUGGESTION_DEBOUNCE_MS),
        distinctUntilChanged(),
        // `switchMap` descarta la petición anterior: al cambiar el texto se cancela su suscripción.
        switchMap((text) => {
          if (text.length < MIN_CHARS) return of({ text, items: [] as ProductSuggestion[] });
          const cached = this.cache.get(text.toLowerCase());
          if (cached) return of({ text, items: cached });
          this.isSearching.set(true);
          return this.products.suggestProducts(text, MAX_SUGGESTIONS).pipe(
            map((items) => ({ text, items })),
            tap(({ text: t, items }) => this.cache.set(t.toLowerCase(), items)),
            // Una sugerencia que falla no es un error que mostrar: el Enter
            // sigue llevando a la página de resultados.
            catchError(() => of({ text, items: [] as ProductSuggestion[] })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ text, items }) => {
        this.suggestions.set(items);
        this.searchedText.set(text);
        this.isSearching.set(false);
        this.activeIndex.set(-1);
      });
  }

  onInput(value: string): void {
    this.query.set(value);
    this.isOpen.set(true);
    const text = value.trim();
    // Con menos del mínimo se vacía al instante, sin esperar los 300 ms: dejar
    // sugerencias viejas a la vista mientras se borra el texto se ve roto.
    if (text.length < MIN_CHARS) {
      this.suggestions.set([]);
      this.isSearching.set(false);
    }
    this.typed$.next(text);
  }

  /**
   * Al enfocar cualquier buscador se baja ya el módulo de supabase-js (carga diferida desde la
   * 2.29.0), para que la primera búsqueda no pague esa descarga al escribir.
   */
  onFocus(): void {
    this.isOpen.set(true);
    if (this.preloaded) return;
    this.preloaded = true;
    const client = (this.supabase as { client?: () => Promise<unknown> }).client;
    void client?.call(this.supabase)?.catch(() => undefined);
  }

  /** Lo escrito, ya sin espacios sobrantes. */
  readonly trimmed = () => this.query().trim();

  /** "Sin resultados": terminó la búsqueda de lo que hay escrito y no trajo nada. */
  readonly noResults = () =>
    !this.isSearching() &&
    this.trimmed().length >= MIN_CHARS &&
    this.searchedText() === this.trimmed() &&
    this.suggestions().length === 0;

  onKeydown(event: KeyboardEvent): void {
    const count = this.suggestions().length;

    switch (event.key) {
      case 'ArrowDown':
        if (count === 0) return;
        event.preventDefault();
        this.isOpen.set(true);
        this.activeIndex.update((i) => (i + 1) % count);
        break;
      case 'ArrowUp':
        if (count === 0) return;
        event.preventDefault();
        this.activeIndex.update((i) => (i <= 0 ? count - 1 : i - 1));
        break;
      case 'Escape':
        this.isOpen.set(false);
        this.activeIndex.set(-1);
        break;
    }
  }

  /** El `submit` del formulario: sin FormsModule nadie le quita su recarga de página. */
  onSubmit(event: Event): void {
    event.preventDefault();
    this.submit();
  }

  /** Enter: si hay una sugerencia resaltada va a su ficha; si no, a los resultados. */
  submit(): void {
    const highlighted = this.suggestions()[this.activeIndex()];
    if (highlighted) {
      this.open(highlighted);
      return;
    }

    const text = this.query().trim();
    if (!text) return;

    this.close();
    void this.router.navigate(['/buscar'], { queryParams: { q: text } });
  }

  /** "Ver todos los resultados": siempre a la página de resultados, aunque haya algo resaltado. */
  seeAll(): void {
    this.activeIndex.set(-1);
    this.submit();
  }

  open(product: ProductSuggestion): void {
    this.close();
    this.query.set('');
    void this.router.navigate(['/tienda', 'p', product.slug]);
  }

  private close(): void {
    this.isOpen.set(false);
    this.activeIndex.set(-1);
    this.suggestions.set([]);
  }

  /** Un clic fuera cierra la lista. */
  onDocumentClick(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.isOpen.set(false);
  }
}
