import { TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthService } from './auth.service';
import { AdminCatalogService, dedupeFitments } from './admin-catalog.service';
import { CategoryService } from './category.service';
import { GUEST_VEHICLE_KEY, VehicleService } from './vehicle.service';
import { ProductService } from './product.service';
import { ToastService } from './toast.service';
import { UserModel } from '../models/user.model';
import { SelectedVehicle } from '../models/product.model';
import { VEHICLE_MAKES_MOCK, VEHICLE_MODELS_MOCK } from '../data/vehicle.mock';

/**
 * Los servicios de la tienda por el camino simulado (los specs corren siempre en
 * modo mock). Lo que fijan: que el mock responda con la misma semántica que la
 * base, que lo de prueba no se escape, y que el vehículo elegido sobreviva donde
 * tiene que sobrevivir.
 */

const BASE: UserModel = {
  id: 'u-1',
  displayName: 'Quien sea',
  email: 'quien@ejemplo.com',
  role: 'user',
  createdAt: '2026-08-15T00:00:00Z',
};

const make = (slug: string) => VEHICLE_MAKES_MOCK.find((m) => m.slug === slug)!;
const model = (makeSlug: string, slug: string) =>
  VEHICLE_MODELS_MOCK.find((m) => m.makeId === make(makeSlug).id && m.slug === slug)!;

