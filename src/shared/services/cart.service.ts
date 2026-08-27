import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HubPartModel } from '../models/hub-part.model';
import { HubPartService } from './hub-part.service';
import { AuthService } from './auth.service';

export interface CartItem {
  part: HubPartModel;
  quantity: number;
}

/** Donde vive el carrito entre visitas. Mismo prefijo que las otras claves. */
const STORAGE_KEY = 'x-autohub.cart';

/**
 * Versión del formato guardado. Si algún día cambia la forma de `CartItem`, se
 * sube este número y lo viejo se descarta en vez de leerse mal.
 */
const STORAGE_VERSION = 1;

interface StoredCart {
  v: number;
  items: CartItem[];
}

/**
 * El carrito del catálogo.
 *
 * **Sobrevive a una recarga.** Antes vivía solo en memoria, así que un F5, un
 * enlace compartido o volver desde otra pestaña dejaba el carrito vacío — para
 * una tienda eso es una venta perdida sin más (era el punto 3.5 del ROADMAP).
 *
 * Guardar y volver a leer no alcanza, y por eso esto no son cuatro líneas de
 * `localStorage`: lo guardado envejece. El precio de una pieza puede cambiar en
 * el panel, y una pieza puede desactivarse o marcarse como de prueba mientras el
 * carrito espera en el navegador de alguien. Así que al arrancar se hacen dos
 * cosas, en este orden:
 *
 *   1. **Se pinta lo guardado enseguida**, para que el contador del navbar no
 *      parpadee en 0 mientras llega el catálogo.
 *   2. **Se reconcilia contra el catálogo**: cada pieza toma su nombre y su
 *      precio de la base, y la que ya no está en el catálogo se cae del carrito.
 *
 * El paso 2 importa más de lo que parece: `create_order()` **recalcula los
 * precios en Postgres** (migración 0005), así que un precio viejo en pantalla no
 * se cobra — se cobra el nuevo. Sin reconciliar, alguien podría ver RD$ 2,850 en
 * el carrito y que le cobren RD$ 3,100, que es exactamente la clase de sorpresa
 * que hace que no vuelvan.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly parts = inject(HubPartService);
  private readonly auth = inject(AuthService);

  private readonly _items = signal<CartItem[]>(readStoredCart());
  private readonly _isOpen = signal<boolean>(false);

  readonly items = this._items.asReadonly();
  readonly isOpen = this._isOpen.asReadonly();

  readonly totalItems = computed(() =>
    this._items().reduce((acc, item) => acc + item.quantity, 0),
  );

  readonly totalPrice = computed(() =>
    this._items().reduce((acc, item) => acc + item.part.price * item.quantity, 0),
  );

  constructor() {
    // Un `effect` y no un `persist()` en cada método: así el próximo método que
    // toque el carrito no puede olvidarse de guardar.
    effect(() => writeStoredCart(this._items()));

    void this.reconcileWithCatalog();
  }

  addToCart(part: HubPartModel): void {
    const current = this._items();
    const existing = current.find((i) => i.part.id === part.id);

    if (existing) {
      this._items.set(
        current.map((i) => (i.part.id === part.id ? { ...i, quantity: i.quantity + 1 } : i)),
      );
    } else {
      this._items.set([...current, { part, quantity: 1 }]);
    }
  }

  removeFromCart(partId: number): void {
    this._items.set(this._items().filter((i) => i.part.id !== partId));
  }

  toggleCart(): void {
    this._isOpen.set(!this._isOpen());
  }

  closePanel(): void {
    this._isOpen.set(false);
  }

  clearCart(): void {
    this._items.set([]);
  }

  /**
   * Pone al día lo que se leyó del navegador.
   *
   * Espera a `auth.whenReady()` porque la visibilidad del contenido de prueba
   * depende de la sesión, y con Supabase la sesión se restaura de forma
   * asíncrona: reconciliar antes le tiraría del carrito su pieza marcada a un
   * usuario de prueba que acaba de recargar. Es la misma trampa que documenta
   * CLAUDE.md para los guards.
   *
   * Si el catálogo no se puede leer (sin red, por ejemplo) **no se toca nada**:
   * mejor un carrito con precios de ayer que un carrito vacío por un fallo de
   * red, y de todos modos el precio que se cobra lo pone Postgres.
   */
  private async reconcileWithCatalog(): Promise<void> {
    if (this._items().length === 0) return;

    try {
      await this.auth.whenReady();

      const catalog = await new Promise<HubPartModel[]>((resolve, reject) => {
        this.parts.getAll().subscribe({ next: resolve, error: reject });
      });

      const byId = new Map(catalog.map((part) => [part.id, part]));

      this._items.set(
        this._items()
          // La pieza que ya no está en el catálogo se cae: puede haberse
          // desactivado, borrado, o marcado como de prueba. `create_order()` la
          // rechazaría igual, y es mejor que desaparezca del carrito que que
          // reviente el checkout.
          .filter((item) => byId.has(item.part.id))
          // Y la que sigue ahí toma sus datos de la base, no del navegador.
          .map((item) => ({ ...item, part: byId.get(item.part.id) as HubPartModel })),
      );
    } catch (error) {
      console.warn('[carrito] no se pudo poner al dia contra el catalogo', error);
    }
  }
}

/**
 * Lee el carrito guardado. Nunca lanza: `localStorage` lo puede editar
 * cualquiera desde las herramientas del navegador, así que lo que sale de ahí se
 * trata como texto de fuera y se valida pieza por pieza.
 */
function readStoredCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as StoredCart;
    if (parsed?.v !== STORAGE_VERSION || !Array.isArray(parsed.items)) return [];

    return parsed.items.filter(isUsableItem).map((item) => ({
      part: item.part,
      // Un entero positivo o nada. Un `quantity` de -3 o de "muchas" saldría
      // en el total y llegaría al pedido.
      quantity: Math.max(1, Math.floor(item.quantity)),
    }));
  } catch {
    // Modo privado, storage lleno, JSON corrupto: se arranca con el carrito
    // vacío, que es como estaba antes de este cambio.
    return [];
  }
}

function isUsableItem(item: unknown): item is CartItem {
  if (typeof item !== 'object' || item === null) return false;

  const candidate = item as Partial<CartItem>;
  const part = candidate.part;

  return (
    typeof candidate.quantity === 'number' &&
    Number.isFinite(candidate.quantity) &&
    candidate.quantity >= 1 &&
    typeof part === 'object' &&
    part !== null &&
    typeof part.id === 'number' &&
    typeof part.name === 'string' &&
    typeof part.price === 'number' &&
    Number.isFinite(part.price)
  );
}

function writeStoredCart(items: CartItem[]): void {
  try {
    if (items.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const payload: StoredCart = { v: STORAGE_VERSION, items };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Sin storage el carrito sigue funcionando en memoria, como siempre.
  }
}
