import {
  ProductCategoryModel,
  ProductFitmentModel,
  ProductModel,
  ProductSearchParams,
  ProductSearchResult,
  SelectedVehicle,
} from '../models/product.model';
import { DEFAULT_SEARCH_SYNONYMS, synonymsOf } from './search-synonyms';

/**
 * La misma búsqueda que `public.search_products()` (migración 0017), para el
 * modo mock. Cuando la app corre sin Supabase no hay Postgres que resuelva texto,
 * categoría, compatibilidad y filtros, así que se hace aquí **con la misma
 * semántica**: lo que se vea con mocks tiene que verse igual con la base.
 *
 * Desde la migración 0067 la búsqueda también mira el nombre de la categoría (y la del padre) y entiende
 * sinónimos (`search-synonyms.ts`: "bumper" encuentra "parachoques"), igual que la base.
 *
 * Diferencias que no se pueden cerrar: Postgres usa el diccionario `spanish` (que también reduce las palabras a su
 * raíz: "frenos" encuentra "freno") y perdona errores de tecleo con trigramas; aquí solo hay prefijos sin acentos y
 * los plurales que traen los grupos de sinónimos. Para un mock alcanza.
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

/** El nombre de la categoría del producto y el de su padre, como los junta la base al buscar. */
function categoryText(product: ProductModel, categories: readonly ProductCategoryModel[]): string {
  const own = categories.find((c) => c.id === product.categoryId);
  const parent = own?.parentId == null ? undefined : categories.find((c) => c.id === own.parentId);
  return [own?.name, parent?.name].filter(Boolean).join(' ');
}

const tokensOf = (text: string): string[] => fold(text).split(/[^a-z0-9]+/).filter(Boolean);

/** ¿La palabra (o alguno de sus sinónimos) está en las palabras del texto? La palabra por prefijo; los sinónimos, exactos. */
function wordMatches(tokens: readonly string[], word: string): boolean {
  if (tokens.some((t) => t.startsWith(word))) return true;
  const joined = ` ${tokens.join(' ')} `;
  return synonymsOf(word, DEFAULT_SEARCH_SYNONYMS).some((term) =>
    term === word ? false : term.includes(' ') ? joined.includes(` ${term} `) : tokens.includes(term),
  );
}

/** Cada palabra de la consulta (o un sinónimo suyo) está en el producto o en su categoría. */
function matchesWords(product: ProductModel, words: string[], categories: readonly ProductCategoryModel[]): boolean {
  if (words.length === 0) return false;
  const tokens = tokensOf(`${product.name} ${product.brand} ${product.shortDescription} ${product.sku} ${categoryText(product, categories)}`);
  return words.every((w) => wordMatches(tokens, w));
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
      (vehicle.modelId == null || f.modelId === null || f.modelId === vehicle.modelId) &&
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

/** Relevancia aproximada: lo que dice el nombre pesa más (1 por palabra) que lo que solo dice la categoría o la descripción (0,3). */
function relevance(product: ProductModel, words: string[], categories: readonly ProductCategoryModel[]): number {
  if (words.length === 0) return 0;
  const nameTokens = tokensOf(product.name);
  const allTokens = tokensOf(`${product.name} ${product.brand} ${product.shortDescription} ${categoryText(product, categories)}`);
  return words.reduce((sum, w) => sum + (wordMatches(nameTokens, w) ? 1 : wordMatches(allTokens, w) ? 0.3 : 0), 0);
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
    if (query && !matchesWords(p, words, categories) && !matchesPartial(p, query)) return false;
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
        return relevance(b, words, categories) - relevance(a, words, categories) || byDefault(a, b);
    }
  });

  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(params.offset ?? 0, 0);

  return { items: ordered.slice(offset, offset + limit), total: ordered.length };
}
