import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AdminCouponsService } from '../../../../shared/services/admin-coupons.service';
import { ToastService } from '../../../../shared/services/toast.service';
import {
  COUPON_TYPES,
  COUPON_TYPE_LABELS,
  CouponDraft,
  CouponModel,
  CouponType,
  describeCouponValue,
} from '../../../../shared/models/coupon.model';
import { validateCouponDraft } from '../../../../shared/utils/coupon-rules';

const blank = (): CouponDraft => ({
  id: null,
  code: '',
  description: '',
  type: 'percent',
  value: 10,
  minSubtotal: 0,
  maxDiscount: null,
  startsAt: '',
  endsAt: '',
  maxUses: null,
  maxUsesPerCustomer: null,
  isActive: true,
});

/** `Date` → el texto de un `<input type="datetime-local">` (hora local, sin segundos). */
export function toLocalInput(date: Date | null): string {
  if (!date) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const toDraft = (c: CouponModel): CouponDraft => ({
  id: c.id,
  code: c.code,
  description: c.description,
  type: c.type,
  value: c.value,
  minSubtotal: c.minSubtotal,
  maxDiscount: c.maxDiscount,
  startsAt: toLocalInput(c.startsAt),
  endsAt: toLocalInput(c.endsAt),
  maxUses: c.maxUses,
  maxUsesPerCustomer: c.maxUsesPerCustomer,
  isActive: c.isActive,
});

/** En qué situación está un cupón ahora mismo, para la etiqueta de su tarjeta. */
export type CouponStatus = 'active' | 'off' | 'expired' | 'upcoming' | 'exhausted';

export function couponStatus(c: CouponModel, now: Date = new Date()): CouponStatus {
  if (!c.isActive) return 'off';
  if (c.endsAt !== null && now >= c.endsAt) return 'expired';
  if (c.startsAt !== null && now < c.startsAt) return 'upcoming';
  if (c.maxUses !== null && c.uses >= c.maxUses) return 'exhausted';
  return 'active';
}

const STATUS_LABELS: Readonly<Record<CouponStatus, string>> = {
  active: 'Activo',
  off: 'Apagado',
  expired: 'Vencido',
  upcoming: 'Aún no empieza',
  exhausted: 'Agotado',
};

/**
 * Los cupones: crear, editar, apagar y borrar (`/admin/cupones`).
 *
 * El panel solo define las reglas del cupón. Lo que se descuenta en cada pedido lo calcula
 * Postgres al crearlo (`create_order()`), y un cupón borrado no borra sus pedidos: cada
 * pedido guarda una copia del código con el que se compró.
 */
@Component({
  selector: 'app-admin-cupones',
  imports: [DatePipe],
  templateUrl: './admin-cupones.html',
  styleUrl: './admin-cupones.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCupones implements OnInit {
  private readonly admin = inject(AdminCouponsService);
  private readonly toast = inject(ToastService);

  readonly types = COUPON_TYPES;
  readonly typeLabels = COUPON_TYPE_LABELS;

  readonly coupons = signal<CouponModel[]>([]);
  readonly isLoading = signal(true);
  readonly draft = signal<CouponDraft | null>(null);
  readonly isSaving = signal(false);
  /** El cupón cuyo "Borrar" está esperando el segundo toque. */
  readonly confirmingDeleteId = signal<number | null>(null);

  readonly activeCount = computed(() => this.coupons().filter((c) => couponStatus(c) === 'active').length);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.admin.getCoupons().subscribe({
      next: (list) => {
        this.coupons.set(list);
        this.isLoading.set(false);
      },
      error: (error: Error) => {
        this.isLoading.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  statusOf(c: CouponModel): CouponStatus {
    return couponStatus(c);
  }

  statusLabel(c: CouponModel): string {
    return STATUS_LABELS[couponStatus(c)];
  }

  valueText(c: CouponModel): string {
    return describeCouponValue(c.type, c.value);
  }

  /** Las condiciones de un cupón, una por línea: lo que el equipo necesita ver de un vistazo. */
  conditions(c: CouponModel): string[] {
    const out: string[] = [];
    if (c.minSubtotal > 0) out.push(`Compra mínima RD$ ${c.minSubtotal.toLocaleString('es-DO')}`);
    if (c.maxDiscount !== null) out.push(`Descuento máximo RD$ ${c.maxDiscount.toLocaleString('es-DO')}`);
    if (c.maxUsesPerCustomer !== null) out.push(`${c.maxUsesPerCustomer} por cliente`);
    return out;
  }

  newCoupon(): void {
    this.draft.set(blank());
  }

  edit(coupon: CouponModel): void {
    this.draft.set(toDraft(coupon));
  }

  cancel(): void {
    this.draft.set(null);
  }

  setText(field: 'code' | 'description' | 'startsAt' | 'endsAt', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.patch({ [field]: field === 'code' ? value.toUpperCase() : value });
  }

  setType(event: Event): void {
    const type = (event.target as HTMLSelectElement).value as CouponType;
    // Cada tipo tiene su propio campo de valor: al cambiar no se arrastra el del anterior.
    this.patch({
      type,
      value: type === 'free_shipping' ? null : type === 'percent' ? 10 : null,
      maxDiscount: type === 'percent' ? this.draft()?.maxDiscount ?? null : null,
    });
  }

  /** Un número opcional: vacío = nulo (sin límite / sin tope). */
  setNumber(field: 'value' | 'maxDiscount' | 'maxUses' | 'maxUsesPerCustomer', event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    this.patch({ [field]: raw === '' ? null : Number(raw) });
  }

  setMin(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    this.patch({ minSubtotal: raw === '' ? 0 : Number(raw) });
  }

  setActiveFlag(event: Event): void {
    this.patch({ isActive: (event.target as HTMLInputElement).checked });
  }

  private patch(change: Partial<CouponDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...change } : d));
  }

  save(): void {
    const draft = this.draft();
    if (!draft || this.isSaving()) return;

    const invalid = validateCouponDraft(draft);
    if (invalid) {
      this.toast.show(invalid, 'error');
      return;
    }

    this.isSaving.set(true);
    this.admin.saveCoupon(draft).subscribe({
      next: (saved) => {
        this.isSaving.set(false);
        this.draft.set(null);
        this.toast.show(`Cupón ${saved.code} guardado.`);
        this.load();
      },
      error: (error: Error) => {
        this.isSaving.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  /** Apagar o encender sin abrir el formulario. */
  toggle(coupon: CouponModel): void {
    const next = !coupon.isActive;
    this.admin.setActive(coupon, next).subscribe({
      next: () => {
        this.toast.show(`Cupón ${coupon.code} ${next ? 'encendido' : 'apagado'}.`);
        this.load();
      },
      error: (error: Error) => this.toast.show(error.message, 'error'),
    });
  }

  /** El primer toque pide confirmar; el segundo borra. */
  remove(coupon: CouponModel): void {
    if (this.confirmingDeleteId() !== coupon.id) {
      this.confirmingDeleteId.set(coupon.id);
      return;
    }

    this.admin.deleteCoupon(coupon).subscribe({
      next: () => {
        this.confirmingDeleteId.set(null);
        this.toast.show(`Cupón ${coupon.code} borrado.`);
        this.load();
      },
      error: (error: Error) => {
        this.confirmingDeleteId.set(null);
        this.toast.show(error.message, 'error');
      },
    });
  }
}
