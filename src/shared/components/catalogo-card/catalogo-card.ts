import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ProductModel, ProductVariantModel } from '../../models/product.model';
import { CartService } from '../../services/cart.service';
import { ProductService } from '../../services/product.service';
import { ToastService } from '../../services/toast.service';
import { TestBadge } from '../../ui/test-badge/test-badge';
import { FavoriteButton } from '../favorite-button/favorite-button';
import { availabilityOf } from '../../utils/product-availability';

/**
 * La tarjeta de producto de la tienda.
 *
 * Dice lo que el cliente necesita saber sin abrir la ficha: el precio (con el
 * anterior tachado y el porcentaje si hay oferta), si hay en stock, si llega bajo
 * pedido y en cuánto, y —cuando hay un vehículo elegido y el producto le sirve—
 * el check verde "Compatible". Un producto agotado no se puede agregar.
 *
 * Con opciones (color, talla…) el botón del carrito abre, dentro de la propia tarjeta, la lista de
 * opciones para elegir ahí mismo. Se piden al abrirlas, no al pintar la tarjeta: una lista de 24
 * tarjetas no hace 24 consultas.
 *
 * Es la misma tarjeta en la tienda, en el buscador, en los relacionados y en el
 * home: por eso lo de la oferta y la disponibilidad vive aquí y no en cada página.
 */
@Component({
  selector: 'app-catalogo-card',
  imports: [RouterLink, CommonModule, NgOptimizedImage, TestBadge, FavoriteButton],
  templateUrl: './catalogo-card.html',
  styleUrl: './catalogo-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogoCard {
  private readonly cartService = inject(CartService);
  private readonly toastService = inject(ToastService);
  private readonly products = inject(ProductService);

  readonly hubPart = input.required<ProductModel>();
  /** Marca la imagen como LCP (carga con prioridad); solo para las primeras tarjetas de la lista. */
  readonly priority = input(false);
  /** Hay vehículo elegido y este producto le sirve. Quien pinta la lista lo decide. */
  readonly compatible = input(false);

  /** La foto no cargó (enlace roto o sin red): se muestra un ícono y la tarjeta conserva su forma. */
  readonly imageFailed = signal(false);
  readonly imageSrc = computed(() =>
    this.imageFailed() || !this.hubPart().imgUrl ? 'assets/icons/part-placeholder.svg' : this.hubPart().imgUrl,
  );

  readonly availability = computed(() => availabilityOf(this.hubPart()));

  /** Porcentaje de descuento redondeado; 0 si no hay oferta. */
  readonly discount = computed(() => {
    const { compareAtPrice, price } = this.hubPart();
    if (compareAtPrice === null || compareAtPrice <= price) return 0;
    return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
  });

  /** El selector de opciones está abierto. */
  readonly choosing = signal(false);
  readonly variants = signal<ProductVariantModel[]>([]);
  readonly loadingVariants = signal(false);
  readonly variantsFailed = signal(false);

  /** Lo que se elige, en minúsculas para la frase: "color", "talla"… */
  readonly variantNoun = computed(() => (this.hubPart().variantLabel || 'opción').toLowerCase());

  /** ¿Se puede comprar esta opción? Lo bajo pedido nunca está agotado. */
  isVariantAvailable(variant: ProductVariantModel): boolean {
    return this.hubPart().fulfillment === 'on_order' || variant.stock > 0;
  }

  /** Abre o cierra el selector. La primera vez trae las opciones. */
  toggleChooser(): void {
    if (this.choosing()) {
      this.choosing.set(false);
      return;
    }

    this.choosing.set(true);
    if (this.variants().length > 0 || this.loadingVariants()) return;

    this.loadingVariants.set(true);
    this.variantsFailed.set(false);
    this.products.getVariants(this.hubPart().id).subscribe({
      next: (list) => {
        this.variants.set(list);
        this.loadingVariants.set(false);
      },
      error: () => {
        this.variantsFailed.set(true);
        this.loadingVariants.set(false);
      },
    });
  }

  pick(variant: ProductVariantModel): void {
    if (!this.isVariantAvailable(variant)) return;

    const hubPart = this.hubPart();
    if (this.cartService.addToCart(hubPart, variant)) {
      this.toastService.show(`${hubPart.name} (${variant.name}) agregado al carrito`);
    }
    this.choosing.set(false);
  }

  addToCart(): void {
    const hubPart = this.hubPart();
    if (!this.availability().canBuy) return;

    // Con opciones no se agrega directo: se abre el selector para elegir color, talla…
    if (hubPart.hasVariants) {
      this.toggleChooser();
      return;
    }

    try {
      this.cartService.addToCart(hubPart);
      this.toastService.show(`${hubPart.name} agregado al carrito`);
    } catch {
      this.toastService.show('No se pudo agregar el artículo', 'error');
    }
  }
}
