import {
  EMPTY_FILTERS,
  StoreFilters,
  filtersFromParams,
  filtersToParams,
  hasActiveFilters,
} from './store-filters';

const from = (q: Record<string, string>) => filtersFromParams((k) => q[k] ?? null);

describe('store-filters', () => {
  it('sin parametros devuelve los filtros vacios', () => {
    expect(from({})).toEqual(EMPTY_FILTERS);
  });

  it('lee categoría, marca, precios, stock, compat y orden', () => {
    expect(
      from({ categoria: 'frenos', marca: 'Brembo', min: '500', max: '4000', stock: '1', compat: '0', orden: 'precio-menor' }),
    ).toEqual({
      categorySlug: 'frenos',
      brand: 'Brembo',
      minPrice: 500,
      maxPrice: 4000,
      inStockOnly: true,
      compatible: false,
      sort: 'price_asc',
    });
  });

  it('ignora lo que no entiende: precios basura, orden desconocido, compat distinto de 0', () => {
    const f = from({ min: 'abc', max: '-5', orden: 'inventado', compat: '1', stock: 'si' });

    expect(f.minPrice).toBeNull();
    expect(f.maxPrice).toBeNull();
    expect(f.sort).toBe('relevance');
    expect(f.compatible).toBeNull();
    expect(f.inStockOnly).toBe(false);
  });

  it('escribe solo lo que no está en su valor por omision', () => {
    expect(filtersToParams(EMPTY_FILTERS)).toEqual({
      categoria: null, marca: null, min: null, max: null, stock: null, compat: null, orden: null,
    });

    const params = filtersToParams({ ...EMPTY_FILTERS, brand: 'Brembo', minPrice: 0, sort: 'newest', compatible: false });
    expect(params['marca']).toBe('Brembo');
    expect(params['min']).toBe('0'); // un cero es un precio valido, no "vacio"
    expect(params['orden']).toBe('nuevos');
    expect(params['compat']).toBe('0');
  });

  it('ida y vuelta: lo que se escribe se vuelve a leer igual', () => {
    const filters: StoreFilters = {
      categorySlug: 'audio-multimedia',
      brand: 'Pioneer',
      minPrice: 1000,
      maxPrice: 9000,
      inStockOnly: true,
      compatible: false,
      sort: 'best_sellers',
    };
    const params = filtersToParams(filters);

    expect(filtersFromParams((k) => params[k] ?? null)).toEqual(filters);
  });

  it('hasActiveFilters ignora el orden, que no es un filtro', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, sort: 'price_desc' })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, brand: 'X' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, compatible: false })).toBe(true);
  });
});
