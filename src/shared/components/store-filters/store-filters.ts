import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ProductCategoryNode } from '../../models/product.model';
import { EMPTY_FILTERS, StoreFilters, hasActiveFilters } from '../../utils/store-filters';

/** El paso del deslizador de precio, en RD$. */
const PRICE_STEP = 500;

/**
 * El panel de filtros de la tienda: categoría, marca, precio, "solo en stock" y
 * "compatible con mi vehículo".
 *
 * Es el mismo panel en la columna de la izquierda (escritorio) y en la hoja
 * "Filtros" (teléfono). No guarda estado: recibe los filtros y avisa con
 * `changed` cada cambio completo, y la página decide qué hacer (cambiar la URL).
 *
 * Sin `FormsModule`: son campos nativos con `(change)`, que es todo lo que hace
 * falta aquí.
 */
@Component({
  selector: 'app-store-filters',
  templateUrl: './store-filters.html',
  styleUrl: './store-filters.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreFiltersPanel {
  readonly filters = input.required<StoreFilters>();
  readonly categories = input<readonly ProductCategoryNode[]>([]);
  readonly brands = input<readonly string[]>([]);
  /** El precio más alto del catálogo: el tope del deslizador. */
  readonly maxPrice = input(0);
  /** "Toyota Corolla 2015", o `null` si no hay vehículo elegido. */
  readonly vehicleLabel = input<string | null>(null);
  /** Evita choques de `id` cuando el panel está dos veces en la página (columna y hoja). */
  readonly idPrefix = input('sf');

  readonly changed = output<StoreFilters>();
  readonly pickVehicle = output<void>();

  /** El tope del deslizador, redondeado hacia arriba al paso: 32,500 → 33,000. */
  readonly sliderMax = computed(() => Math.max(PRICE_STEP, Math.ceil(this.maxPrice() / PRICE_STEP) * PRICE_STEP));
  readonly step = PRICE_STEP;

  /** El valor del deslizador: el máximo puesto, o el tope si no hay ninguno. */
  readonly sliderValue = computed(() => this.filters().maxPrice ?? this.sliderMax());

  readonly isFiltered = computed(() => hasActiveFilters(this.filters()));

  /** El filtro de compatibilidad está prendido: hay vehículo y no se apagó. */
  readonly compatibleOn = computed(() => this.vehicleLabel() !== null && this.filters().compatible !== false);

  /** La categoría activa, para abrir su rama del árbol aunque sea una hija. */
  readonly openRootSlug = computed(() => {
    const slug = this.filters().categorySlug;
    for (const root of this.categories()) {
      if (root.slug === slug || root.children.some((c) => c.slug === slug)) return root.slug;
    }
    return '';
  });

  private emit(change: Partial<StoreFilters>): void {
    this.changed.emit({ ...this.filters(), ...change });
  }

  /** Elegir la categoría que ya está elegida la quita. */
  selectCategory(slug: string): void {
    this.emit({ categorySlug: this.filters().categorySlug === slug ? '' : slug });
  }

  clearCategory(): void {
    this.emit({ categorySlug: '' });
  }

  onBrand(event: Event): void {
    this.emit({ brand: (event.target as HTMLSelectElement).value });
  }

  /** Un precio escrito: vacío o basura quita el límite; un negativo no vale. */
  onPrice(which: 'minPrice' | 'maxPrice', event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const n = Number(raw);
    this.emit({ [which]: raw !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n) : null });
  }

  /** El deslizador mueve el máximo; llevarlo hasta el tope lo quita. */
  onSlider(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.emit({ maxPrice: value >= this.sliderMax() ? null : value });
  }

  onStock(event: Event): void {
    this.emit({ inStockOnly: (event.target as HTMLInputElement).checked });
  }

  onCompatible(event: Event): void {
    // Prendido es el valor por omisión (`null`); apagarlo se recuerda en la URL.
    this.emit({ compatible: (event.target as HTMLInputElement).checked ? null : false });
  }

  reset(): void {
    // El orden no es un filtro: quitar los filtros no lo cambia.
    this.changed.emit({ ...EMPTY_FILTERS, sort: this.filters().sort });
  }
}
