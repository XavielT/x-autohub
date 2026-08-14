import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CartService } from '../../../shared/services/cart.service';
import { CheckoutOptionsService } from '../../../shared/services/checkout-options.service';
import { OrderService } from '../../../shared/services/order.service';
import { AuthService } from '../../../shared/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import {
  CheckoutPaymentMethodOption,
  CheckoutShippingOption,
  CheckoutSubmitPayload,
} from '../../../shared/models/checkout.model';

@Component({
  selector: 'app-checkout',
  imports: [DecimalPipe, RouterLink, FormsModule],
  templateUrl: './checkout.html',
  styleUrl: './checkout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Checkout implements OnInit {
  readonly cartService = inject(CartService);
  private readonly checkoutOptions = inject(CheckoutOptionsService);
  private readonly orderService = inject(OrderService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly shippingOptions = signal<CheckoutShippingOption[]>([]);
  readonly paymentOptions = signal<CheckoutPaymentMethodOption[]>([]);
  readonly isSubmitting = signal(false);

  readonly selectedShippingId = signal('standard');
  readonly selectedPaymentId = signal('card');

  readonly email = signal('');
  readonly phone = signal('');
  readonly fullName = signal('');
  readonly addressLine1 = signal('');
  readonly city = signal('');
  readonly postalCode = signal('');
  readonly orderNotes = signal('');

  readonly shippingPrice = computed(
    () => this.shippingOptions().find((o) => o.id === this.selectedShippingId())?.price ?? 0,
  );

  readonly grandTotal = computed(() => this.cartService.totalPrice() + this.shippingPrice());

  ngOnInit(): void {
    this.checkoutOptions.getShippingOptions().subscribe((options) => {
      this.shippingOptions.set(options);
      // La opción por defecto puede no existir si se editó en la base.
      if (!options.some((o) => o.id === this.selectedShippingId()) && options.length) {
        this.selectedShippingId.set(options[0].id);
      }
    });

    this.checkoutOptions.getPaymentMethodOptions().subscribe((options) => {
      this.paymentOptions.set(options);
      if (!options.some((o) => o.id === this.selectedPaymentId()) && options.length) {
        this.selectedPaymentId.set(options[0].id);
      }
    });

    // Precarga los datos de contacto de quien ya tiene sesión.
    const user = this.auth.user();
    if (user) {
      this.email.set(user.email);
      this.fullName.set(user.displayName);
      this.phone.set(user.phone ?? '');
      this.city.set(user.location ?? '');
    }
  }

  submitOrder(): void {
    const items = this.cartService.items();

    if (items.length === 0) {
      this.toast.show('Tu carrito está vacío.', 'error');
      return;
    }
    if (!this.email().trim() || !this.fullName().trim() || !this.addressLine1().trim()) {
      this.toast.show('Completa correo, nombre y dirección.', 'error');
      return;
    }

    const payload: CheckoutSubmitPayload = {
      contactEmail: this.email().trim(),
      contactPhone: this.phone().trim(),
      fullName: this.fullName().trim(),
      addressLine1: this.addressLine1().trim(),
      city: this.city().trim(),
      postalCode: this.postalCode().trim(),
      shippingOptionId: this.selectedShippingId(),
      paymentMethodId: this.selectedPaymentId(),
      orderNotes: this.orderNotes().trim() || undefined,
    };

    this.isSubmitting.set(true);

    // Se permite comprar sin cuenta. Ya no se pasa el userId: lo resuelve
    // Postgres con `auth.uid()` dentro de create_order, así que el navegador no
    // puede decir que un pedido es de otra persona.
    this.orderService
      .submit(payload, items, this.shippingPrice())
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.cartService.clearCart();
          this.toast.show(
            'Pedido registrado. Te contactaremos para coordinar el pago y la entrega.',
          );
          void this.router.navigate(['/catalogo']);
        },
        error: (error: Error) => {
          this.isSubmitting.set(false);
          this.toast.show(error.message || 'No pudimos registrar tu pedido.', 'error');
        },
      });
  }
}
