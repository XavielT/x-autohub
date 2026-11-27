import { HubMarketCategory, HubMarketItemModel } from '../models/hub-market-item.model';
import { normalizeSearch } from '../ui/searchable-select/searchable-select';
import { textMatchesQuery } from './search-synonyms';

export type HubMarketCategoryFilter = 'all' | HubMarketCategory;
export type HubMarketSort = 'recientes' | 'precio-asc' | 'precio-desc';

export interface HubMarketFilters {
  query: string;
  category: HubMarketCategoryFilter;
  location: string;
  brand: string;
  sort: HubMarketSort;
}

export const EMPTY_HUB_MARKET_FILTERS: HubMarketFilters = { query: '', category: 'all', location: '', brand: '', sort: 'recientes' };

const CATEGORY_KEYS: readonly string[] = ['all', 'vehiculos', 'piezas', 'accesorios'];
const SORT_KEYS: readonly string[] = ['recientes', 'precio-asc', 'precio-desc'];

/** Los parámetros de la URL que son filtros: lo demás del enlace (utm_…) no se toca. */
export const HUB_MARKET_PARAM_KEYS = ['q', 'cat', 'ubic', 'marca', 'orden'];

/** Los filtros como parámetros de la URL, para compartir una búsqueda. Solo salen los que se apartan del valor por defecto. */
export function hubMarketFiltersToParams(f: HubMarketFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (f.query.trim() !== '') params['q'] = f.query.trim().slice(0, 60);
  if (f.category !== 'all') params['cat'] = f.category;
  if (f.location !== '') params['ubic'] = f.location;
  if (f.brand !== '') params['marca'] = f.brand;
  if (f.sort !== 'recientes') params['orden'] = f.sort;
  return params;
}

/** Lo inverso. Lo que venga de la URL no es de fiar: un valor fuera de la lista se descarta y el texto se recorta a 60 caracteres. */
export function hubMarketFiltersFromParams(get: (key: string) => string | null): HubMarketFilters {
  const cat = get('cat');
  const sort = get('orden');
  const category = cat !== null && CATEGORY_KEYS.includes(cat) ? (cat as HubMarketCategoryFilter) : 'all';
  return {
    query: (get('q') ?? '').slice(0, 60),
    category,
    location: (get('ubic') ?? '').slice(0, 80),
    // La marca solo existe en Vehículos: fuera de ahí no puede quedar filtrando a escondidas.
    brand: category === 'vehiculos' ? (get('marca') ?? '').slice(0, 60) : '',
    sort: sort !== null && SORT_KEYS.includes(sort) ? (sort as HubMarketSort) : 'recientes',
  };
}

/** Cuántos filtros (sin contar el orden) están puestos. */
export function activeHubMarketFilters(f: HubMarketFilters): number {
  return [f.query.trim() !== '', f.category !== 'all', f.location !== '', f.brand !== ''].filter(Boolean).length;
}

/** Filtra y ordena las publicaciones. El texto mira título, descripción y vendedor, y entiende sinónimos. */
export function filterHubMarket(items: readonly HubMarketItemModel[], f: HubMarketFilters): HubMarketItemModel[] {
  const query = normalizeSearch(f.query);
  const matched = items.filter(
    (item) =>
      (f.category === 'all' || item.category === f.category) &&
      (f.location === '' || item.location === f.location) &&
      (f.brand === '' || item.vehicleSpecs?.brand === f.brand) &&
      (query === '' || textMatchesQuery(`${item.title} ${item.description} ${item.sellerName}`, query)),
  );

  if (f.sort === 'precio-asc') return [...matched].sort((a, b) => a.price - b.price);
  if (f.sort === 'precio-desc') return [...matched].sort((a, b) => b.price - a.price);
  return matched;
}
