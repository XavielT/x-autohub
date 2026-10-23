import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { CartService, CartItem, lineName, lineStock } from './cart.service';
import { ProductService } from './product.service';
import { AuthService } from './auth.service';
import { ProductModel, ProductVariantModel } from '../models/product.model';
import { makeProduct } from '../testing/product.fixture';

const STORAGE_KEY = 'x-autohub.cart';

function pieza(id: number, price: number, name = `Pieza ${id}`): ProductModel {
  return makeProduct({ id, price, name, brand: 'Brembo', imgUrl: 'assets/imgs/pieza.jpg', starsRating: 4.5, description: 'x' });
}

/**
 * El carrito, y sobre todo que **sobreviva a una recarga**.
 *
 * Vivía solo en memoria: un F5, un enlace compartido o volver desde otra pestaña
 * lo dejaba vacío, que para una tienda es una venta perdida (punto 3.5 del
 * ROADMAP). Guardarlo no era todo el trabajo — lo guardado envejece, y el precio
 * que se cobra lo recalcula Postgres (`create_order()`, migración 0005). Si el
 * carrito mostrara el precio de ayer, alguien vería RD$ 2,850 y le cobrarían
 * RD$ 3,100.
 *
 * De ahí que la mitad de estas pruebas no sean sobre guardar, sino sobre poner
 * al día lo guardado.
 */
