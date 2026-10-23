import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { ProductModel } from '../../models/product.model';
import { ProductService } from '../../services/product.service';

/** Lo que tarda en pedir sugerencias después de la última tecla. */
export const SUGGESTION_DEBOUNCE_MS = 300;
/** Cuántas sugerencias se muestran. */
export const MAX_SUGGESTIONS = 6;
/** Menos letras que esto no pide nada: una "a" encuentra media tienda. */
const MIN_CHARS = 2;

/**
 * El buscador de la tienda, con sugerencias al escribir.
 *
 * Sale en tres sitios (el navbar de escritorio, la barra de arriba del teléfono y
 * el home), con dos tamaños (`variant`). Pide las sugerencias a `searchProducts()`
 * —la misma búsqueda de la tienda— esperando 300 ms desde la última tecla, y si
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

  readonly variant = input<'navbar' | 'hero'>('navbar');
  readonly placeholder = input('Busca piezas, accesorios, marcas…');
  /** Distingue los `id` cuando el buscador está más de una vez en la página. */
  readonly idPrefix = input('sb');

  readonly query = signal('');
  readonly suggestions = signal<ProductModel[]>([]);
  readonly isOpen = signal(false);
  readonly activeIndex = signal(-1);

  private readonly typed$ = new Subject<string>();

  constructor() {
    this.typed$
      .pipe(
        debounceTime(SUGGESTION_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((text) =>
          text.length < MIN_CHARS
            ? of<ProductModel[]>([])
            : this.products.searchProducts({ query: text, limit: MAX_SUGGESTIONS }).pipe(
                map((result) => result.items),
                // Una sugerencia que falla no es un error que mostrar: el Enter
                // sigue llevando a la página de resultados.
                catchError(() => of<ProductModel[]>([])),
              ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => {
        this.suggestions.set(items);
        this.activeIndex.set(-1);
      });
  }

  onInput(value: string): void {
    this.query.set(value);
    this.isOpen.set(true);
    const text = value.trim();
    // Con menos del mínimo se vacía al instante, sin esperar los 300 ms: dejar
    // sugerencias viejas a la vista mientras se borra el texto se ve roto.
    if (text.length < MIN_CHARS) this.suggestions.set([]);
    this.typed$.next(text);
  }

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

  open(product: ProductModel): void {
    this.close();
    this.query.set('');
    void this.router.navigate(['/hub-part-details', product.id]);
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
