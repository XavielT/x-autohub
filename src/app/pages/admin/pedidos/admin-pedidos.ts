import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { AdminService } from '../../../../shared/services/admin.service';
import { ToastService } from '../../../../shared/services/toast.service';
import {
  AdminOrderModel,
  ORDER_STATUS_FLOW,
} from '../../../../shared/models/admin-order.model';
import { OrderStatus } from '../../../../core/supabase/database.types';

/**
 * Pedidos del catálogo.
 *
 * Hasta ahora la única forma de verlos era el Table Editor de Supabase. RLS ya
 * limita la lectura y el cambio de estado a un admin, así que el listado no
 * filtra nada por su cuenta: pide todos los pedidos y la base decide.
 *
 * Los pedidos de invitado (`user_id` nulo) se marcan, porque son los que no
 * tienen cuenta detrás y solo se pueden atender por el correo de contacto.
 */
@Component({
  selector: 'app-admin-pedidos',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './admin-pedidos.html',
  styleUrl: './admin-pedidos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPedidos implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);

  readonly orders = signal<AdminOrderModel[]>([]);
  readonly isLoading = signal(true);
  readonly expandedId = signal<string | null>(null);
  readonly statusFilter = signal<OrderStatus | 'all'>('all');
  /** El pedido cuyo estado se está guardando, para no dejar la fila muda. */
  readonly savingId = signal<string | null>(null);

  readonly statuses = ORDER_STATUS_FLOW;

  readonly filtered = computed(() => {
    const filter = this.statusFilter();
    const all = this.orders();
    return filter === 'all' ? all : all.filter((o) => o.status === filter);
  });

  /** Suma de lo que no está cancelado: es la cifra que de verdad importa. */
  readonly revenue = computed(() =>
    this.orders()
      .filter((o) => o.status !== 'cancelled')
      .reduce((acc, o) => acc + o.total, 0),
  );

  readonly pendingCount = computed(
    () => this.orders().filter((o) => o.status === 'pending').length,
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
  }

  setFilter(value: OrderStatus | 'all'): void {
    this.statusFilter.set(value);
  }

  statusLabel(status: OrderStatus): string {
    return this.statuses.find((s) => s.value === status)?.label ?? status;
  }

  changeStatus(order: AdminOrderModel, event: Event): void {
    const status = (event.target as HTMLSelectElement).value as OrderStatus;
    if (status === order.status) return;

    this.savingId.set(order.id);
    this.admin.setOrderStatus(order.id, status).subscribe({
      next: () => {
        this.savingId.set(null);
        // Se actualiza en memoria en vez de recargar todo: es un solo campo y
        // recargar perderia el pedido que el admin tiene abierto.
        this.orders.update((list) =>
          list.map((o) => (o.id === order.id ? { ...o, status } : o)),
        );
        this.toast.show(`Pedido marcado como ${this.statusLabel(status).toLowerCase()}.`);
      },
      error: (error: Error) => {
        this.savingId.set(null);
        this.toast.show(error.message, 'error');
        // Revertir el <select> a lo que la base sigue teniendo.
        this.orders.update((list) => [...list]);
      },
    });
  }

  /** Los 8 primeros caracteres del uuid: suficiente para nombrar un pedido. */
  shortId(id: string): string {
    return id.slice(0, 8);
  }
}
