import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ProductModel } from '../../models/product.model';
import { CartService } from '../../services/cart.service';
import { ToastService } from '../../services/toast.service';
import { TestBadge } from '../../ui/test-badge/test-badge';
import { availabilityOf } from '../../utils/product-availability';

/**
 * La tarjeta de producto de la tienda.
 *
 * Dice lo que el cliente necesita saber sin abrir la ficha: el precio (con el
 * anterior tachado y el porcentaje si hay oferta), si hay en stock, si llega bajo
 * pedido y en cuánto, y —cuando hay un vehículo elegido y el producto le sirve—
 * el check verde "Compatible". Un producto agotado no se puede agregar.
 *
 * Es la misma tarjeta en la tienda, en el buscador, en los relacionados y en el
 * home: por eso lo de la oferta y la disponibilidad vive aquí y no en cada página.
 */
@Component({
  selector: 'app-catalogo-card',
  imports: [RouterLink, CommonModule, NgOptimizedImage, TestBadge],
  templateUrl: './catalogo-card.html',
  styleUrl: './catalogo-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogoCard {
  private readonly cartService = inject(CartService);
  private readonly toastService = inject(ToastService);

  readonly hubPart = input.required<ProductModel>();
  /** Marca la imagen como LCP (carga con prioridad); solo para las primeras tarjetas de la lista. */
  readonly priority = input(false);
  /** Hay vehículo elegido y este producto le sirve. Quien pinta la lista lo decide. */
  readonly compatible = input(false);

  readonly availability = computed(() => availabilityOf(this.hubPart()));

  /** Porcentaje de descuento redondeado; 0 si no hay oferta. */
  readonly discount = computed(() => {
    const { compareAtPrice, price } = this.hubPart();
    if (compareAtPrice === null || compareAtPrice <= price) return 0;
    return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
  });

  addToCart(): void {
    const hubPart = this.hubPart();
    if (!this.availability().canBuy) return;

    try {
      this.cartService.addToCart(hubPart);
      this.toastService.show(`${hubPart.name} agregado al carrito`);
    } catch {
      this.toastService.show('No se pudo agregar el articulo', 'error');
    }
  }
}
