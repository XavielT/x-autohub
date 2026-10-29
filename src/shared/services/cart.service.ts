import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ProductModel, ProductVariantModel } from '../models/product.model';
import { ProductService } from './product.service';
import { AuthService } from './auth.service';

export interface CartItem {
  part: ProductModel;
  quantity: number;
  /**
   * La opción elegida (color, talla…) si el producto las tiene; nula si no. Una línea es
   * la pareja producto + opción: el mismo producto en dos colores son dos líneas.
   */
  variant: ProductVariantModel | null;
}

/** Una línea del carrito que pide más de lo que hay en inventario. */
export interface StockIssue {
  part: ProductModel;
  /** La opción de la línea, si la tiene: su stock es el que cuenta. */
  variant: ProductVariantModel | null;
  quantity: number;
  /** Lo que queda. Cero = agotado. */
  available: number;
}

/** Cuánto hay de lo que pide una línea: el stock de su opción, o el del producto. */
export function lineStock(item: Pick<CartItem, 'part' | 'variant'>): number {
  return item.variant ? item.variant.stock : item.part.stock;
}

/** El nombre de una línea como lo ve el cliente: "Alfombras · Negro". */
export function lineName(item: Pick<CartItem, 'part' | 'variant'>): string {
  return item.variant ? `${item.part.name} · ${item.variant.name}` : item.part.name;
}

/** La misma línea: mismo producto y misma opción. */
function sameLine(item: CartItem, partId: number, variantId: number | null): boolean {
  return item.part.id === partId && (item.variant?.id ?? null) === variantId;
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
  private readonly products = inject(ProductService);
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

  /**
   * Las líneas que piden más de lo que hay. Solo cuenta lo de inventario propio:
   * lo bajo pedido no depende de existencias. `create_order()` las rechazaría, así
   * que el checkout las avisa **antes** y no deja confirmar con ellas.
   */
  readonly stockIssues = computed<StockIssue[]>(() =>
    this._items()
      .filter((i) => i.part.fulfillment === 'stock' && i.quantity > lineStock(i))
      .map((i) => ({ part: i.part, variant: i.variant, quantity: i.quantity, available: lineStock(i) })),
  );

  constructor() {
    // Un `effect` y no un `persist()` en cada método: así el próximo método que
    // toque el carrito no puede olvidarse de guardar.
    effect(() => writeStoredCart(this._items()));

    void this.refresh();
  }

  /**
   * Agrega una unidad. Un producto con opciones **exige** la opción: sin ella no se agrega
   * nada (`create_order()` lo rechazaría, y el carrito no debe aceptar lo que no se puede
   * comprar). Devuelve si se agregó.
   */
  addToCart(part: ProductModel, variant: ProductVariantModel | null = null): boolean {
    if (part.hasVariants && !variant) return false;
    if (!part.hasVariants && variant) variant = null;

    const current = this._items();
    const variantId = variant?.id ?? null;
    const existing = current.find((i) => sameLine(i, part.id, variantId));

    if (existing) {
      this._items.set(
        current.map((i) => (sameLine(i, part.id, variantId) ? { ...i, quantity: i.quantity + 1 } : i)),
      );
    } else {
      this._items.set([...current, { part, quantity: 1, variant }]);
    }
    return true;
  }

  /**
   * Cambia la cantidad de una pieza. Cero o menos la quita. En lo de inventario
   * propio no pasa de lo que queda (si queda alguna): pedir más solo llevaría a un
   * rechazo en el checkout.
   */
  setQuantity(partId: number, quantity: number, variantId: number | null = null): void {
    const wanted = Math.floor(quantity);
    if (!Number.isFinite(wanted) || wanted <= 0) {
      this.removeFromCart(partId, variantId);
      return;
    }

    this._items.set(
      this._items().map((item) => {
        if (!sameLine(item, partId, variantId)) return item;
        const stock = lineStock(item);
        const cap = item.part.fulfillment === 'stock' && stock > 0 ? stock : wanted;
        return { ...item, quantity: Math.min(wanted, cap) };
      }),
    );
  }

  removeFromCart(partId: number, variantId: number | null = null): void {
    this._items.set(this._items().filter((i) => !sameLine(i, partId, variantId)));
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
   * Pone al día lo que hay en el carrito contra el catálogo: nombre, precio,
   * disponibilidad y existencias. Se corre al arrancar y cada vez que se abre el
   * checkout, que es cuando importa que el stock sea el de ahora y no el de la
   * última visita.
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
  async refresh(): Promise<void> {
    if (this._items().length === 0) return;

    try {
      await this.auth.whenReady();

      const catalog = await new Promise<ProductModel[]>((resolve, reject) => {
        this.products.getAll().subscribe({ next: resolve, error: reject });
      });

      const byId = new Map(catalog.map((part) => [part.id, part]));

      // Las opciones de los productos que las tienen, con el stock de ahora. Una sola
      // consulta para todo el carrito.
      const withVariants = [...new Set(this._items().map((i) => i.part.id))].filter(
        (id) => byId.get(id)?.hasVariants,
      );
      const variants = await new Promise<ProductVariantModel[]>((resolve, reject) => {
        this.products.getVariantsFor(withVariants).subscribe({ next: resolve, error: reject });
      });
      const variantById = new Map(variants.map((v) => [v.id, v]));

      this._items.set(
        this._items()
          // La pieza que ya no está en el catálogo se cae: puede haberse
          // desactivado, borrado, o marcado como de prueba. `create_order()` la
          // rechazaría igual, y es mejor que desaparezca del carrito que que
          // reviente el checkout.
          .filter((item) => byId.has(item.part.id))
          // Lo mismo con las opciones: la línea cuya opción se apagó o se borró se cae, y
          // la de un producto que ahora tiene opciones pero se guardó sin elegir una
          // también (no se puede comprar sin elegir).
          .filter((item) => {
            const part = byId.get(item.part.id) as ProductModel;
            if (!part.hasVariants) return true;
            return item.variant !== null && variantById.get(item.variant.id)?.productId === part.id;
          })
          // Y la que sigue ahí toma sus datos de la base, no del navegador.
          .map((item) => {
            const part = byId.get(item.part.id) as ProductModel;
            return {
              ...item,
              part,
              variant: part.hasVariants && item.variant ? (variantById.get(item.variant.id) ?? null) : null,
            };
          }),
      );
    } catch (error) {
      console.warn('[carrito] no se pudo poner al día contra el catálogo', error);
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
      // Los carritos guardados antes de las opciones no traen el campo.
      variant: isUsableVariant(item.variant) ? item.variant : null,
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

function isUsableVariant(variant: unknown): variant is ProductVariantModel {
  if (typeof variant !== 'object' || variant === null) return false;
  const v = variant as Partial<ProductVariantModel>;
  return (
    typeof v.id === 'number' &&
    typeof v.productId === 'number' &&
    typeof v.name === 'string' &&
    typeof v.stock === 'number' &&
    Number.isFinite(v.stock)
  );
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
