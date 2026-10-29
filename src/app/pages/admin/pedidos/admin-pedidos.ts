import { Skeleton } from '../../../../shared/ui/skeleton/skeleton';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { AdminService } from '../../../../shared/services/admin.service';
import { StorageService } from '../../../../shared/services/storage.service';
import { ToastService } from '../../../../shared/services/toast.service';
import {
  AdminOrderModel,
  ORDER_ACTION_LABELS,
  ORDER_STATUS_FLOW,
} from '../../../../shared/models/admin-order.model';
import { OrderStatus } from '../../../../core/supabase/database.types';
import { nextStatuses } from '../../../../shared/utils/order-status';
import { buildWaLink } from '../../../../shared/utils/whatsapp';

/** Un botón de transición: a qué estado lleva y cómo se llama. */
interface OrderAction {
  to: OrderStatus;
  label: string;
  /** Cancelar pide una segunda confirmación: devuelve el stock y no se deshace. */
  destructive: boolean;
}

const PAYMENT_LABELS: Record<string, string> = {
  transfer: 'Transferencia',
  whatsapp: 'WhatsApp',
  card: 'Tarjeta',
  mercadopago: 'Mercado Pago',
};

/**
 * Pedidos de la tienda.
 *
 * Pensado para el teléfono: es donde alguien va a marcar `paid` en dos toques
 * cuando le llega el comprobante, y si no es así no se hará. Una tarjeta por
 * pedido, botones grandes, y solo los pasos que el pedido puede dar **ahora**.
 *
 * El orden lógico lo hace cumplir `set_order_status()` en Postgres (no se salta
 * de `awaiting_payment` a `shipped` sin pasar por `paid`); aquí solo se ofrecen
 * los botones que la base aceptaría. RLS limita la lectura a un admin, así que el
 * listado no filtra nada por su cuenta.
 */
@Component({
  selector: 'app-admin-pedidos',
  imports: [DatePipe, DecimalPipe, Skeleton],
  templateUrl: './admin-pedidos.html',
  styleUrl: './admin-pedidos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPedidos implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);

  readonly orders = signal<AdminOrderModel[]>([]);
  readonly isLoading = signal(true);
  readonly expandedId = signal<string | null>(null);
  readonly statusFilter = signal<OrderStatus | 'all'>('all');
  /** El pedido cuyo estado se está guardando, para no dejar la tarjeta muda. */
  readonly savingId = signal<string | null>(null);
  /** La nota que se está escribiendo, por pedido. La ve el cliente. */
  readonly notes = signal<Record<string, string>>({});
  /** El pedido al que se le pidió cancelar y espera la segunda confirmación. */
  readonly confirmCancelId = signal<string | null>(null);
  /** Los enlaces firmados de los comprobantes que ya se pidieron (duran diez minutos). */
  readonly proofUrls = signal<Record<string, string>>({});
  readonly loadingProofId = signal<string | null>(null);

  readonly statuses = ORDER_STATUS_FLOW;

  readonly filtered = computed(() => {
    const filter = this.statusFilter();
    const all = this.orders();
    return filter === 'all' ? all : all.filter((o) => o.status === filter);
  });

  /** Cuántos hay de cada estado, para el número en cada filtro. */
  readonly counts = computed(() => {
    const counts: Partial<Record<OrderStatus, number>> = {};
    for (const o of this.orders()) counts[o.status] = (counts[o.status] ?? 0) + 1;
    return counts;
  });

  /** Suma de lo que no está cancelado: es la cifra que de verdad importa. */
  readonly revenue = computed(() =>
    this.orders()
      .filter((o) => o.status !== 'cancelled')
      .reduce((acc, o) => acc + o.total, 0),
  );

  /** Lo que espera una acción del equipo: pagos por confirmar. */
  readonly awaitingCount = computed(
    () => this.orders().filter((o) => o.status === 'awaiting_payment' || o.status === 'pending').length,
  );

  /** De esos, los que ya tienen comprobante: los primeros que hay que mirar. */
  readonly withProofCount = computed(
    () => this.orders().filter((o) => o.status === 'awaiting_payment' && o.proofPath !== null).length,
  );

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.isLoading.set(true);
    this.admin.getOrders().subscribe({
      next: (orders) => {
        this.orders.set(orders);
        this.isLoading.set(false);
      },
      error: (error: Error) => {
        this.isLoading.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  toggleDetail(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
    this.confirmCancelId.set(null);
  }

  setFilter(value: OrderStatus | 'all'): void {
    this.statusFilter.set(value);
  }

  statusLabel(status: OrderStatus): string {
    return this.statuses.find((s) => s.value === status)?.label ?? status;
  }

  paymentLabel(id: string): string {
    return PAYMENT_LABELS[id] ?? id;
  }

  /** Los pasos que este pedido puede dar ahora: los mismos que acepta la base. */
  actionsFor(order: AdminOrderModel): OrderAction[] {
    return nextStatuses(order.status, order.fulfillmentType).map((to) => ({
      to,
      label: ORDER_ACTION_LABELS[to],
      destructive: to === 'cancelled',
    }));
  }

  noteOf(id: string): string {
    return this.notes()[id] ?? '';
  }

  setNote(id: string, event: Event): void {
    const value = (event.target as HTMLTextAreaElement | HTMLInputElement).value;
    this.notes.update((all) => ({ ...all, [id]: value }));
  }

  act(order: AdminOrderModel, action: OrderAction): void {
    if (this.savingId() !== null) return;

    // Cancelar devuelve el stock y no se deshace: se pide un segundo toque.
    if (action.destructive && this.confirmCancelId() !== order.id) {
      this.confirmCancelId.set(order.id);
      return;
    }

    this.confirmCancelId.set(null);
    this.savingId.set(order.id);

    this.admin.setOrderStatus(order.id, action.to, this.noteOf(order.id)).subscribe({
      next: () => {
        this.savingId.set(null);
        this.notes.update((all) => ({ ...all, [order.id]: '' }));
        this.toast.show(`Pedido #${order.orderNumber}: ${this.statusLabel(action.to).toLowerCase()}.`);
        // Se vuelve a leer: el historial y la fecha de pago los pone la base.
        this.load();
      },
      error: (error: Error) => {
        this.savingId.set(null);
        this.toast.show(error.message, 'error');
        // Lo más probable es que otro admin ya lo moviera: se muestra lo que hay.
        this.load();
      },
    });
  }

  // --- Comprobante -----------------------------------------------------------

  isImageProof(path: string): boolean {
    return /\.(jpe?g|png|webp|heic)$/i.test(path);
  }

  /**
   * Pide el enlace firmado del comprobante. El bucket es privado: no hay URL
   * pública, y la que se obtiene aquí caduca a los diez minutos.
   */
  viewProof(order: AdminOrderModel): void {
    if (!order.proofPath || this.loadingProofId() !== null) return;

    this.loadingProofId.set(order.id);
    this.storage.getPaymentProofUrl(order.proofPath).subscribe({
      next: (url) => {
        this.loadingProofId.set(null);
        this.proofUrls.update((all) => ({ ...all, [order.id]: url }));
      },
      error: (error: Error) => {
        this.loadingProofId.set(null);
        this.toast.show(error.message, 'error');
      },
    });
  }

  /** Para escribirle al cliente por su pedido, con el número ya puesto. */
  customerWhatsApp(order: AdminOrderModel): string | null {
    return order.contactPhone
      ? buildWaLink(order.contactPhone, `Hola ${order.fullName}, te escribimos de X AutoHub por tu pedido #${order.orderNumber}.`)
      : null;
  }
}
