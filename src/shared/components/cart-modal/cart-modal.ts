import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CartItem, CartService, lineStock } from '../../services/cart.service';
import { availabilityOf } from '../../utils/product-availability';

@Component({
  selector: 'app-cart-modal',
  imports: [CommonModule],
  templateUrl: './cart-modal.html',
  styleUrl: './cart-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartModal {
  readonly cartService = inject(CartService);
  private readonly router = inject(Router);

  /** Lo que se dice de cada línea: en stock, bajo pedido (y cuándo llega) o agotado. */
  availability(item: CartItem) {
    return availabilityOf(item.part, item.variant);
  }

  /** Lo que queda de lo que pide la línea: de su opción si la tiene. */
  stockOf(item: CartItem): number {
    return lineStock(item);
  }

  /** ¿Se puede sumar otra unidad? En lo de inventario propio no pasa de lo que queda. */
  canAddMore(item: CartItem): boolean {
    return item.part.fulfillment !== 'stock' || item.quantity < lineStock(item);
  }

  /** ¿Esta línea pide más de lo que hay? */
  exceedsStock(item: CartItem): boolean {
    return item.part.fulfillment === 'stock' && item.quantity > lineStock(item);
  }

  changeQuantity(item: CartItem, delta: 1 | -1): void {
    this.cartService.setQuantity(item.part.id, item.quantity + delta, item.variant?.id ?? null);
  }

  removeItem(item: CartItem): void {
    this.cartService.removeFromCart(item.part.id, item.variant?.id ?? null);
  }

  clearCart(): void {
    this.cartService.clearCart();
  }

  close(): void {
    this.cartService.toggleCart();
  }

  proceedToCheckout(): void {
    if (this.cartService.items().length === 0) {
      return;
    }
    this.cartService.closePanel();
    void this.router.navigate(['/checkout']);
  }
}