describe('CartService', () => {
  class FakeParts {
    catalog: ProductModel[] = [pieza(1, 12950), pieza(2, 2850)];
    /** Las opciones activas de los productos que las tienen. */
    variants: ProductVariantModel[] = [];
    fail = false;
    llamadas = 0;

    getVariantsFor(ids: readonly number[]): Observable<ProductVariantModel[]> {
      return of(this.variants.filter((v) => ids.includes(v.productId)));
    }

    getAll(): Observable<ProductModel[]> {
      this.llamadas++;
      return this.fail ? throwError(() => new Error('sin red')) : of(this.catalog);
    }
  }

  class FakeAuth {
    /** Se resuelve a mano cuando una prueba quiera controlar el orden. */
    private resolver: (() => void) | null = null;
    readonly ready: Promise<void>;

    constructor(autoResolve = true) {
      this.ready = autoResolve
        ? Promise.resolve()
        : new Promise<void>((resolve) => (this.resolver = resolve));
    }

    whenReady(): Promise<void> {
      return this.ready;
    }

    resolverSesion(): void {
      this.resolver?.();
    }

    user() {
      return null;
    }
  }

  let parts: FakeParts;
  let auth: FakeAuth;

  function montar(autoResolveSession = true): CartService {
    parts = new FakeParts();
    auth = new FakeAuth(autoResolveSession);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ProductService, useValue: parts as unknown as ProductService },
        { provide: AuthService, useValue: auth as unknown as AuthService },
      ],
    });

    return TestBed.inject(CartService);
  }

  /** Deja correr los `effect` (la escritura) y las promesas (la reconciliación). */
  async function asentar(): Promise<void> {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    TestBed.tick();
  }

  const guardado = (): CartItem[] | null => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as { items: CartItem[] }).items : null;
  };

  const sembrar = (items: CartItem[], v = 1) =>
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v, items }));

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('should be created', () => {
    expect(montar()).toBeTruthy();
  });

  describe('sobrevivir a una recarga', () => {
    it('lo agregado sigue ahi en la instancia siguiente', async () => {
      const cart = montar();
      cart.addToCart(pieza(1, 12950));
      cart.addToCart(pieza(1, 12950));
      cart.addToCart(pieza(2, 2850));
      await asentar();

      // Instancia nueva = lo que pasa al recargar la pagina.
      const recargado = montar();

      expect(recargado.totalItems()).toBe(3);
      expect(recargado.items().map((i) => [i.part.id, i.quantity])).toEqual([
        [1, 2],
        [2, 1],
      ]);
      expect(recargado.totalPrice()).toBe(12950 * 2 + 2850);
    });

    it('un carrito vacio no deja basura en el navegador', async () => {
      const cart = montar();
      cart.addToCart(pieza(1, 12950));
      await asentar();
      expect(guardado()).not.toBeNull();

      cart.clearCart();
      await asentar();

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(montar().items()).toEqual([]);
    });

    it('quitar una pieza tambien se guarda', async () => {
      const cart = montar();
      cart.addToCart(pieza(1, 12950));
      cart.addToCart(pieza(2, 2850));
      await asentar();

      cart.removeFromCart(1);
      await asentar();

      expect(montar().items().map((i) => i.part.id)).toEqual([2]);
    });
  });

  describe('poner al dia lo guardado', () => {
    it('el precio sale del catalogo, no del navegador', async () => {
      // El precio subio en el panel mientras el carrito esperaba guardado.
      sembrar([{ part: pieza(1, 2850, 'Nombre viejo'), quantity: 2, variant: null }]);

      const cart = montar();
      parts.catalog = [pieza(1, 3100, 'Nombre nuevo')];
      await asentar();

      expect(cart.items()[0].part.price).toBe(3100);
      expect(cart.items()[0].part.name).toBe('Nombre nuevo');
      // La cantidad es del usuario: esa no se toca.
      expect(cart.items()[0].quantity).toBe(2);
      expect(cart.totalPrice()).toBe(6200);
    });

    it('la pieza que ya no esta en el catalogo se cae del carrito', async () => {
      sembrar([
        { part: pieza(1, 12950), quantity: 1, variant: null },
        { part: pieza(99, 500), quantity: 1, variant: null },
      ]);

      const cart = montar();
      await asentar();

      // 99 no esta en el catalogo: desactivada, borrada o marcada como de
      // prueba. `create_order()` la rechazaria igual.
      expect(cart.items().map((i) => i.part.id)).toEqual([1]);
      expect(guardado()?.map((i) => i.part.id)).toEqual([1]);
    });

    it('si el catalogo no responde, el carrito se queda como estaba', async () => {
      sembrar([{ part: pieza(1, 2850), quantity: 3, variant: null }]);

      const cart = montar();
      parts.fail = true;
      await asentar();

      // Mejor un precio de ayer que un carrito vacio por un fallo de red — y de
      // todos modos el precio que se cobra lo pone Postgres.
      expect(cart.items().length).toBe(1);
      expect(cart.items()[0].quantity).toBe(3);
    });

    it('no molesta al catalogo si no hay nada guardado', async () => {
      montar();
      await asentar();

      expect(parts.llamadas).toBe(0);
    });

    it('espera a que la sesion este lista antes de reconciliar', async () => {
      // La visibilidad del contenido de prueba depende de la sesion, y con
      // Supabase se restaura de forma asincrona: reconciliar antes le quitaria
      // su pieza marcada a un usuario de prueba que acaba de recargar.
      sembrar([{ part: pieza(1, 2850), quantity: 1, variant: null }]);

      montar(false);
      await asentar();
      expect(parts.llamadas).toBe(0);

      auth.resolverSesion();
      await asentar();
      expect(parts.llamadas).toBe(1);
    });
  });

  describe('no se cree lo que haya en el navegador', () => {
    it('JSON corrupto', () => {
      localStorage.setItem(STORAGE_KEY, 'no-es-json{');
      expect(montar().items()).toEqual([]);
    });

    it('una version que no es la de hoy', () => {
      sembrar([{ part: pieza(1, 12950), quantity: 1, variant: null }], 99);
      expect(montar().items()).toEqual([]);
    });

    it('cantidades imposibles', () => {
      sembrar([
        { part: pieza(1, 12950), quantity: -3, variant: null },
        { part: pieza(2, 2850), quantity: 2.7, variant: null },
        { part: pieza(3, 500), quantity: Number.NaN, variant: null },
      ]);

      const cart = montar();

      // -3 y NaN se descartan; 2.7 se corta a 2. Sin esto, un `quantity` editado
      // a mano entraria en el total y llegaria al pedido.
      expect(cart.items().map((i) => [i.part.id, i.quantity])).toEqual([[2, 2]]);
    });

    it('una entrada sin pieza', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ v: 1, items: [{ quantity: 1 }, null, { part: {}, quantity: 1 }] }),
      );

      expect(montar().items()).toEqual([]);
    });
  });

  describe('cantidades y existencias (fase 4)', () => {
    it('cambia la cantidad de una pieza', () => {
      const cart = montar();
      cart.addToCart(makeProduct({ id: 5, stock: 10 }));

      cart.setQuantity(5, 4);

      expect(cart.items()[0].quantity).toBe(4);
      expect(cart.totalItems()).toBe(4);
    });

    it('cero o menos la quita', () => {
      const cart = montar();
      cart.addToCart(makeProduct({ id: 5 }));

      cart.setQuantity(5, 0);

      expect(cart.items()).toEqual([]);
    });

    it('lo de inventario propio no pasa de lo que queda', () => {
      const cart = montar();
      cart.addToCart(makeProduct({ id: 5, stock: 3 }));

      cart.setQuantity(5, 9);

      expect(cart.items()[0].quantity).toBe(3);
    });

    it('lo bajo pedido no tiene tope: no depende de existencias', () => {
      const cart = montar();
      cart.addToCart(makeProduct({ id: 5, fulfillment: 'on_order', leadTimeDays: 10, stock: 0 }));

      cart.setQuantity(5, 9);

      expect(cart.items()[0].quantity).toBe(9);
    });

    it('stockIssues lista las líneas que piden más de lo que hay, y no cuenta lo bajo pedido', () => {
      const cart = montar();
      cart.addToCart(makeProduct({ id: 1, name: 'Disco', stock: 1 }));
      cart.addToCart(makeProduct({ id: 1, name: 'Disco', stock: 1 }));
      cart.addToCart(makeProduct({ id: 2, name: 'Agotada', stock: 0 }));
      cart.addToCart(makeProduct({ id: 3, fulfillment: 'on_order', leadTimeDays: 5, stock: 0 }));

      expect(cart.stockIssues().map((i) => [i.part.name, i.quantity, i.available])).toEqual([
        ['Disco', 2, 1],
        ['Agotada', 1, 0],
      ]);
    });

    it('refresh() vuelve a leer el stock del catálogo: lo que bajó desde la última visita se avisa', async () => {
      sembrar([{ part: makeProduct({ id: 1, stock: 10 }), quantity: 3, variant: null }]);
      const cart = montar();
      await asentar();
      expect(cart.stockIssues()).toEqual([]);

      parts.catalog = [makeProduct({ id: 1, stock: 1 })];
      await cart.refresh();

      expect(cart.stockIssues().map((i) => [i.quantity, i.available])).toEqual([[3, 1]]);
    });
  });

  describe('opciones: color, talla…', () => {
    const alfombra = (over: Partial<ProductModel> = {}) =>
      makeProduct({ id: 8, name: 'Alfombras', hasVariants: true, variantLabel: 'Color', stock: 8, ...over });
    const opcion = (id: number, name: string, stock: number, productId = 8): ProductVariantModel => ({
      id, productId, name, sku: null, stock, sortOrder: id, isActive: true,
    });

    it('un producto con opciones no se agrega sin elegir una', () => {
      const cart = montar();

      expect(cart.addToCart(alfombra())).toBe(false);
      expect(cart.items()).toEqual([]);
    });

    it('con la opción elegida se agrega, y la línea la recuerda', () => {
      const cart = montar();
      const negro = opcion(1, 'Negro', 5);

      expect(cart.addToCart(alfombra(), negro)).toBe(true);

      expect(cart.items()[0].variant).toEqual(negro);
      expect(lineName(cart.items()[0])).toBe('Alfombras · Negro');
    });

    it('el mismo producto en dos opciones son dos líneas; en la misma, una con más cantidad', () => {
      const cart = montar();
      cart.addToCart(alfombra(), opcion(1, 'Negro', 5));
      cart.addToCart(alfombra(), opcion(2, 'Gris', 5));
      cart.addToCart(alfombra(), opcion(1, 'Negro', 5));

      expect(cart.items().map((i) => [i.variant?.name, i.quantity])).toEqual([['Negro', 2], ['Gris', 1]]);
    });

    it('un producto sin opciones ignora la que le pasen', () => {
      const cart = montar();
      cart.addToCart(makeProduct({ id: 5 }), opcion(1, 'Negro', 5));

      expect(cart.items()[0].variant).toBeNull();
    });

    it('el stock que cuenta es el de la opción, no el del producto', () => {
      const cart = montar();
      cart.addToCart(alfombra({ stock: 8 }), opcion(1, 'Negro', 2));

      cart.setQuantity(8, 9, 1);

      expect(lineStock(cart.items()[0])).toBe(2);
      expect(cart.items()[0].quantity).toBe(2);
    });

    it('cambiar la cantidad o quitar una línea no toca la otra opción del mismo producto', () => {
      const cart = montar();
      cart.addToCart(alfombra(), opcion(1, 'Negro', 5));
      cart.addToCart(alfombra(), opcion(2, 'Gris', 5));

      cart.setQuantity(8, 3, 2);
      cart.removeFromCart(8, 1);

      expect(cart.items().map((i) => [i.variant?.name, i.quantity])).toEqual([['Gris', 3]]);
    });

    it('stockIssues dice cuál opción se pasa', () => {
      const cart = montar();
      cart.addToCart(alfombra(), opcion(1, 'Negro', 1));
      cart.addToCart(alfombra(), opcion(1, 'Negro', 1));

      expect(cart.stockIssues().map((i) => [i.variant?.name, i.quantity, i.available])).toEqual([['Negro', 2, 1]]);
    });

    it('refresh() pone al día el stock de la opción', async () => {
      sembrar([{ part: alfombra(), quantity: 2, variant: opcion(1, 'Negro', 9) }]);
      const cart = montar();
      parts.catalog = [alfombra({ stock: 3 })];
      parts.variants = [opcion(1, 'Negro', 3), opcion(2, 'Gris', 0)];
      await asentar();

      expect(cart.items()[0].variant?.stock).toBe(3);
    });

    it('refresh() quita la línea cuya opción ya no se ofrece', async () => {
      sembrar([{ part: alfombra(), quantity: 1, variant: opcion(3, 'Beige', 4) }]);
      const cart = montar();
      parts.catalog = [alfombra()];
      parts.variants = [opcion(1, 'Negro', 3)];
      await asentar();

      expect(cart.items()).toEqual([]);
    });

    it('refresh() quita una línea guardada sin opción si el producto ahora las tiene', async () => {
      sembrar([{ part: makeProduct({ id: 8, name: 'Alfombras' }), quantity: 1, variant: null }]);
      const cart = montar();
      parts.catalog = [alfombra()];
      parts.variants = [opcion(1, 'Negro', 3)];
      await asentar();

      expect(cart.items()).toEqual([]);
    });

    it('un carrito guardado antes de las opciones (sin el campo) se lee sin romperse', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ v: 1, items: [{ part: pieza(1, 12950), quantity: 2 }] }),
      );

      const cart = montar();

      expect(cart.items()[0].variant).toBeNull();
      expect(cart.items()[0].quantity).toBe(2);
    });

    it('la opción se guarda y vuelve tras una recarga', async () => {
      const cart = montar();
      cart.addToCart(alfombra(), opcion(2, 'Gris', 5));
      await asentar();

      const recargado = montar();

      expect(recargado.items()[0].variant?.name).toBe('Gris');
    });
  });
});
