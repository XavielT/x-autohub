import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { CouponValidation, normalizeCouponCode } from '../../models/coupon.model';
import { CouponService } from '../../services/coupon.service';

/**
 * El campo "¿Tienes un cupón?" del checkout.
 *
 * Solo **prueba** el código con `validate_coupon()` y le avisa al checkout cuánto
 * descontaría (`appliedChange`); el pedido sigue sin llevar un monto, solo el código, y
 * `create_order()` lo vuelve a validar. Mientras hay un cupón aplicado, cada cambio del
 * subtotal, del envío o del correo lo vuelve a probar: un cupón de envío gratis deja de
 * valer si se cambia a retiro, y uno con compra mínima si se quita una pieza. Si deja de
 * valer, se quita y se dice por qué.
 */
@Component({
  selector: 'app-coupon-box',
  imports: [DecimalPipe],
  templateUrl: './coupon-box.html',
  styleUrl: './coupon-box.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CouponBox {
  private readonly coupons = inject(CouponService);

  /** El subtotal del carrito, sin envío. */
  readonly subtotal = input.required<number>();
  /** Lo que cuesta el envío elegido (0 en un retiro). */
  readonly shipping = input.required<number>();
  /** El correo del comprador, si ya lo escribió: cuenta para el límite "por cliente". */
  readonly email = input<string>('');

  /** El cupón aplicado, o `null` cuando se quita o deja de valer. */
  readonly appliedChange = output<CouponValidation | null>();

  readonly code = signal('');
  readonly applied = signal<CouponValidation | null>(null);
  readonly isChecking = signal(false);
  readonly error = signal('');

  /** Para descartar la respuesta de una prueba vieja si ya se pidió otra. */
  private run = 0;

  constructor() {
    // Con un cupón aplicado, si cambia el carrito, el envío o el correo se vuelve a probar.
    effect(() => {
      const subtotal = this.subtotal();
      const shipping = this.shipping();
      const email = this.email();
      untracked(() => {
        const current = this.applied();
        if (current) this.check(current.code, subtotal, shipping, email, true);
      });
    });
  }

  setCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value);
    this.error.set('');
  }

  apply(): void {
    const code = normalizeCouponCode(this.code());
    if (code === '') {
      this.error.set('Escribe el código del cupón.');
      return;
    }
    this.check(code, this.subtotal(), this.shipping(), this.email(), false);
  }

  remove(): void {
    this.run++;
    this.applied.set(null);
    this.code.set('');
    this.error.set('');
    this.appliedChange.emit(null);
  }

  private check(code: string, subtotal: number, shipping: number, email: string, silent: boolean): void {
    const run = ++this.run;
    if (!silent) this.isChecking.set(true);

    this.coupons.validate(code, subtotal, shipping, email).subscribe({
      next: (validation) => {
        if (run !== this.run) return;
        this.isChecking.set(false);
        this.error.set('');
        this.applied.set(validation);
        this.code.set(validation.code);
        this.appliedChange.emit(validation);
      },
      error: (error: Error) => {
        if (run !== this.run) return;
        this.isChecking.set(false);
        const wasApplied = this.applied() !== null;
        this.applied.set(null);
        this.error.set(wasApplied ? `Tu cupón ya no aplica: ${error.message}` : error.message);
        if (wasApplied) this.appliedChange.emit(null);
      },
    });
  }
}
