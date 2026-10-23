import { ProductSort } from '../models/product.model';

/**
 * Los filtros de la tienda y su traducción a la URL.
 *
 * La URL refleja los filtros para que una búsqueda se pueda compartir o
 * recargar. Lo que **no** viaja es el vehículo: es de quien mira, no de la
 * búsqueda; solo viaja `compat=0` cuando alguien apaga el filtro de compatibilidad
 * (por omisión está prendido si hay vehículo elegido).
 */
export interface StoreFilters {
  /** Slug de la categoría (o de una hija). Vacío = todas. */
  categorySlug: string;
  /** Marca del producto. Vacío = todas. */
  brand: string;
  minPrice: number | null;
  maxPrice: number | null;
  inStockOnly: boolean;
  /** `null` = el valor por omisión (prendido si hay vehículo elegido). */
  compatible: boolean | null;
  sort: ProductSort;
}

export const EMPTY_FILTERS: StoreFilters = {
  categorySlug: '',
  brand: '',
  minPrice: null,
  maxPrice: null,
  inStockOnly: false,
  compatible: null,
  sort: 'relevance',
};

export const SORT_OPTIONS: readonly { value: ProductSort; label: string }[] = [
  { value: 'relevance', label: 'Relevancia' },
  { value: 'price_asc', label: 'Precio menor' },
  { value: 'price_desc', label: 'Precio mayor' },
  { value: 'best_sellers', label: 'Más vendidos' },
  { value: 'newest', label: 'Nuevos' },
];

/** El parámetro de la URL de cada orden. */
const SORT_PARAM: Record<ProductSort, string> = {
  relevance: '',
  price_asc: 'precio-menor',
  price_desc: 'precio-mayor',
  best_sellers: 'vendidos',
  newest: 'nuevos',
};

const PARAM_SORT = Object.fromEntries(
  Object.entries(SORT_PARAM).filter(([, v]) => v).map(([k, v]) => [v, k as ProductSort]),
) as Record<string, ProductSort>;

/** Un número de la URL, o `null` si no es un número razonable. */
function price(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** Lee los filtros de unos parámetros de URL. Lo que no entienda lo ignora. */
export function filtersFromParams(get: (key: string) => string | null): StoreFilters {
  const compat = get('compat');
  return {
    categorySlug: get('categoria') ?? '',
    brand: get('marca') ?? '',
    minPrice: price(get('min')),
    maxPrice: price(get('max')),
    inStockOnly: get('stock') === '1',
    // Solo `0` apaga; cualquier otra cosa es el valor por omisión.
    compatible: compat === '0' ? false : null,
    sort: PARAM_SORT[get('orden') ?? ''] ?? 'relevance',
  };
}

/**
 * Los filtros como query params. Lo que está en su valor por omisión no se
 * escribe: una URL limpia es una URL que se puede leer y compartir.
 */
export function filtersToParams(filters: StoreFilters): Record<string, string | null> {
  return {
    categoria: filters.categorySlug || null,
    marca: filters.brand || null,
    min: filters.minPrice === null ? null : String(filters.minPrice),
    max: filters.maxPrice === null ? null : String(filters.maxPrice),
    stock: filters.inStockOnly ? '1' : null,
    compat: filters.compatible === false ? '0' : null,
    orden: SORT_PARAM[filters.sort] || null,
  };
}

/** ¿Hay algún filtro puesto? Para mostrar "Quitar filtros". */
export function hasActiveFilters(filters: StoreFilters): boolean {
  return (
    filters.categorySlug !== '' ||
    filters.brand !== '' ||
    filters.minPrice !== null ||
    filters.maxPrice !== null ||
    filters.inStockOnly ||
    filters.compatible === false
  );
}
