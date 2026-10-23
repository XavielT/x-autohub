import {
  ProductCategoryModel,
  ProductFitmentModel,
  ProductModel,
  ProductSearchParams,
  ProductSearchResult,
  SelectedVehicle,
} from '../models/product.model';

/**
 * La misma búsqueda que `public.search_products()` (migración 0017), para el
 * modo mock. Cuando la app corre sin Supabase no hay Postgres que resuelva texto,
 * categoría, compatibilidad y filtros, así que se hace aquí **con la misma
 * semántica**: lo que se vea con mocks tiene que verse igual con la base.
 *
 * Una diferencia que no se puede cerrar: Postgres usa el diccionario `spanish`
 * (que también reduce las palabras a su raíz: "frenos" encuentra "freno"), y aquí
 * solo hay prefijos sin acentos. Para un mock alcanza.
 */

/** Minúsculas y sin acentos. Es lo que `xah_unaccent(lower(x))` hace en Postgres. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Palabras vacías que el diccionario `spanish` descarta de la consulta. */
const STOP_WORDS = new Set(['a', 'al', 'con', 'de', 'del', 'el', 'en', 'la', 'las', 'los', 'o', 'para', 'por', 'un', 'una', 'y']);

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 24;

/** Las palabras de la consulta, limpias y sin las vacías. */
function queryWords(query: string): string[] {
  return fold(query)
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w !== '' && !STOP_WORDS.has(w));
}

/** Cada palabra de la consulta es el comienzo de alguna palabra del producto. */
function matchesWords(product: ProductModel, words: string[]): boolean {
  if (words.length === 0) return false;
  const tokens = fold(`${product.name} ${product.brand} ${product.shortDescription} ${product.sku}`).split(/[^a-z0-9]+/);
  return words.every((w) => tokens.some((t) => t.startsWith(w)));
}

/** Coincidencia parcial en nombre, marca o SKU: recupera lo que el diccionario descarta. */
function matchesPartial(product: ProductModel, query: string): boolean {
  const needle = fold(query.trim());
  return (
    fold(product.name).includes(needle) ||
    fold(product.brand).includes(needle) ||
    product.sku.toLowerCase().includes(needle)
  );
}

/**
 * ¿Le sirve este producto a ese vehículo?
 *
 * Los `universal` siempre; los `specific` solo con un fitment que lo cubra. Un
 * `specific` sin fitments cargados **nunca** sirve: no se afirma compatibilidad
 * que nadie declaró.
 */
export function fitsVehicle(
  product: ProductModel,
  fitments: readonly ProductFitmentModel[],
  vehicle: Partial<SelectedVehicle>,
): boolean {
  if (vehicle.makeId === undefined) return true;
  if (product.fitmentType === 'universal') return true;

  return fitments.some(
    (f) =>
      f.productId === product.id &&
      f.makeId === vehicle.makeId &&
      // Sin modelo elegido basta con la marca; con modelo, el fitment es de toda
      // la marca (modelId nulo) o de ese modelo.
      (vehicle.modelId === undefined || f.modelId === null || f.modelId === vehicle.modelId) &&
      (vehicle.year === undefined || f.yearFrom === null || f.yearFrom <= vehicle.year) &&
      (vehicle.year === undefined || f.yearTo === null || f.yearTo >= vehicle.year),
  );
}

/** Las ids de una categoría y de sus hijas. Vacío si el slug no existe. */
function categoryIds(slug: string, categories: readonly ProductCategoryModel[]): Set<number> {
  const root = categories.find((c) => c.slug === slug);
  if (!root) return new Set();
  const ids = new Set<number>([root.id]);
  for (const c of categories) if (c.parentId === root.id) ids.add(c.id);
  return ids;
}

/** Relevancia aproximada: cuántas palabras de la consulta están en el nombre. */
function relevance(product: ProductModel, words: string[]): number {
  if (words.length === 0) return 0;
  const name = fold(product.name).split(/[^a-z0-9]+/);
  return words.filter((w) => name.some((t) => t.startsWith(w))).length;
}

/**
 * @param products Los productos que el llamador ya puede ver (sin los de prueba
 *   si no corresponde). Aquí solo se descartan los inactivos.
 */
export function searchProductsInMemory(
  products: readonly ProductModel[],
  fitments: readonly ProductFitmentModel[],
  categories: readonly ProductCategoryModel[],
  params: ProductSearchParams = {},
): ProductSearchResult {
  const query = params.query?.trim() ?? '';
  const words = queryWords(query);
  const ids = params.categorySlug ? categoryIds(params.categorySlug, categories) : null;
  const sort = params.sort ?? 'relevance';

  const matched = products.filter((p) => {
    if (p.isActive === false) return false;
    if (params.brand && p.brand !== params.brand) return false;
    if (query && !matchesWords(p, words) && !matchesPartial(p, query)) return false;
    if (ids && (p.categoryId === null || !ids.has(p.categoryId))) return false;
    if (!fitsVehicle(p, fitments, { makeId: params.makeId, modelId: params.modelId, year: params.year })) return false;
    if (params.minPrice !== undefined && p.price < params.minPrice) return false;
    if (params.maxPrice !== undefined && p.price > params.maxPrice) return false;
    if (params.inStockOnly && !(p.fulfillment === 'stock' && p.stock > 0)) return false;
    return true;
  });

  const byDefault = (a: ProductModel, b: ProductModel) =>
    Number(b.isFeatured) - Number(a.isFeatured) || b.soldCount - a.soldCount || a.id - b.id;

  const ordered = [...matched].sort((a, b) => {
    switch (sort) {
      case 'price_asc':
        return a.price - b.price || byDefault(a, b);
      case 'price_desc':
        return b.price - a.price || byDefault(a, b);
      case 'best_sellers':
        return b.soldCount - a.soldCount || byDefault(a, b);
      case 'newest':
        return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) || byDefault(a, b);
      default:
        return relevance(b, words) - relevance(a, words) || byDefault(a, b);
    }
  });

  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(params.offset ?? 0, 0);

  return { items: ordered.slice(offset, offset + limit), total: ordered.length };
}
