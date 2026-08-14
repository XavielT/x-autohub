import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CartService } from '../../../shared/services/cart.service';
import { CheckoutOptionsService } from '../../../shared/services/checkout-options.service';
import { OrderService } from '../../../shared/services/order.service';
import { AuthService } from '../../../shared/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import {
  RequiredField,
  focusFirstInvalid,
  missingFieldsMessage,
} from '../../../shared/forms/required-fields';
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * Con Supabase conectado el pedido se registra de verdad, así que llamarlo
   * "demo" mentiría. Lo que sigue siendo cierto en los dos modos es que no hay
   * cobro en línea: los métodos de pago son informativos.
   */
  readonly isDemoMode = inject(SupabaseService).shouldUseMockData();

  readonly shippingOptions = signal<CheckoutShippingOption[]>([]);
  readonly paymentOptions = signal<CheckoutPaymentMethodOption[]>([]);
  readonly isSubmitting = signal(false);

  /**
   * Este formulario es de señales con `ngModel`, no reactivo, así que no hay un
   * `touched` por control del que colgar los mensajes. Se marca al primer envío:
   * los errores no aparecen mientras el usuario todavía está llenando.
   */
  readonly submitted = signal(false);

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

  /**
   * Los obligatorios, en el orden en que se ven en la pantalla. Son los mismos
   * tres que este formulario ya exigía; lo que cambia es que ahora se dicen por
   * su nombre y se marcan en su sitio.
   */
  requiredFields(): RequiredField[] {
    return [
      { key: 'email', label: 'Correo electronico', invalid: !this.email().trim() },
      { key: 'fullName', label: 'Nombre completo', invalid: !this.fullName().trim() },
      { key: 'addressLine1', label: 'Direccion', invalid: !this.addressLine1().trim() },
    ];
  }

  /** true cuando hay que pintar el error de un campo, ya intentado el envío. */
  showError(key: string): boolean {
    return this.submitted() && (this.requiredFields().find((f) => f.key === key)?.invalid ?? false);
  }

  submitOrder(): void {
    const items = this.cartService.items();

    if (items.length === 0) {
      this.toast.show('Tu carrito está vacío.', 'error');
      return;
    }

    this.submitted.set(true);

    const missing = missingFieldsMessage(this.requiredFields());
    if (missing) {
      this.toast.show(missing, 'error');
      focusFirstInvalid(this.host.nativeElement, this.requiredFields());
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
