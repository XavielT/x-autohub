import { AutoHubModel } from '../models/auto-hub.model';

/** Lo que el visitante eligió en /auto-hub. Vacío (`''` o `null`) quiere decir "sin filtro". */
export interface AutoHubFilters {
  query: string;
  chasisType: AutoHubModel['chasisType'] | '';
  fuel: AutoHubModel['fuel'] | '';
  traction: AutoHubModel['traction'] | '';
  maxPrice: number | null;
  minYear: number | null;
  maxMileage: number | null;
  sort: AutoHubSort;
}

export type AutoHubSort = 'recientes' | 'precio-asc' | 'precio-desc' | 'anio-desc' | 'km-asc';

export const EMPTY_AUTO_HUB_FILTERS: AutoHubFilters = {
  query: '',
  chasisType: '',
  fuel: '',
  traction: '',
  maxPrice: null,
  minYear: null,
  maxMileage: null,
  sort: 'recientes',
};

export const CHASIS_LABELS: Record<AutoHubModel['chasisType'], string> = {
  sedan: 'Sedán',
  suv: 'SUV',
  hatchback: 'Hatchback',
  pickup: 'Pickup',
};

export const FUEL_LABELS: Record<AutoHubModel['fuel'], string> = {
  gasoline: 'Gasolina',
  diesel: 'Diésel',
  glp: 'GLP',
  electric: 'Eléctrico',
};

export const TRACTION_LABELS: Record<AutoHubModel['traction'], string> = {
  fwd: 'Delantera (FWD)',
  rwd: 'Trasera (RWD)',
  awd: 'Integral (AWD)',
  '4x4': '4x4',
};

export const SORT_LABELS: Record<AutoHubSort, string> = {
  recientes: 'Más recientes',
  'precio-asc': 'Precio: menor a mayor',
  'precio-desc': 'Precio: mayor a menor',
  'anio-desc': 'Año: más nuevo primero',
  'km-asc': 'Menos kilometraje',
};

/** Cuántos filtros (sin contar la búsqueda ni el orden) hay puestos. */
export function activeAutoHubFilters(f: AutoHubFilters): number {
  return [f.chasisType, f.fuel, f.traction, f.maxPrice, f.minYear, f.maxMileage].filter(
    (v) => v !== '' && v !== null,
  ).length;
}

/**
 * Filtra y ordena el inventario. Es estable: con el orden "recientes" respeta el que trae la lista
 * (la base ya la manda de más nueva a más vieja). Un número vacío o negativo no filtra.
 */
export function filterAutoHub(autos: readonly AutoHubModel[], f: AutoHubFilters): AutoHubModel[] {
  const query = f.query.toLowerCase().trim();
  const has = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0;

  const result = autos.filter(
    (a) =>
      (query === '' || a.brand.toLowerCase().includes(query) || a.model.toLowerCase().includes(query)) &&
      (f.chasisType === '' || a.chasisType === f.chasisType) &&
      (f.fuel === '' || a.fuel === f.fuel) &&
      (f.traction === '' || a.traction === f.traction) &&
      (!has(f.maxPrice) || a.price <= f.maxPrice) &&
      (!has(f.minYear) || a.year >= f.minYear) &&
      (!has(f.maxMileage) || a.mileage <= f.maxMileage),
  );

  const by: Record<AutoHubSort, ((a: AutoHubModel, b: AutoHubModel) => number) | null> = {
    recientes: null,
    'precio-asc': (a, b) => a.price - b.price,
    'precio-desc': (a, b) => b.price - a.price,
    'anio-desc': (a, b) => b.year - a.year,
    'km-asc': (a, b) => a.mileage - b.mileage,
  };
  const compare = by[f.sort];
  return compare ? [...result].sort(compare) : result;
}

const CHASIS_KEYS = Object.keys(CHASIS_LABELS);
const FUEL_KEYS = Object.keys(FUEL_LABELS);
const TRACTION_KEYS = Object.keys(TRACTION_LABELS);
const SORT_KEYS = Object.keys(SORT_LABELS);

/**
 * Los filtros como parámetros de la URL, para compartir una búsqueda. Solo salen los que se
 * apartan del valor por defecto: sin filtros la URL queda limpia (`/auto-hub`).
 */
export function autoHubFiltersToParams(f: AutoHubFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (f.query.trim() !== '') params['q'] = f.query.trim();
  if (f.chasisType) params['tipo'] = f.chasisType;
  if (f.fuel) params['combustible'] = f.fuel;
  if (f.traction) params['traccion'] = f.traction;
  if (f.maxPrice !== null) params['precio'] = String(f.maxPrice);
  if (f.minYear !== null) params['anio'] = String(f.minYear);
  if (f.maxMileage !== null) params['km'] = String(f.maxMileage);
  if (f.sort !== 'recientes') params['orden'] = f.sort;
  return params;
}

/**
 * Lo inverso. Lo que venga de la URL no es de fiar: un valor que no esté en la lista o un número
 * que no lo sea se descarta en silencio, y la búsqueda de texto se recorta a 60 caracteres.
 */
export function autoHubFiltersFromParams(get: (key: string) => string | null): AutoHubFilters {
  const pick = <T extends string>(key: string, valid: string[]): T | '' => {
    const v = get(key);
    return v !== null && valid.includes(v) ? (v as T) : '';
  };
  const num = (key: string): number | null => {
    const v = get(key);
    if (v === null || v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const sort = get('orden');
  return {
    query: (get('q') ?? '').slice(0, 60),
    chasisType: pick<AutoHubModel['chasisType']>('tipo', CHASIS_KEYS),
    fuel: pick<AutoHubModel['fuel']>('combustible', FUEL_KEYS),
    traction: pick<AutoHubModel['traction']>('traccion', TRACTION_KEYS),
    maxPrice: num('precio'),
    minYear: num('anio'),
    maxMileage: num('km'),
    sort: sort !== null && SORT_KEYS.includes(sort) ? (sort as AutoHubSort) : 'recientes',
  };
}