describe('servicios de la tienda (mock)', () => {
  let user: WritableSignal<UserModel | null>;
  const toast = { show: vi.fn() };

  beforeEach(() => {
    localStorage.clear();
    toast.show.mockClear();
    user = signal<UserModel | null>(null);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user } },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  afterEach(() => localStorage.clear());

  describe('ProductService', () => {
    const products = () => TestBed.inject(ProductService);
    const ids = (list: { id: number }[]) => list.map((p) => p.id);

    it('sin filtros devuelve la primera pagina de 24 y el total de lo visible (35, sin la de prueba)', async () => {
      const r = await firstValueFrom(products().searchProducts());
      expect(r.items.length).toBe(24);
      expect(r.total).toBe(35);
    });

    it('un admin ve ademas la pieza de prueba', async () => {
      user.set({ ...BASE, role: 'admin', isAdmin: true });
      const r = await firstValueFrom(products().searchProducts({ limit: 100 }));
      expect(r.total).toBe(36);
    });

    it('busca por texto, sin acentos ni mayusculas', async () => {
      const r = await firstValueFrom(products().searchProducts({ query: 'BREMBO' }));
      expect(ids(r.items)).toEqual([1]);
    });

    it('con un vehiculo devuelve universales + compatibles, y deja fuera los especificos sin compatibilidad', async () => {
      const r = await firstValueFrom(
        products().searchProducts({
          makeId: make('toyota').id,
          modelId: model('toyota', 'corolla').id,
          year: 2015,
          limit: 100,
        }),
      );
      const found = ids(r.items);
      expect(found).toContain(2); // filtro K&N: Corolla 2014-2019
      expect(found).toContain(4); // aceite: universal
      expect(found).toContain(16); // bujias: toda la marca Toyota
      expect(found).not.toContain(1); // especifico sin compatibilidad cargada
      expect(found).not.toContain(13);
      expect(found).not.toContain(8); // alfombras: RAV4, no Corolla
    });

    it('filtra por categoria, incluidas sus hijas', async () => {
      const r = await firstValueFrom(products().searchProducts({ categorySlug: 'frenos', limit: 100 }));
      expect(ids(r.items).sort((a, b) => a - b)).toEqual([1, 11, 12]);
    });

    it('getBySlug encuentra por la direccion web, y no la pieza de prueba para un anonimo', async () => {
      expect((await firstValueFrom(products().getBySlug('disco-ventilado-gtr-355mm-1')))?.id).toBe(1);
      expect(await firstValueFrom(products().getBySlug('no-existe'))).toBeUndefined();
      expect(await firstValueFrom(products().getBySlug('prueba-pieza-de-prueba-36'))).toBeUndefined();
    });

    it('getVariants trae las opciones activas de un producto, en orden, y nada de uno sin opciones', async () => {
      const v = await firstValueFrom(products().getVariants(8));
      expect(v.map((x) => x.name)).toEqual(['Negro', 'Gris', 'Beige']);
      expect(await firstValueFrom(products().getVariants(1))).toEqual([]);
    });

    it('getVariantsFor junta varios productos en una sola lectura', async () => {
      expect((await firstValueFrom(products().getVariantsFor([1, 8]))).length).toBe(3);
      expect(await firstValueFrom(products().getVariantsFor([]))).toEqual([]);
    });

    it('un producto con opciones lo dice, y su stock es la suma de ellas', async () => {
      const p = await firstValueFrom(products().getBySlug('alfombras-all-weather-8'));
      expect(p?.hasVariants).toBe(true);
      expect(p?.variantLabel).toBe('Color');
      expect(p?.stock).toBe(16);
      expect((await firstValueFrom(products().getBySlug('disco-ventilado-gtr-355mm-1')))?.hasVariants).toBe(false);
    });

    it('getFitments trae la compatibilidad declarada, y nada de un universal', async () => {
      expect((await firstValueFrom(products().getFitments(2))).length).toBe(2);
      expect(await firstValueFrom(products().getFitments(4))).toEqual([]);
      // Especifico sin compatibilidad cargada: vacio tambien.
      expect(await firstValueFrom(products().getFitments(1))).toEqual([]);
    });

    it('getAll y getById siguen funcionando para quien los usaba', async () => {
      expect((await firstValueFrom(products().getAll())).length).toBe(35);
      expect((await firstValueFrom(products().getById(2)))?.name).toBe('Filtro de aire de alto flujo');
    });
  });

  describe('CategoryService', () => {
    const categories = () => TestBed.inject(CategoryService);

    it('lista las 12 categorias activas', async () => {
      expect((await firstValueFrom(categories().getAll())).length).toBe(12);
    });

    it('arma el arbol con las de primer nivel en orden', async () => {
      const tree = await firstValueFrom(categories().getTree());
      expect(tree.length).toBe(12);
      expect(tree[0].name).toBe('Accesorios interior');
      expect(tree.every((n) => Array.isArray(n.children))).toBe(true);
    });

    it('encuentra una por su slug', async () => {
      expect((await firstValueFrom(categories().getBySlug('frenos')))?.name).toBe('Frenos');
      expect(await firstValueFrom(categories().getBySlug('no-existe'))).toBeUndefined();
    });
  });

  describe('VehicleService', () => {
    const vehicles = () => TestBed.inject(VehicleService);
    const corolla: SelectedVehicle = {
      makeId: make('toyota').id,
      modelId: model('toyota', 'corolla').id,
      year: 2015,
    };
    const civic: SelectedVehicle = {
      makeId: make('honda').id,
      modelId: model('honda', 'civic').id,
      year: 2018,
    };

    it('trae las 35 marcas y los modelos de una marca', async () => {
      expect((await firstValueFrom(vehicles().getMakes())).length).toBe(35);
      const modelos = await firstValueFrom(vehicles().getModels(make('toyota').id));
      expect(modelos.length).toBe(11);
      expect(modelos.every((m) => m.makeId === make('toyota').id)).toBe(true);
    });

    it('sin sesion, elegir un vehiculo lo deja en localStorage y en la senal', () => {
      vehicles().select(corolla);

      expect(vehicles().selected()).toEqual(corolla);
      expect(JSON.parse(localStorage.getItem(GUEST_VEHICLE_KEY) as string)).toEqual(corolla);
    });

    it('un vehiculo guardado de antes se lee al arrancar', () => {
      localStorage.setItem(GUEST_VEHICLE_KEY, JSON.stringify(civic));
      expect(vehicles().selected()).toEqual(civic);
    });

    it('un valor guardado con otra forma se descarta en vez de romper', () => {
      for (const garbage of ['no es json', '{"makeId":"x"}', 'null', '[1,2]', '{"makeId":1,"modelId":2}']) {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
          providers: [
            { provide: AuthService, useValue: { user } },
            { provide: ToastService, useValue: toast },
          ],
        });
        localStorage.setItem(GUEST_VEHICLE_KEY, garbage);
        expect(vehicles().selected()).toBeNull();
      }
    });

    it('quitar el vehiculo lo borra de la senal y de localStorage', () => {
      vehicles().select(corolla);
      vehicles().clear();

      expect(vehicles().selected()).toBeNull();
      expect(localStorage.getItem(GUEST_VEHICLE_KEY)).toBeNull();
    });

    it('con sesion, el vehiculo va al garaje como el de por defecto y no a localStorage', async () => {
      user.set(BASE);
      TestBed.tick();

      vehicles().select(corolla);

      const garaje = await firstValueFrom(vehicles().getGarage());
      expect(garaje.length).toBe(1);
      expect(garaje[0]).toMatchObject({ ...corolla, isDefault: true, userId: 'u-1' });
      expect(localStorage.getItem(GUEST_VEHICLE_KEY)).toBeNull();
    });

    it('elegir otro lo agrega y desmarca al anterior; repetir uno no lo duplica', async () => {
      user.set(BASE);
      TestBed.tick();

      vehicles().select(corolla);
      vehicles().select(civic);
      vehicles().select(corolla);

      const garaje = await firstValueFrom(vehicles().getGarage());
      expect(garaje.length).toBe(2);
      expect(garaje.filter((v) => v.isDefault).length).toBe(1);
      expect(garaje.find((v) => v.isDefault)).toMatchObject(corolla);
    });

    it('quitar el vehiculo con sesion deja el garaje sin uno por defecto, pero no lo vacia', async () => {
      user.set(BASE);
      TestBed.tick();
      vehicles().select(corolla);

      vehicles().clear();

      const garaje = await firstValueFrom(vehicles().getGarage());
      expect(garaje.length).toBe(1);
      expect(garaje.some((v) => v.isDefault)).toBe(false);
      expect(vehicles().selected()).toBeNull();
    });

    it('al volver a iniciar sesion la senal recupera el vehiculo por defecto del garaje', async () => {
      user.set(BASE);
      TestBed.tick();
      vehicles().select(civic);

      user.set(null);
      TestBed.tick();
      expect(vehicles().selected()).toBeNull(); // nada guardado en este navegador

      user.set(BASE);
      TestBed.tick();
      await Promise.resolve();
      expect(vehicles().selected()).toEqual(civic);
    });

    it('el garaje es de cada quien: otro usuario no ve el ajeno', async () => {
      user.set(BASE);
      TestBed.tick();
      vehicles().select(corolla);

      user.set({ ...BASE, id: 'u-2' });
      TestBed.tick();

      expect(await firstValueFrom(vehicles().getGarage())).toEqual([]);
    });

    it('sin sesion el garaje esta vacio', async () => {
      expect(await firstValueFrom(vehicles().getGarage())).toEqual([]);
    });

    it('si el garaje esta vacio al iniciar sesion, se conserva lo que el visitante ya habia elegido', () => {
      vehicles().select(corolla); // como invitado
      user.set(BASE);
      TestBed.tick();

      expect(vehicles().selected()).toEqual(corolla);
    });

    it('al iniciar sesion con el garaje vacio, el vehiculo del invitado se migra al garaje y se borra del navegador', async () => {
      vehicles().select(corolla); // como invitado
      user.set(BASE);
      TestBed.tick();
      await vi.waitFor(() => expect(vehicles().garage().length).toBe(1));

      expect(vehicles().garage()[0]).toMatchObject({ ...corolla, isDefault: true });
      expect(localStorage.getItem(GUEST_VEHICLE_KEY)).toBeNull();
    });

    it('agregar al garaje: el primero es el de por defecto aunque no se pida, y no se duplica', async () => {
      user.set(BASE);
      TestBed.tick();

      await firstValueFrom(vehicles().addToGarage(corolla));
      await firstValueFrom(vehicles().addToGarage(civic, false, 'El del trabajo'));
      await firstValueFrom(vehicles().addToGarage(civic));

      const garaje = vehicles().garage();
      expect(garaje.length).toBe(2);
      expect(garaje.find((v) => v.isDefault)).toMatchObject(corolla);
      expect(garaje.find((v) => v.makeId === civic.makeId)?.nickname).toBe('El del trabajo');
      expect(vehicles().selected()).toEqual(corolla);
    });

    it('cambiar el predeterminado mueve el vehiculo elegido; quitar el predeterminado lo deja sin elegido', async () => {
      user.set(BASE);
      TestBed.tick();
      await firstValueFrom(vehicles().addToGarage(corolla));
      await firstValueFrom(vehicles().addToGarage(civic));
      const civicRow = vehicles().garage().find((v) => v.makeId === civic.makeId)!;

      await firstValueFrom(vehicles().setDefaultVehicle(civicRow.id));
      expect(vehicles().selected()).toEqual(civic);
      expect(vehicles().garage().filter((v) => v.isDefault).length).toBe(1);

      await firstValueFrom(vehicles().removeFromGarage(civicRow.id));
      expect(vehicles().garage().length).toBe(1);
      expect(vehicles().selected()).toBeNull();
    });

    it('sin sesion, las acciones del garaje no hacen nada', async () => {
      await firstValueFrom(vehicles().addToGarage(corolla));
      await firstValueFrom(vehicles().setDefaultVehicle(1));
      await firstValueFrom(vehicles().removeFromGarage(1));

      expect(vehicles().garage()).toEqual([]);
    });
  });

  describe('AdminCatalogService', () => {
    const catalog = () => TestBed.inject(AdminCatalogService);
    const errorOf = async (obs: Parameters<typeof firstValueFrom>[0]) => {
      try {
        await firstValueFrom(obs);
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    };

    it('lista las categorias, incluidas las desactivadas', async () => {
      const antes = await firstValueFrom(catalog().getCategories());
      expect(antes.length).toBe(12);

      await firstValueFrom(catalog().updateCategory(antes[0].id, { isActive: false }));
      const despues = await firstValueFrom(catalog().getCategories());
      expect(despues.length).toBe(12);
      expect(despues.find((c) => c.id === antes[0].id)?.isActive).toBe(false);
    });

    it('crea una categoria con su slug, y una subcategoria dentro de una de primer nivel', async () => {
      const frenos = (await firstValueFrom(catalog().getCategories())).find((c) => c.slug === 'frenos')!;
      const hija = await firstValueFrom(
        catalog().createCategory({ name: 'Discos y pastillas', parentId: frenos.id, sortOrder: 10 }),
      );

      expect(hija.slug).toBe('discos-y-pastillas');
      expect(hija.parentId).toBe(frenos.id);
    });

    it('rechaza un tercer nivel, como el trigger de la base', async () => {
      const frenos = (await firstValueFrom(catalog().getCategories())).find((c) => c.slug === 'frenos')!;
      const hija = await firstValueFrom(catalog().createCategory({ name: 'Discos', parentId: frenos.id, sortOrder: 10 }));

      expect(await errorOf(catalog().createCategory({ name: 'Ranurados', parentId: hija.id, sortOrder: 10 }))).toBe(
        'Las categorias admiten dos niveles como maximo.',
      );
    });

    it('rechaza un slug repetido', async () => {
      expect(await errorOf(catalog().createCategory({ name: 'Frenos', parentId: null, sortOrder: 10 }))).toBe(
        'Ese registro ya existe.',
      );
    });

    it('una categoria con hijas no puede pasar a ser hija', async () => {
      const todas = await firstValueFrom(catalog().getCategories());
      const frenos = todas.find((c) => c.slug === 'frenos')!;
      const suspension = todas.find((c) => c.slug === 'suspension')!;
      await firstValueFrom(catalog().createCategory({ name: 'Discos', parentId: frenos.id, sortOrder: 10 }));

      expect(await errorOf(catalog().updateCategory(frenos.id, { parentId: suspension.id }))).toBe(
        'Una categoria con subcategorias no puede ser subcategoria.',
      );
    });

    it('una categoria no puede ser su propia hija ni colgar de una hija', async () => {
      const todas = await firstValueFrom(catalog().getCategories());
      const frenos = todas.find((c) => c.slug === 'frenos')!;
      const hija = await firstValueFrom(catalog().createCategory({ name: 'Discos', parentId: frenos.id, sortOrder: 10 }));

      expect(await errorOf(catalog().updateCategory(hija.id, { parentId: hija.id }))).toBe(
        'Las categorias admiten dos niveles como maximo.',
      );
    });

    it('intercambia el orden de dos hermanas', async () => {
      const todas = await firstValueFrom(catalog().getCategories());
      const [a, b] = todas.filter((c) => c.parentId === null).slice(0, 2);

      await firstValueFrom(catalog().swapCategoryOrder(a, b));

      const despues = await firstValueFrom(catalog().getCategories());
      expect(despues.find((c) => c.id === a.id)?.sortOrder).toBe(b.sortOrder);
      expect(despues.find((c) => c.id === b.id)?.sortOrder).toBe(a.sortOrder);
    });

    it('dos hermanas con el mismo orden se separan para que el movimiento se note', async () => {
      const a = await firstValueFrom(catalog().createCategory({ name: 'Uno', parentId: null, sortOrder: 500 }));
      const b = await firstValueFrom(catalog().createCategory({ name: 'Dos', parentId: null, sortOrder: 500 }));

      await firstValueFrom(catalog().swapCategoryOrder(a, b));

      const despues = await firstValueFrom(catalog().getCategories());
      const sa = despues.find((c) => c.id === a.id)!.sortOrder;
      const sb = despues.find((c) => c.id === b.id)!.sortOrder;
      expect(sa).not.toBe(sb);
    });

    it('agrega marcas y modelos, y rechaza los repetidos', async () => {
      const marca = await firstValueFrom(catalog().createMake('Hyundai Motors'));
      expect(marca.slug).toBe('hyundai-motors');
      expect(await errorOf(catalog().createMake('hyundai motors'))).toBe('Ese registro ya existe.');

      const modelo = await firstValueFrom(catalog().createModel(marca.id, 'Elantra N'));
      expect(modelo).toMatchObject({ makeId: marca.id, slug: 'elantra-n' });
      expect(await errorOf(catalog().createModel(marca.id, 'ELANTRA N'))).toBe('Ese registro ya existe.');
    });

    it('un nombre sin letras ni numeros no se acepta', async () => {
      expect(await errorOf(catalog().createMake('!!!'))).toBe('La marca necesita un nombre.');
      expect(await errorOf(catalog().createModel(1, '---'))).toBe('El modelo necesita un nombre.');
    });

    it('la compatibilidad se lee de los mocks y se reemplaza entera al guardar', async () => {
      const inicial = await firstValueFrom(catalog().getFitments(2));
      expect(inicial.length).toBe(2);

      const honda = make('honda').id;
      await firstValueFrom(
        catalog().replaceFitments(2, [{ makeId: honda, modelId: null, yearFrom: null, yearTo: null }]),
      );

      expect(await firstValueFrom(catalog().getFitments(2))).toEqual([
        { makeId: honda, modelId: null, yearFrom: null, yearTo: null },
      ]);
    });

    it('las opciones del panel traen también las apagadas y se leen de los mocks', async () => {
      const v = await firstValueFrom(catalog().getVariants(8));
      expect(v.map((x) => [x.name, x.stock, x.isActive])).toEqual([['Negro', 8, true], ['Gris', 5, true], ['Beige', 3, true]]);
      expect(await firstValueFrom(catalog().getVariants(1))).toEqual([]);
    });

    it('guardar las opciones las reemplaza, asigna id a las nuevas y respeta el orden', async () => {
      const base = await firstValueFrom(catalog().getVariants(8));
      const lista = [
        { ...base[2], stock: 9 },
        { id: null, name: 'Rojo', sku: '', imageUrls: [], stock: 1, isActive: true },
      ];

      const r = await firstValueFrom(catalog().saveVariants(8, lista, base));

      expect(r.deactivated).toEqual([]);
      const despues = await firstValueFrom(catalog().getVariants(8));
      expect(despues.map((x) => [x.name, x.stock])).toEqual([['Beige', 9], ['Rojo', 1]]);
      expect(despues[1].id).not.toBeNull();
    });

    it('las fotos de una opción se guardan en orden y se vuelven a leer, y quitarlas la deja vacía', async () => {
      const base = await firstValueFrom(catalog().getVariants(8));
      expect(base.every((x) => x.imageUrls.length === 0)).toBe(true);

      await firstValueFrom(
        catalog().saveVariants(8, base.map((x, i) => (i === 0 ? { ...x, imageUrls: ['assets/imgs/negro.jpg', 'assets/imgs/negro-2.jpg'] } : x)), base),
      );
      const con = await firstValueFrom(catalog().getVariants(8));
      expect(con.map((x) => x.imageUrls)).toEqual([['assets/imgs/negro.jpg', 'assets/imgs/negro-2.jpg'], [], []]);

      await firstValueFrom(catalog().saveVariants(8, con.map((x) => ({ ...x, imageUrls: [] })), con));
      expect((await firstValueFrom(catalog().getVariants(8))).every((x) => x.imageUrls.length === 0)).toBe(true);
    });

    it('no se guarda una opción con una foto repetida ni con más de 8', async () => {
      const una = { id: null, name: 'A', sku: '', stock: 1, isActive: true };

      expect(await errorOf(catalog().saveVariants(8, [{ ...una, imageUrls: ['x.jpg', 'x.jpg'] }], []))).toBe('La opción "A" tiene una foto repetida.');
      expect(
        await errorOf(catalog().saveVariants(8, [{ ...una, imageUrls: Array.from({ length: 9 }, (_, i) => `${i}.jpg`) }], [])),
      ).toBe('La opción "A" tiene demasiadas fotos (máximo 8).');
    });

    it('una lista con problemas no se guarda y dice cuál es', async () => {
      expect(
        await errorOf(
          catalog().saveVariants(8, [
            { id: null, name: 'A', sku: '', imageUrls: [], stock: 1, isActive: true },
            { id: null, name: 'a', sku: '', imageUrls: [], stock: 1, isActive: true },
          ], []),
        ),
      ).toBe('Hay dos opciones llamadas "a".');
    });

    it('guardar una lista vacia quita las opciones del producto', async () => {
      const base = await firstValueFrom(catalog().getVariants(8));
      await firstValueFrom(catalog().saveVariants(8, [], base));
      expect(await firstValueFrom(catalog().getVariants(8))).toEqual([]);
    });

    it('guardar una lista vacia deja al producto sin compatibilidad', async () => {
      await firstValueFrom(catalog().replaceFitments(2, []));
      expect(await firstValueFrom(catalog().getFitments(2))).toEqual([]);
    });

    it('los duplicados exactos se quitan antes de guardar', async () => {
      const f = { makeId: 1, modelId: 5, yearFrom: 2010, yearTo: 2020 };
      await firstValueFrom(catalog().replaceFitments(3, [f, { ...f }, { ...f, yearTo: 2021 }]));
      expect((await firstValueFrom(catalog().getFitments(3))).length).toBe(2);
    });
  });

  describe('ProductService: lo que pide el home', () => {
    const products = () => TestBed.inject(ProductService);

    it('las ofertas son los productos con precio anterior, y solo esos', async () => {
      const offers = await firstValueFrom(products().getOffers());

      expect(offers.length).toBe(6);
      expect(offers.every((p) => p.compareAtPrice !== null && p.compareAtPrice > p.price)).toBe(true);
    });

    it('respeta el limite', async () => {
      expect((await firstValueFrom(products().getOffers(2))).length).toBe(2);
      expect((await firstValueFrom(products().getBestSellers(3))).length).toBe(3);
      expect((await firstValueFrom(products().getNewArrivals(5))).length).toBe(5);
    });

    it('los mas vendidos van de mayor a menor y solo entran los que vendieron algo', async () => {
      const best = await firstValueFrom(products().getBestSellers(100));
      const sold = best.map((p) => p.soldCount);

      expect(sold).toEqual([...sold].sort((a, b) => b - a));
      expect(sold.every((n) => n > 0)).toBe(true);
      expect(best[0].id).toBe(4); // el aceite, con 210
    });

    it('lo nuevo empieza por el ultimo que se cargo', async () => {
      const fresh = await firstValueFrom(products().getNewArrivals(3));
      // Misma fecha en el mock: desempata el id mayor. La pieza 36 es de prueba y no se ve.
      expect(fresh.map((p) => p.id)).toEqual([35, 34, 33]);
    });

    it('un admin ve en lo nuevo la pieza de prueba, un visitante no', async () => {
      expect((await firstValueFrom(products().getNewArrivals(1)))[0].id).toBe(35);

      user.set({ ...BASE, role: 'admin', isAdmin: true });
      expect((await firstValueFrom(products().getNewArrivals(1)))[0].id).toBe(36);
    });
  });

  describe('HubMarketService.getLatestVehicles', () => {
    it('devuelve tres vehiculos aprobados, el mas reciente primero, sin las pendientes', async () => {
      const { HubMarketService } = await import('./hub-market.service');
      const latest = await firstValueFrom(TestBed.inject(HubMarketService).getLatestVehicles());

      expect(latest.length).toBe(3);
      expect(latest.every((i) => i.category === 'vehiculos')).toBe(true);
      const dates = latest.map((i) => i.createdAt ?? '');
      expect(dates).toEqual([...dates].sort().reverse());
    });

    it('respeta el limite', async () => {
      const { HubMarketService } = await import('./hub-market.service');
      expect((await firstValueFrom(TestBed.inject(HubMarketService).getLatestVehicles(1))).length).toBe(1);
    });
  });

  describe('VehicleService.selectedLabel', () => {
    const vehicles = () => TestBed.inject(VehicleService);

    it('sin vehiculo no hay etiqueta', () => {
      expect(vehicles().selectedLabel()).toBeNull();
    });

    it('con vehiculo dice marca, modelo y ano', () => {
      vehicles().select({ makeId: make('toyota').id, modelId: model('toyota', 'corolla').id, year: 2015 });
      TestBed.tick();

      expect(vehicles().selectedLabel()).toBe('Toyota Corolla 2015');
    });

    it('se actualiza al cambiar de vehiculo y se borra al quitarlo', () => {
      vehicles().select({ makeId: make('toyota').id, modelId: model('toyota', 'corolla').id, year: 2015 });
      TestBed.tick();
      vehicles().select({ makeId: make('honda').id, modelId: model('honda', 'civic').id, year: 2018 });
      TestBed.tick();
      expect(vehicles().selectedLabel()).toBe('Honda Civic 2018');

      vehicles().clear();
      TestBed.tick();
      expect(vehicles().selectedLabel()).toBeNull();
    });

    it('un vehiculo guardado con ids que ya no existen deja la etiqueta nula, no "Marca 7"', () => {
      localStorage.setItem(GUEST_VEHICLE_KEY, JSON.stringify({ makeId: 9999, modelId: 1, year: 2015 }));
      TestBed.tick();
      expect(vehicles().selectedLabel()).toBeNull();

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: AuthService, useValue: { user } },
          { provide: ToastService, useValue: toast },
        ],
      });
      localStorage.setItem(GUEST_VEHICLE_KEY, JSON.stringify({ makeId: make('toyota').id, modelId: 9999, year: 2015 }));
      TestBed.inject(VehicleService);
      TestBed.tick();
      expect(TestBed.inject(VehicleService).selectedLabel()).toBeNull();
    });
  });

  describe('dedupeFitments', () => {
    it('conserva el orden y no toca los parecidos', () => {
      const a = { makeId: 1, modelId: null, yearFrom: null, yearTo: null };
      const b = { makeId: 1, modelId: 2, yearFrom: null, yearTo: null };
      expect(dedupeFitments([a, b, { ...a }, { ...b }])).toEqual([a, b]);
    });

    it('un nulo y un cero no son lo mismo', () => {
      const a = { makeId: 1, modelId: null, yearFrom: null, yearTo: null };
      const b = { makeId: 1, modelId: 0, yearFrom: null, yearTo: null };
      expect(dedupeFitments([a, b]).length).toBe(2);
    });
  });
});
