import { ProductCategoryModel, ProductFitmentModel, ProductModel, ProductSort } from '../models/product.model';
import { makeProduct } from '../testing/product.fixture';
import { fitsVehicle, searchProductsInMemory } from './product-search';

/**
 * La búsqueda en memoria tiene que dar lo mismo que `search_products()` en
 * Postgres. Los casos de aquí son los mismos que `scripts/verify-migrations.sh`
 * ejecuta contra la función real (los siete "ZZTEST"): si cambia la semántica de
 * un lado, estas pruebas o aquellas dejan de coincidir.
 */

const TOYOTA = 1;
const HONDA = 2;
const COROLLA = 10;
const CIVIC = 20;

const CATEGORIES: ProductCategoryModel[] = [
  { id: 6, parentId: null, slug: 'frenos', name: 'Frenos', icon: null, sortOrder: 60, isActive: true },
  { id: 7, parentId: 6, slug: 'discos', name: 'Discos', icon: null, sortOrder: 10, isActive: true },
  { id: 8, parentId: null, slug: 'motor-filtros', name: 'Motor y filtros', icon: null, sortOrder: 80, isActive: true },
];

const fitment = (
  id: number,
  productId: number,
  makeId: number,
  modelId: number | null,
  yearFrom: number | null = null,
  yearTo: number | null = null,
): ProductFitmentModel => ({ id, productId, makeId, modelId, yearFrom, yearTo });

// Los siete de la prueba de la base, uno por caso.
const UNIVERSAL = makeProduct({ id: 9001, name: 'ZZTEST Universal', price: 100 });
const COROLLA_ONLY = makeProduct({ id: 9002, name: 'ZZTEST Corolla', price: 200, fitmentType: 'specific' });
const TOYOTA_ALL = makeProduct({ id: 9003, name: 'ZZTEST Toyota', price: 300, fitmentType: 'specific' });
const CIVIC_ONLY = makeProduct({ id: 9004, name: 'ZZTEST Civic', price: 400, fitmentType: 'specific' });
const NO_FITMENTS = makeProduct({ id: 9005, name: 'ZZTEST Sin fitments', price: 500, fitmentType: 'specific' });
const ON_ORDER = makeProduct({
  id: 9006,
  name: 'ZZTEST Batería bajo pedido',
  price: 600,
  stock: 0,
  fulfillment: 'on_order',
  leadTimeDays: 7,
});
const INACTIVE = makeProduct({ id: 9007, name: 'ZZTEST Inactivo', price: 50, isActive: false });

const PRODUCTS = [UNIVERSAL, COROLLA_ONLY, TOYOTA_ALL, CIVIC_ONLY, NO_FITMENTS, ON_ORDER, INACTIVE];
const FITMENTS = [
  fitment(1, 9002, TOYOTA, COROLLA, 2010, 2020),
  fitment(2, 9003, TOYOTA, null),
  fitment(3, 9004, HONDA, CIVIC),
];

const names = (items: ProductModel[]) => items.map((p) => p.name);
const search = (params: Parameters<typeof searchProductsInMemory>[3], products = PRODUCTS) =>
  searchProductsInMemory(products, FITMENTS, CATEGORIES, params);

