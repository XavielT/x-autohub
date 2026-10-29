import { HUB_PART_MOCK } from './hub-part.mock';
import { PRODUCT_FITMENTS_MOCK, PRODUCT_FITMENT_SEEDS } from './product-fitment.mock';
import { LEGACY_CATEGORY_TO_SLUG, PRODUCT_CATEGORIES_MOCK } from './product-category.mock';
import { VEHICLE_MAKES_MOCK, VEHICLE_MODELS_MOCK } from './vehicle.mock';
import { SERVICES_MOCK } from './service.mock';

/**
 * Coherencia de los mocks de la tienda.
 *
 * No prueban código: prueban que los datos de prueba no se contradigan, porque de
 * ellos sale el seed (`scripts/generate-seed.mjs`) y es lo que se ve en el modo
 * mock. Un fitment que apunta a una marca que no existe, o un artículo bajo
 * pedido sin plazo, es un dato imposible: la base lo rechazaría con un check, y
 * el mock lo dejaría pasar y mostraría algo que nunca vería el sitio real.
 */
describe('mocks de la tienda', () => {
  describe('productos', () => {
    it('hay uno por cada pieza del catálogo anterior', () => {
      expect(HUB_PART_MOCK.length).toBe(36);
    });

    it('cada slug y cada sku es único, con la forma que genera la base', () => {
      const slugs = new Set(HUB_PART_MOCK.map((p) => p.slug));
      const skus = new Set(HUB_PART_MOCK.map((p) => p.sku));
      expect(slugs.size).toBe(HUB_PART_MOCK.length);
      expect(skus.size).toBe(HUB_PART_MOCK.length);

      for (const p of HUB_PART_MOCK) {
        expect(p.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(p.slug.endsWith(`-${p.id}`)).toBe(true);
        expect(p.sku).toBe(`XAH-${String(p.id).padStart(6, '0')}`);
      }
    });

    it('una oferta siempre cuesta menos que el precio anterior', () => {
      const conOferta = HUB_PART_MOCK.filter((p) => p.compareAtPrice !== null);
      expect(conOferta.length).toBeGreaterThan(0);
      for (const p of conOferta) expect(p.compareAtPrice as number).toBeGreaterThan(p.price);
    });

    it('un artículo bajo pedido dice cuanto tarda, y uno de stock no', () => {
      const bajoPedido = HUB_PART_MOCK.filter((p) => p.fulfillment === 'on_order');
      expect(bajoPedido.length).toBeGreaterThan(0);
      for (const p of bajoPedido) expect(p.leadTimeDays).toBeGreaterThan(0);
      for (const p of HUB_PART_MOCK.filter((x) => x.fulfillment === 'stock')) {
        expect(p.leadTimeDays).toBeNull();
      }
    });

    it('una pieza es instalable solo si trae su servicio, y el servicio existe', () => {
      const ids = new Set(SERVICES_MOCK.map((s) => s.id));
      for (const p of HUB_PART_MOCK) {
        expect(p.installable).toBe(p.installationServiceId !== null);
        if (p.installationServiceId !== null) expect(ids.has(p.installationServiceId)).toBe(true);
      }
    });

    it('la mezcla del mock cubre todos los casos que la interfaz tiene que dibujar', () => {
      const has = (f: (p: (typeof HUB_PART_MOCK)[number]) => boolean) => HUB_PART_MOCK.some(f);
      expect(has((p) => p.fulfillment === 'stock' && p.stock > 0)).toBe(true);
      expect(has((p) => p.fulfillment === 'stock' && p.stock === 0)).toBe(true); // agotado
      expect(has((p) => p.fulfillment === 'on_order')).toBe(true);
      expect(has((p) => p.fitmentType === 'universal')).toBe(true);
      expect(has((p) => p.fitmentType === 'specific')).toBe(true);
      expect(has((p) => p.compareAtPrice !== null)).toBe(true);
      expect(has((p) => p.installable)).toBe(true);
      expect(has((p) => p.isFeatured)).toBe(true);
    });

    it('las especificaciones son pares de texto', () => {
      for (const p of HUB_PART_MOCK) {
        for (const [k, v] of Object.entries(p.specs)) {
          expect(typeof k).toBe('string');
          expect(typeof v).toBe('string');
        }
      }
    });
  });

  describe('categorias', () => {
    it('son las 12 de primer nivel del plan, con slugs unicos', () => {
      expect(PRODUCT_CATEGORIES_MOCK.length).toBe(12);
      expect(PRODUCT_CATEGORIES_MOCK.every((c) => c.parentId === null)).toBe(true);
      expect(new Set(PRODUCT_CATEGORIES_MOCK.map((c) => c.slug)).size).toBe(12);
    });

    it('las 17 categorías de texto de antes se mapean, y ninguna a una categoría que no existe', () => {
      const slugs = new Set(PRODUCT_CATEGORIES_MOCK.map((c) => c.slug));
      expect(Object.keys(LEGACY_CATEGORY_TO_SLUG).length).toBe(17);
      for (const target of Object.values(LEGACY_CATEGORY_TO_SLUG)) expect(slugs.has(target)).toBe(true);
    });

    it('cada producto esta clasificado en una categoría que existe', () => {
      const ids = new Set(PRODUCT_CATEGORIES_MOCK.map((c) => c.id));
      for (const p of HUB_PART_MOCK) {
        expect(p.categoryId, p.name).not.toBeNull();
        expect(ids.has(p.categoryId as number), p.name).toBe(true);
      }
    });
  });

  describe('vehiculos', () => {
    // Estas cifras son las de la semilla de la migracion 0017, que
    // scripts/verify-migrations.sh comprueba por su lado (35 marcas, 88 modelos).
    it('son las 35 marcas y los 88 modelos de la semilla', () => {
      expect(VEHICLE_MAKES_MOCK.length).toBe(35);
      expect(VEHICLE_MODELS_MOCK.length).toBe(88);
    });

    it('los slugs son unicos: por marca y, dentro de cada marca, por modelo', () => {
      expect(new Set(VEHICLE_MAKES_MOCK.map((m) => m.slug)).size).toBe(35);
      const pairs = VEHICLE_MODELS_MOCK.map((m) => `${m.makeId}/${m.slug}`);
      expect(new Set(pairs).size).toBe(VEHICLE_MODELS_MOCK.length);
    });

    it('todo modelo pertenece a una marca que existe', () => {
      const makeIds = new Set(VEHICLE_MAKES_MOCK.map((m) => m.id));
      for (const m of VEHICLE_MODELS_MOCK) expect(makeIds.has(m.makeId)).toBe(true);
    });
  });

  describe('compatibilidad', () => {
    it('cada fitment apunta a un producto especifico, una marca y un modelo de esa marca', () => {
      const productos = new Map(HUB_PART_MOCK.map((p) => [p.id, p]));
      for (const f of PRODUCT_FITMENTS_MOCK) {
        expect(productos.get(f.productId)?.fitmentType).toBe('specific');
        expect(VEHICLE_MAKES_MOCK.some((m) => m.id === f.makeId)).toBe(true);
        if (f.modelId !== null) {
          expect(VEHICLE_MODELS_MOCK.find((m) => m.id === f.modelId)?.makeId).toBe(f.makeId);
        }
        if (f.yearFrom !== null && f.yearTo !== null) expect(f.yearFrom).toBeLessThanOrEqual(f.yearTo);
      }
    });

    it('un universal no trae compatibilidad', () => {
      const universales = new Set(HUB_PART_MOCK.filter((p) => p.fitmentType === 'universal').map((p) => p.id));
      for (const f of PRODUCT_FITMENTS_MOCK) expect(universales.has(f.productId)).toBe(false);
    });

    it('hay especificos sin compatibilidad cargada, para que la ficha diga "Consultar compatibilidad"', () => {
      const conFitments = new Set(PRODUCT_FITMENTS_MOCK.map((f) => f.productId));
      const sinFitments = HUB_PART_MOCK.filter((p) => p.fitmentType === 'specific' && !conFitments.has(p.id));
      expect(sinFitments.map((p) => p.id)).toEqual([1, 13]);
    });

    it('no hay dos fitments identicos (el indice único de la base los rechazaria)', () => {
      const keys = PRODUCT_FITMENTS_MOCK.map((f) =>
        [f.productId, f.makeId, f.modelId ?? '', f.yearFrom ?? '', f.yearTo ?? ''].join('|'),
      );
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('los fitments del seed y los del mock son los mismos', () => {
      expect(PRODUCT_FITMENTS_MOCK.length).toBe(PRODUCT_FITMENT_SEEDS.length);
    });
  });
});
