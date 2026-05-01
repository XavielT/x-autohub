import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CartService } from '../../services/cart';

@Component({
  selector: 'app-cart-modal',
  imports: [CommonModule],
  templateUrl: './cart-modal.html',
  styleUrl: './cart-modal.scss',
})
export class CartModal {
  cartService = inject(CartService);
  private readonly router = inject(Router);

  removeItem(partId: number): void {
    this.cartService.removeFromCart(partId);
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