import { AutoHubModel } from '../models/auto-hub.model';
import {
  AutoHubFilters, EMPTY_AUTO_HUB_FILTERS, activeAutoHubFilters, autoHubFiltersFromParams, autoHubFiltersToParams, filterAutoHub,
} from './auto-hub-filters';

function auto(over: Partial<AutoHubModel>): AutoHubModel {
  return {
    id: 1, brand: 'Toyota', model: 'Corolla', year: 2015, price: 500000, color: 'blanco', mileage: 90000,
    chasisType: 'sedan', doors: 4, traction: 'fwd', fuel: 'gasoline', cylinders: 4, images: [],
    description: '', location: 'Santo Domingo', contact: '8095550000', ...over,
  };
}

const LISTA = [
  auto({ id: 1 }),
  auto({ id: 2, brand: 'Ford', model: 'Ranger', chasisType: 'pickup', fuel: 'diesel', traction: '4x4', year: 2020, price: 1500000, mileage: 30000 }),
  auto({ id: 3, brand: 'Kia', model: 'Sportage', chasisType: 'suv', year: 2010, price: 300000, mileage: 150000 }),
];
const ids = (r: AutoHubModel[]) => r.map((a) => a.id);

describe('filterAutoHub', () => {
  it('sin filtros devuelve todo en el mismo orden', () => {
    expect(ids(filterAutoHub(LISTA, EMPTY_AUTO_HUB_FILTERS))).toEqual([1, 2, 3]);
  });

  it('busca por marca o modelo sin importar mayusculas', () => {
    expect(ids(filterAutoHub(LISTA, { ...EMPTY_AUTO_HUB_FILTERS, query: ' RANG ' }))).toEqual([2]);
    expect(ids(filterAutoHub(LISTA, { ...EMPTY_AUTO_HUB_FILTERS, query: 'kia' }))).toEqual([3]);
  });

  it('filtra por chasis, combustible y traccion', () => {
    expect(ids(filterAutoHub(LISTA, { ...EMPTY_AUTO_HUB_FILTERS, chasisType: 'suv' }))).toEqual([3]);
    expect(ids(filterAutoHub(LISTA, { ...EMPTY_AUTO_HUB_FILTERS, fuel: 'diesel' }))).toEqual([2]);
    expect(ids(filterAutoHub(LISTA, { ...EMPTY_AUTO_HUB_FILTERS, traction: 'fwd' }))).toEqual([1, 3]);
  });

  it('los rangos incluyen el límite', () => {
    expect(ids(filterAutoHub(LISTA, { ...EMPTY_AUTO_HUB_FILTERS, maxPrice: 500000 }))).toEqual([1, 3]);
    expect(ids(filterAutoHub(LISTA, { ...EMPTY_AUTO_HUB_FILTERS, minYear: 2015 }))).toEqual([1, 2]);
    expect(ids(filterAutoHub(LISTA, { ...EMPTY_AUTO_HUB_FILTERS, maxMileage: 90000 }))).toEqual([1, 2]);
  });

  it('un número vacío, cero o NaN no filtra', () => {
    expect(filterAutoHub(LISTA, { ...EMPTY_AUTO_HUB_FILTERS, maxPrice: 0, minYear: NaN })).toHaveLength(3);
  });

  it('combina varios filtros', () => {
    const r = filterAutoHub(LISTA, { ...EMPTY_AUTO_HUB_FILTERS, traction: 'fwd', maxMileage: 100000 });
    expect(ids(r)).toEqual([1]);
  });

  it('ordena sin tocar la lista original', () => {
    expect(ids(filterAutoHub(LISTA, { ...EMPTY_AUTO_HUB_FILTERS, sort: 'precio-asc' }))).toEqual([3, 1, 2]);
    expect(ids(filterAutoHub(LISTA, { ...EMPTY_AUTO_HUB_FILTERS, sort: 'precio-desc' }))).toEqual([2, 1, 3]);
    expect(ids(filterAutoHub(LISTA, { ...EMPTY_AUTO_HUB_FILTERS, sort: 'anio-desc' }))).toEqual([2, 1, 3]);
    expect(ids(filterAutoHub(LISTA, { ...EMPTY_AUTO_HUB_FILTERS, sort: 'km-asc' }))).toEqual([2, 1, 3]);
    expect(ids([...LISTA])).toEqual([1, 2, 3]);
  });
});

describe('activeAutoHubFilters', () => {
  it('cuenta los filtros puestos, sin la búsqueda ni el orden', () => {
    expect(activeAutoHubFilters(EMPTY_AUTO_HUB_FILTERS)).toBe(0);
    expect(activeAutoHubFilters({ ...EMPTY_AUTO_HUB_FILTERS, query: 'x', sort: 'km-asc', fuel: 'diesel', maxPrice: 5 })).toBe(2);
  });
});

describe('filtros en la URL', () => {
  const leer = (obj: Record<string, string>) => autoHubFiltersFromParams((k) => obj[k] ?? null);

  it('sin filtros la URL queda limpia, y viceversa', () => {
    expect(autoHubFiltersToParams(EMPTY_AUTO_HUB_FILTERS)).toEqual({});
    expect(leer({})).toEqual(EMPTY_AUTO_HUB_FILTERS);
  });

  it('ida y vuelta con todos los filtros', () => {
    const f: AutoHubFilters = {
      query: 'kia', chasisType: 'suv', fuel: 'diesel', traction: '4x4', maxPrice: 900000, minYear: 2018, maxMileage: 80000, sort: 'precio-asc',
    };
    expect(leer(autoHubFiltersToParams(f))).toEqual(f);
  });

  it('descarta lo que no es válido', () => {
    const f = leer({ tipo: 'tanque', combustible: 'agua', traccion: 'x', precio: 'mucho', anio: '-5', km: '', orden: 'azar' });
    expect(f).toEqual(EMPTY_AUTO_HUB_FILTERS);
  });

  it('recorta la búsqueda de texto', () => {
    expect(leer({ q: 'a'.repeat(200) }).query).toHaveLength(60);
  });
});