describe('searchProductsInMemory', () => {
  describe('texto', () => {
    it('encuentra los 6 activos y deja fuera el inactivo', () => {
      expect(search({ query: 'zztest' }).total).toBe(6);
    });

    it('una palabra a medias busca por prefijo', () => {
      expect(search({ query: 'zztes' }).total).toBe(6);
    });

    it("sin acentos: 'bateria' encuentra 'Batería', y al reves", () => {
      expect(names(search({ query: 'zztest bateria' }).items)).toEqual(['ZZTEST Batería bajo pedido']);
      expect(names(search({ query: 'BATERÍA' }).items)).toEqual(['ZZTEST Batería bajo pedido']);
    });

    it('todas las palabras tienen que estar', () => {
      expect(search({ query: 'zztest corolla' }).total).toBe(1);
      expect(search({ query: 'zztest nada' }).total).toBe(0);
    });

    it('un inactivo no sale ni buscandolo por el nombre', () => {
      expect(search({ query: 'zztest inactivo' }).total).toBe(0);
    });

    it('las palabras vacias del diccionario no impiden encontrar', () => {
      const filtro = makeProduct({ id: 1, name: 'Filtro de aire de alto flujo' });
      expect(search({ query: 'filtro para aire' }, [filtro]).total).toBe(1);
    });

    it('un texto de solo palabras vacias cae en la coincidencia parcial, y no revienta', () => {
      expect(() => search({ query: 'de' })).not.toThrow();
      expect(() => search({ query: 'zz|&!:*()<>' })).not.toThrow();
      expect(() => search({ query: '100%' })).not.toThrow();
    });

    it('encuentra por SKU y por marca', () => {
      const p = makeProduct({ id: 5, name: 'Pastillas', brand: 'Brembo', sku: 'XAH-000005' });
      expect(search({ query: 'xah-000005' }, [p]).total).toBe(1);
      expect(search({ query: 'bremb' }, [p]).total).toBe(1);
    });

    it('sin texto devuelve todo lo activo', () => {
      expect(search({}).total).toBe(6);
    });
  });

  describe('vehiculo', () => {
    it('Toyota Corolla 2015: universales + los que cubren ese carro', () => {
      const r = search({ query: 'zztest', makeId: TOYOTA, modelId: COROLLA, year: 2015, sort: 'price_asc' });
      expect(names(r.items)).toEqual([
        'ZZTEST Universal',
        'ZZTEST Corolla',
        'ZZTEST Toyota',
        'ZZTEST Batería bajo pedido',
      ]);
    });

    it('Toyota Corolla 2005: el de 2010-2020 queda fuera', () => {
      const r = search({ query: 'zztest', makeId: TOYOTA, modelId: COROLLA, year: 2005, sort: 'price_asc' });
      expect(names(r.items)).toEqual(['ZZTEST Universal', 'ZZTEST Toyota', 'ZZTEST Batería bajo pedido']);
    });

    it('los limites del rango de anos cuentan: 2010 y 2020 si, 2009 y 2021 no', () => {
      const params = { query: 'zztest corolla', makeId: TOYOTA, modelId: COROLLA };
      expect(search({ ...params, year: 2010 }).total).toBe(1);
      expect(search({ ...params, year: 2020 }).total).toBe(1);
      expect(search({ ...params, year: 2009 }).total).toBe(0);
      expect(search({ ...params, year: 2021 }).total).toBe(0);
    });

    it('Honda Civic: el de Toyota queda fuera', () => {
      const r = search({ query: 'zztest', makeId: HONDA, modelId: CIVIC, sort: 'price_asc' });
      expect(names(r.items)).toEqual(['ZZTEST Universal', 'ZZTEST Civic', 'ZZTEST Batería bajo pedido']);
    });

    it('solo la marca: cualquier modelo de esa marca', () => {
      const r = search({ query: 'zztest', makeId: TOYOTA, sort: 'price_asc' });
      expect(names(r.items)).toEqual([
        'ZZTEST Universal',
        'ZZTEST Corolla',
        'ZZTEST Toyota',
        'ZZTEST Batería bajo pedido',
      ]);
    });

    it('un fitment de toda la marca cubre cualquier modelo de ella', () => {
      // Toyota (modelId nulo) sirve para un modelo que ningun fitment menciona.
      expect(
        search({ query: 'zztest toyota', makeId: TOYOTA, modelId: 999, year: 2001 }).total,
      ).toBe(1);
    });

    it('un especifico sin fitments no sale en ninguna busqueda por vehiculo', () => {
      for (const params of [{ makeId: TOYOTA }, { makeId: HONDA }, { makeId: TOYOTA, modelId: COROLLA, year: 2015 }]) {
        expect(names(search({ query: 'zztest', ...params }).items)).not.toContain('ZZTEST Sin fitments');
      }
    });

    it('sin vehiculo, el especifico sin fitments si aparece (no se filtra nada)', () => {
      expect(names(search({ query: 'zztest' }).items)).toContain('ZZTEST Sin fitments');
    });
  });

  describe('precio y disponibilidad', () => {
    it('solo en stock deja fuera lo bajo pedido', () => {
      const r = search({ query: 'zztest', inStockOnly: true });
      expect(r.total).toBe(5);
      expect(names(r.items)).not.toContain('ZZTEST Batería bajo pedido');
    });

    it('en stock exige inventario: un articulo de stock con cero existencias queda fuera', () => {
      const agotado = makeProduct({ id: 1, name: 'Agotado', stock: 0 });
      expect(search({ inStockOnly: true }, [agotado]).total).toBe(0);
    });

    it('rango de precio, con los extremos incluidos', () => {
      expect(search({ query: 'zztest', minPrice: 200, maxPrice: 400 }).total).toBe(3);
      expect(search({ query: 'zztest', minPrice: 600 }).total).toBe(1);
      expect(search({ query: 'zztest', maxPrice: 100 }).total).toBe(1);
    });
  });

  describe('categoria', () => {
    const frenos = makeProduct({ id: 1, name: 'Disco', categoryId: 6 });
    const discos = makeProduct({ id: 2, name: 'Disco ventilado', categoryId: 7 });
    const motor = makeProduct({ id: 3, name: 'Filtro', categoryId: 8 });
    const sinCategoria = makeProduct({ id: 4, name: 'Suelto', categoryId: null });
    const all = [frenos, discos, motor, sinCategoria];

    it('una categoria incluye los productos de sus hijas', () => {
      expect(names(search({ categorySlug: 'frenos', sort: 'price_asc' }, all).items).sort()).toEqual([
        'Disco',
        'Disco ventilado',
      ]);
    });

    it('y una hija solo los suyos', () => {
      expect(names(search({ categorySlug: 'discos' }, all).items)).toEqual(['Disco ventilado']);
    });

    it('un slug que no existe no devuelve nada', () => {
      expect(search({ categorySlug: 'no-existe' }, all).total).toBe(0);
    });
  });

  describe('orden y paginacion', () => {
    const lista = [
      makeProduct({ id: 1, name: 'A', price: 300, soldCount: 5, createdAt: new Date('2026-01-01') }),
      makeProduct({ id: 2, name: 'B', price: 100, soldCount: 50, createdAt: new Date('2026-03-01') }),
      makeProduct({ id: 3, name: 'C', price: 200, soldCount: 20, createdAt: new Date('2026-02-01') }),
      makeProduct({ id: 4, name: 'D', price: 400, soldCount: 0, isFeatured: true, createdAt: new Date('2025-12-01') }),
    ];
    const ids = (sort: ProductSort) =>
      search({ sort }, lista).items.map((p) => p.id);

    it('precio menor y precio mayor', () => {
      expect(ids('price_asc')).toEqual([2, 3, 1, 4]);
      expect(ids('price_desc')).toEqual([4, 1, 3, 2]);
    });

    it('mas vendidos y nuevos', () => {
      expect(ids('best_sellers')).toEqual([2, 3, 1, 4]);
      expect(ids('newest')).toEqual([2, 3, 1, 4]);
    });

    it('relevancia sin texto: los destacados primero, despues los mas vendidos', () => {
      expect(ids('relevance')).toEqual([4, 2, 3, 1]);
    });

    it('relevancia con texto: gana el que lo trae en el nombre', () => {
      const r = search({ query: 'filtro' }, [
        makeProduct({ id: 1, name: 'Soporte', brand: 'Filtro SA' }),
        makeProduct({ id: 2, name: 'Filtro de aire' }),
      ]);
      expect(r.items[0].id).toBe(2);
    });

    it('un orden desconocido cae en relevancia', () => {
      expect(search({ sort: 'inventado' as never }, lista).items.map((p) => p.id)).toEqual([4, 2, 3, 1]);
    });

    it('pagina con limit y offset, y el total no depende de la pagina', () => {
      const primera = search({ sort: 'price_asc', limit: 2, offset: 0 }, lista);
      const segunda = search({ sort: 'price_asc', limit: 2, offset: 2 }, lista);
      expect(primera.items.map((p) => p.id)).toEqual([2, 3]);
      expect(segunda.items.map((p) => p.id)).toEqual([1, 4]);
      expect(primera.total).toBe(4);
      expect(segunda.total).toBe(4);
    });

    it('un offset pasado el final devuelve una pagina vacia, con el total correcto', () => {
      const r = search({ limit: 2, offset: 10 }, lista);
      expect(r.items).toEqual([]);
      expect(r.total).toBe(4);
    });

    it('el limite se acota entre 1 y 100, con 24 por defecto', () => {
      const muchos = Array.from({ length: 150 }, (_, i) => makeProduct({ id: i + 1 }));
      expect(search({}, muchos).items.length).toBe(24);
      expect(search({ limit: 1000 }, muchos).items.length).toBe(100);
      expect(search({ limit: 0 }, muchos).items.length).toBe(1);
      expect(search({ offset: -5 }, muchos).items[0].id).toBe(1);
    });
  });
});

describe('fitsVehicle', () => {
  it('sin vehiculo elegido todo sirve', () => {
    expect(fitsVehicle(NO_FITMENTS, FITMENTS, {})).toBe(true);
  });

  it('un universal sirve para cualquier vehiculo', () => {
    expect(fitsVehicle(UNIVERSAL, FITMENTS, { makeId: 99, modelId: 99, year: 1980 })).toBe(true);
  });

  it('un especifico sin fitments nunca sirve cuando hay vehiculo', () => {
    expect(fitsVehicle(NO_FITMENTS, FITMENTS, { makeId: TOYOTA })).toBe(false);
  });

  it('un especifico sirve solo con un fitment que lo cubra', () => {
    expect(fitsVehicle(COROLLA_ONLY, FITMENTS, { makeId: TOYOTA, modelId: COROLLA, year: 2015 })).toBe(true);
    expect(fitsVehicle(COROLLA_ONLY, FITMENTS, { makeId: HONDA, modelId: CIVIC, year: 2015 })).toBe(false);
  });
});
