import { ChangeDetectionStrategy, Component, ElementRef, HostListener, effect, inject, signal } from '@angular/core';
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** "Vaciar carrito" borra todo: el primer toque pide confirmar (5 s) y el segundo vacía. */
  readonly confirmClear = signal(false);
  private clearTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Al abrirse, el foco entra al panel (un lector de pantalla y el teclado empiezan ahí) y la confirmación se reinicia.
    effect(() => {
      if (!this.cartService.isOpen()) {
        this.confirmClear.set(false);
        return;
      }
      setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.cart-modal')?.focus(), 0);
    });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.cartService.isOpen()) this.close();
  }

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
    if (!this.confirmClear()) {
      this.confirmClear.set(true);
      clearTimeout(this.clearTimer);
      this.clearTimer = setTimeout(() => this.confirmClear.set(false), 5000);
      return;
    }
    clearTimeout(this.clearTimer);
    this.confirmClear.set(false);
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