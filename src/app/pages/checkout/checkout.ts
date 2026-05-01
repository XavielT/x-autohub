import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CartService } from '../../../shared/services/cart';
import { CheckoutOptionsService } from '../../../shared/services/checkout-options.service';
import { ToastService } from '../../../shared/services/toast.service';
import { CheckoutSubmitPayload } from '../../../shared/models/checkout.model';

@Component({
  selector: 'app-checkout',
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './checkout.html',
  styleUrl: './checkout.scss',
})
export class CheckoutComponent {
  readonly cartService = inject(CartService);
  private readonly checkoutOptions = inject(CheckoutOptionsService);
  private readonly toast = inject(ToastService);

  readonly shippingOptions = this.checkoutOptions.getShippingOptions();
  readonly paymentOptions = this.checkoutOptions.getPaymentMethodOptions();

  selectedShippingId = 'standard';
  selectedPaymentId = 'card';

  email = '';
  phone = '';
  fullName = '';
  addressLine1 = '';
  city = '';
  postalCode = '';
  orderNotes = '';

  get shippingPrice(): number {
    return this.shippingOptions.find((o) => o.id === this.selectedShippingId)?.price ?? 0;
  }

  get grandTotal(): number {
    return this.cartService.totalPrice() + this.shippingPrice;
  }

  submitOrder(): void {
    if (this.cartService.items().length === 0) {
      this.toast.show('Tu carrito está vacío.', 'error');
      return;
    }
    if (!this.email.trim() || !this.fullName.trim() || !this.addressLine1.trim()) {
      this.toast.show('Completa correo, nombre y dirección.', 'error');
      return;
    }
    const payload: CheckoutSubmitPayload = {
      contactEmail: this.email.trim(),
      contactPhone: this.phone.trim(),
      fullName: this.fullName.trim(),
      addressLine1: this.addressLine1.trim(),
      city: this.city.trim(),
      postalCode: this.postalCode.trim(),
      shippingOptionId: this.selectedShippingId,
      paymentMethodId: this.selectedPaymentId,
      orderNotes: this.orderNotes.trim() || undefined,
    };
    void payload;
    this.toast.show(
      'Pedido de demostración registrado. La pasarela de pago se conectará en una próxima versión.',
      'success',
    );
  }
}
