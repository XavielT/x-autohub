import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CouponBox } from '../../../shared/components/coupon-box/coupon-box';
import { CartService, StockIssue } from '../../../shared/services/cart.service';
import { CheckoutOptionsService } from '../../../shared/services/checkout-options.service';
import { OrderService } from '../../../shared/services/order.service';
import { AuthService } from '../../../shared/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { SiteSettingsService } from '../../../shared/services/site-settings.service';
import {
  RequiredField,
  focusFirstInvalid,
  missingFieldsMessage,
} from '../../../shared/forms/required-fields';
import {
  CheckoutPaymentMethodOption,
  CheckoutShippingOption,
  CheckoutSubmitPayload,
  PICKUP_OPTION_ID,
} from '../../../shared/models/checkout.model';
import { CouponValidation } from '../../../shared/models/coupon.model';
import { OrderFulfillment, PickupAddress } from '../../../shared/models/order.model';
import { DO_LOCATIONS } from '../../../shared/data/locations';
import { normalizeDrPhone } from '../../../shared/utils/phone';
import { availabilityOf } from '../../../shared/utils/product-availability';

export type CheckoutStep = 1 | 2 | 3;

/** Dónde se recuerdan los datos del último pedido (nunca la nota ni el carrito). */
export const CHECKOUT_MEMORY_KEY = 'x-autohub.checkout';

interface RememberedCheckout {
  email: string;
  phone: string;
  fullName: string;
  addressLine1: string;
  city: string;
  province: string;
  postalCode: string;
  fulfillment: OrderFulfillment;
  paymentMethodId: string;
}

/**
 * Checkout en tres pasos: **Entrega → Pago → Confirmar**.
 *
 * Los totales que se ven en el último paso son una estimación con lo que hay en el
 * carrito; los de verdad los calcula `create_order()` en Postgres al confirmar, y
 * son los que muestra `/pedido/:id`. Si difieren se avisa. El navegador nunca
 * manda un precio.
 *
 * Sin pasarela de tarjeta: se paga por transferencia (con comprobante) o cerrando
 * el pedido por WhatsApp. El pedido existe en la base **antes** de pagar, así que
 * nunca se pierde.
 */
