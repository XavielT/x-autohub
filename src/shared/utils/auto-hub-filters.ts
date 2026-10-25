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
