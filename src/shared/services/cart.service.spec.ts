import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { CartService, CartItem } from './cart.service';
import { HubPartService } from './hub-part.service';
import { AuthService } from './auth.service';
import { HubPartModel } from '../models/hub-part.model';

const STORAGE_KEY = 'x-autohub.cart';

function pieza(id: number, price: number, name = `Pieza ${id}`): HubPartModel {
  return {
    id,
    category: 'frenos',
    imgUrl: 'assets/imgs/pieza.jpg',
    name,
    brand: 'Brembo',
    starsRating: 4.5,
    price,
    description: 'x',
  };
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
    catalog: HubPartModel[] = [pieza(1, 12950), pieza(2, 2850)];
    fail = false;
    llamadas = 0;

    getAll(): Observable<HubPartModel[]> {
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
        { provide: HubPartService, useValue: parts as unknown as HubPartService },
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
      sembrar([{ part: pieza(1, 2850, 'Nombre viejo'), quantity: 2 }]);

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
        { part: pieza(1, 12950), quantity: 1 },
        { part: pieza(99, 500), quantity: 1 },
      ]);

      const cart = montar();
      await asentar();

      // 99 no esta en el catalogo: desactivada, borrada o marcada como de
      // prueba. `create_order()` la rechazaria igual.
      expect(cart.items().map((i) => i.part.id)).toEqual([1]);
      expect(guardado()?.map((i) => i.part.id)).toEqual([1]);
    });

    it('si el catalogo no responde, el carrito se queda como estaba', async () => {
      sembrar([{ part: pieza(1, 2850), quantity: 3 }]);

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
      sembrar([{ part: pieza(1, 2850), quantity: 1 }]);

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
      sembrar([{ part: pieza(1, 12950), quantity: 1 }], 99);
      expect(montar().items()).toEqual([]);
    });

    it('cantidades imposibles', () => {
      sembrar([
        { part: pieza(1, 12950), quantity: -3 },
        { part: pieza(2, 2850), quantity: 2.7 },
        { part: pieza(3, 500), quantity: Number.NaN },
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
});