@Component({
  selector: 'app-checkout',
  imports: [DecimalPipe, RouterLink, FormsModule, CouponBox],
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
  private readonly settings = inject(SiteSettingsService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly provinces = DO_LOCATIONS.map((l) => l.name);
  readonly stepLabels = ['Entrega', 'Pago', 'Confirmar'] as const;

  readonly step = signal<CheckoutStep>(1);
  readonly isSubmitting = signal(false);

  /**
   * Los errores se pintan solo después de intentar avanzar en ese paso: no
   * aparecen mientras la persona todavía está llenando.
   */
  readonly attempted = signal<ReadonlySet<CheckoutStep>>(new Set());

  readonly shippingOptions = signal<CheckoutShippingOption[]>([]);
  readonly paymentOptions = signal<CheckoutPaymentMethodOption[]>([]);
  readonly pickupAddress = signal<PickupAddress | null>(null);

  readonly fulfillment = signal<OrderFulfillment>('shipping');
  readonly selectedShippingId = signal('standard');
  readonly selectedPaymentId = signal('transfer');
  readonly wantsInstallation = signal(false);

  readonly email = signal('');
  readonly phone = signal('');
  readonly fullName = signal('');
  readonly addressLine1 = signal('');
  readonly city = signal('');
  readonly province = signal('');
  readonly postalCode = signal('');
  readonly orderNotes = signal('');

  /** Las opciones de envío que corresponden a la entrega elegida (el retiro tiene la suya). */
  readonly visibleShippingOptions = computed(() =>
    this.shippingOptions().filter((o) => (o.id === PICKUP_OPTION_ID) === (this.fulfillment() === 'pickup')),
  );

  readonly selectedShipping = computed(() =>
    this.visibleShippingOptions().find((o) => o.id === this.selectedShippingId()) ?? null,
  );

  readonly shippingPrice = computed(() => this.selectedShipping()?.price ?? 0);

  /**
   * El cupón que probó el campo de cupón, o `null`. Lo que dice es una vista previa: al
   * confirmar solo viaja el código y `create_order()` vuelve a validarlo y calcula.
   */
  readonly coupon = signal<CouponValidation | null>(null);

  readonly discount = computed(() => this.coupon()?.discount ?? 0);

  /** Estimación: la definitiva la calcula Postgres al confirmar. */
  readonly estimatedTotal = computed(
    () => this.cartService.totalPrice() + this.shippingPrice() - this.discount(),
  );

  readonly selectedPayment = computed(
    () => this.paymentOptions().find((o) => o.id === this.selectedPaymentId()) ?? null,
  );

  /** ¿Algo del carrito se puede instalar? Entonces se ofrece la casilla. */
  readonly hasInstallable = computed(() => this.cartService.items().some((i) => i.part.installable));

  readonly stockIssues = computed<StockIssue[]>(() => this.cartService.stockIssues());

  /** Lo bajo pedido del carrito, para decir cuándo llega cada cosa. */
  readonly lines = computed(() =>
    this.cartService.items().map((item) => ({ item, availability: availabilityOf(item.part, item.variant) })),
  );

  readonly hasOnOrder = computed(() => this.lines().some((l) => l.availability.kind === 'on_order'));

  ngOnInit(): void {
    this.checkoutOptions.getShippingOptions().subscribe((options) => {
      this.shippingOptions.set(options);
      this.ensureValidShipping();
    });

    this.checkoutOptions.getPaymentMethodOptions().subscribe((options) => {
      this.paymentOptions.set(options);
      if (!options.some((o) => o.id === this.selectedPaymentId()) && options.length) {
        this.selectedPaymentId.set(options[0].id);
      }
    });

    this.settings.getPickupAddress().subscribe({
      next: (address) => this.pickupAddress.set(address),
      error: () => this.pickupAddress.set(null),
    });

    this.restore();

    // Con el checkout abierto el stock tiene que ser el de ahora, no el de la
    // última visita: lo que se avisa aquí es lo que `create_order()` rechazaría.
    void this.cartService.refresh();
  }

  // --- Elegir ----------------------------------------------------------------

  chooseFulfillment(value: OrderFulfillment): void {
    this.fulfillment.set(value);
    this.ensureValidShipping();
  }

  /** Deja elegida una opción que corresponda a la entrega (la más barata de las visibles al cambiar). */
  private ensureValidShipping(): void {
    const visible = this.visibleShippingOptions();
    if (visible.length && !visible.some((o) => o.id === this.selectedShippingId())) {
      this.selectedShippingId.set(visible[0].id);
    }
  }

  fixIssue(issue: StockIssue): void {
    const variantId = issue.variant?.id ?? null;
    if (issue.available > 0) this.cartService.setQuantity(issue.part.id, issue.available, variantId);
    else this.cartService.removeFromCart(issue.part.id, variantId);
  }

  // --- Pasos -----------------------------------------------------------------

  /** Lo obligatorio de cada paso, en el orden en que se ve en la pantalla. */
  requiredFields(step: CheckoutStep = this.step()): RequiredField[] {
    if (step === 1) {
      const shipping = this.fulfillment() === 'shipping';
      return [
        { key: 'email', label: 'Correo electrónico', invalid: !this.email().trim() },
        { key: 'fullName', label: 'Nombre completo', invalid: !this.fullName().trim() },
        { key: 'phone', label: 'Teléfono', invalid: normalizeDrPhone(this.phone()) === null },
        ...(shipping
          ? [
              { key: 'province', label: 'Provincia', invalid: !this.province().trim() },
              { key: 'addressLine1', label: 'Dirección', invalid: !this.addressLine1().trim() },
            ]
          : []),
      ];
    }

    if (step === 2) {
      return [{ key: 'payment', label: 'Método de pago', invalid: !this.selectedPayment() }];
    }

    return [];
  }

  /** true cuando hay que pintar el error de un campo, ya intentado su paso. */
  showError(key: string, step: CheckoutStep = 1): boolean {
    return (
      this.attempted().has(step) &&
      (this.requiredFields(step).find((f) => f.key === key)?.invalid ?? false)
    );
  }

  next(): void {
    const current = this.step();
    this.markAttempted(current);

    const missing = missingFieldsMessage(this.requiredFields(current));
    if (missing) {
      this.toast.show(missing, 'error');
      focusFirstInvalid(this.host.nativeElement, this.requiredFields(current));
      return;
    }

    if (current < 3) this.goTo((current + 1) as CheckoutStep);
  }

  back(): void {
    if (this.step() > 1) this.goTo((this.step() - 1) as CheckoutStep);
  }

  /** Solo se puede saltar a un paso ya recorrido: no hay atajo hacia adelante. */
  jumpTo(step: CheckoutStep): void {
    if (step < this.step()) this.goTo(step);
  }

  private goTo(step: CheckoutStep): void {
    this.step.set(step);
    // El foco al título del paso, cuando ya está pintado: quien usa lector de
    // pantalla oye en qué paso está.
    afterNextRender(
      () => {
        const heading = this.host.nativeElement.querySelector<HTMLElement>('[data-step-heading]');
        heading?.focus({ preventScroll: true });
        heading?.scrollIntoView?.({ block: 'start' });
      },
      { injector: this.injector },
    );
  }

  private markAttempted(step: CheckoutStep): void {
    this.attempted.update((set) => new Set(set).add(step));
  }

  // --- Confirmar -------------------------------------------------------------

  submitOrder(): void {
    const items = this.cartService.items();

    if (items.length === 0) {
      this.toast.show('Tu carrito está vacío.', 'error');
      return;
    }

    if (this.stockIssues().length > 0) {
      this.toast.show('Ajusta las piezas marcadas en tu carrito para continuar.', 'error');
      return;
    }

    // Los pasos anteriores se vuelven a validar: se puede llegar aquí con un campo
    // que se vació al volver atrás.
    for (const step of [1, 2] as const) {
      if (missingFieldsMessage(this.requiredFields(step))) {
        this.markAttempted(step);
        this.goTo(step);
        this.toast.show(missingFieldsMessage(this.requiredFields(step)), 'error');
        return;
      }
    }

    const shipping = this.fulfillment() === 'shipping';
    const payload: CheckoutSubmitPayload = {
      contactEmail: this.email().trim(),
      // La forma canónica de guardado (diez dígitos): ver `shared/utils/phone.ts`.
      contactPhone: normalizeDrPhone(this.phone()) ?? this.phone().trim(),
      fullName: this.fullName().trim(),
      addressLine1: shipping ? this.addressLine1().trim() : '',
      city: shipping ? this.city().trim() : '',
      postalCode: shipping ? this.postalCode().trim() : '',
      province: shipping ? this.province().trim() : '',
      fulfillment: this.fulfillment(),
      shippingOptionId: this.selectedShippingId(),
      paymentMethodId: this.selectedPaymentId(),
      wantsInstallation: this.hasInstallable() && this.wantsInstallation(),
      orderNotes: this.orderNotes().trim() || undefined,
      couponCode: this.coupon()?.code,
    };

    const estimate = this.estimatedTotal();
    this.isSubmitting.set(true);

    // Se permite comprar sin cuenta. El userId no se manda: lo resuelve Postgres
    // con `auth.uid()`, así que el navegador no puede decir que un pedido es de
    // otra persona.
    this.orderService.create(payload, items).subscribe({
      next: (order) => {
        this.isSubmitting.set(false);
        this.remember();
        this.cartService.clearCart();

        this.toast.show(
          order.total === estimate
            ? `Pedido #${order.orderNumber} registrado.`
            : `Pedido #${order.orderNumber} registrado. El total es RD$ ${order.total.toLocaleString('es-DO')}: Postgres lo calculó con los precios de ahora.`,
        );
        void this.router.navigate(['/pedido', order.id]);
      },
      error: (error: Error) => {
        this.isSubmitting.set(false);
        this.toast.show(error.message || 'No pudimos registrar tu pedido.', 'error');
        // Lo más común es que el stock haya cambiado: se vuelve a leer para que el
        // aviso del carrito diga la verdad.
        void this.cartService.refresh();
      },
    });
  }

  // --- Recordar los datos del último pedido -------------------------------------

  /**
   * Los datos de contacto y entrega del último pedido, para no volver a
   * escribirlos. Nunca la nota ni nada del carrito. Quien tiene sesión completa lo
   * que falte con su perfil.
   */
  private restore(): void {
    const saved = readRemembered();
    if (saved) {
      this.email.set(saved.email);
      this.phone.set(saved.phone);
      this.fullName.set(saved.fullName);
      this.addressLine1.set(saved.addressLine1);
      this.city.set(saved.city);
      this.province.set(saved.province);
      this.postalCode.set(saved.postalCode);
      this.fulfillment.set(saved.fulfillment);
      if (saved.paymentMethodId) this.selectedPaymentId.set(saved.paymentMethodId);
    }

    const user = this.auth.user();
    if (user) {
      if (!this.email()) this.email.set(user.email);
      if (!this.fullName()) this.fullName.set(user.displayName);
      if (!this.phone()) this.phone.set(user.phone ?? '');
      if (!this.province() && user.location && this.provinces.includes(user.location)) {
        this.province.set(user.location);
      }
    }
  }

  private remember(): void {
    const value: RememberedCheckout = {
      email: this.email().trim(),
      phone: this.phone().trim(),
      fullName: this.fullName().trim(),
      addressLine1: this.addressLine1().trim(),
      city: this.city().trim(),
      province: this.province().trim(),
      postalCode: this.postalCode().trim(),
      fulfillment: this.fulfillment(),
      paymentMethodId: this.selectedPaymentId(),
    };

    try {
      localStorage.setItem(CHECKOUT_MEMORY_KEY, JSON.stringify(value));
    } catch {
      // Sin storage no se recuerda nada; el pedido ya está hecho.
    }
  }
}

/** Lee lo recordado. Es texto de fuera (cualquiera puede editar `localStorage`): se valida. */
function readRemembered(): RememberedCheckout | null {
  try {
    const raw = localStorage.getItem(CHECKOUT_MEMORY_KEY);
    if (!raw) return null;

    const v = JSON.parse(raw) as Partial<Record<keyof RememberedCheckout, unknown>> | null;
    if (!v || typeof v !== 'object') return null;

    const str = (x: unknown) => (typeof x === 'string' ? x : '');

    return {
      email: str(v.email),
      phone: str(v.phone),
      fullName: str(v.fullName),
      addressLine1: str(v.addressLine1),
      city: str(v.city),
      province: str(v.province),
      postalCode: str(v.postalCode),
      fulfillment: v.fulfillment === 'pickup' ? 'pickup' : 'shipping',
      paymentMethodId: str(v.paymentMethodId),
    };
  } catch {
    return null;
  }
}
