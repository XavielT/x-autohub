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
