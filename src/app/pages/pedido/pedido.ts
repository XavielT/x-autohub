import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OrderService } from '../../../shared/services/order.service';
import { SiteSettingsService, realBankAccounts } from '../../../shared/services/site-settings.service';
import { ToastService } from '../../../shared/services/toast.service';
import { BankAccount, OrderView, PickupAddress } from '../../../shared/models/order.model';
import { ORDER_STATUS_LABELS } from '../../../shared/models/user-order.model';
import {
  acceptsProof,
  isFinalStatus,
  orderWhatsAppLink,
  timelineFor,
} from '../../../shared/utils/order-status';
import { storeWhatsAppLink } from '../../../shared/utils/contact';
import { GuestAvisos } from '../../../shared/components/guest-avisos/guest-avisos';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

/**
 * /pedido/:id — lo que el cliente ve después de confirmar, y a lo que vuelve.
 *
 * Es público por id: el uuid es la llave, así que quien hizo el pedido sin cuenta
 * también puede abrirlo (y reabrirlo desde el enlace). Por eso `get_order()` no
 * devuelve nada personal. Por la misma razón la página pide a los buscadores que
 * no la indexen.
 *
 * Según cómo se paga:
 *   · **Transferencia**: las cuentas, el monto exacto y "Subir comprobante".
 *   · **WhatsApp**: el botón que abre la conversación con el pedido ya escrito.
 *     El pedido existe antes de abrirlo, así que no se pierde.
 */
@Component({
  selector: 'app-pedido',
  imports: [DatePipe, DecimalPipe, RouterLink, GuestAvisos],
  templateUrl: './pedido.html',
  styleUrl: './pedido.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Pedido {
  private readonly route = inject(ActivatedRoute);
  private readonly orders = inject(OrderService);
  private readonly settings = inject(SiteSettingsService);
  private readonly toast = inject(ToastService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<LoadState>('loading');
  readonly order = signal<OrderView | null>(null);
  readonly bankAccounts = signal<BankAccount[]>([]);
  readonly pickupAddress = signal<PickupAddress | null>(null);

  /** Mientras sube el comprobante: deshabilita el botón y dice que está trabajando. */
  readonly isUploading = signal(false);
  readonly uploadError = signal<string | null>(null);

  readonly statusLabel = computed(() => {
    const order = this.order();
    return order ? ORDER_STATUS_LABELS[order.status] : '';
  });

  readonly timeline = computed(() => {
    const order = this.order();
    return order ? timelineFor(order) : [];
  });

  readonly isFinal = computed(() => {
    const order = this.order();
    return order ? isFinalStatus(order.status) : false;
  });

  /** ¿Todavía se espera el pago? Es cuando el bloque de pago tiene algo que hacer. */
  readonly awaitingPayment = computed(() => {
    const status = this.order()?.status;
    return status === 'awaiting_payment' || status === 'pending';
  });

  readonly canUploadProof = computed(() => {
    const order = this.order();
    return order ? acceptsProof(order) : false;
  });

  readonly whatsappLink = computed(() => {
    const order = this.order();
    return order ? orderWhatsAppLink(order.orderNumber, order.total) : storeWhatsAppLink();
  });

  /** Para escribir a la tienda por una duda, con el número de pedido. */
  readonly helpLink = computed(() => {
    const order = this.order();
    return storeWhatsAppLink(order ? `Hola, tengo una duda sobre mi pedido #${order.orderNumber}.` : undefined);
  });

  readonly installationLink = computed(() => {
    const order = this.order();
    return storeWhatsAppLink(
      order ? `Hola, quiero agendar la instalación de mi pedido #${order.orderNumber}.` : undefined,
    );
  });

  constructor() {
    // Los pedidos no se indexan: la dirección es privada de quien la tiene.
    this.meta.updateTag({ name: 'robots', content: 'noindex' });
    this.destroyRef.onDestroy(() => this.meta.removeTag("name='robots'"));

    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => this.load(params.get('id') ?? ''));

    this.settings.getBankAccounts().subscribe({
      next: (accounts) => this.bankAccounts.set(realBankAccounts(accounts)),
      error: () => this.bankAccounts.set([]),
    });
    this.settings.getPickupAddress().subscribe({
      next: (address) => this.pickupAddress.set(address && !address.isExample ? address : null),
      error: () => this.pickupAddress.set(null),
    });
  }

  /** Vuelve a leer el pedido: su estado cambia por fuera, cuando el equipo lo mueve. */
  refresh(): void {
    const id = this.order()?.id;
    if (id) this.load(id, false);
  }

  private load(id: string, showLoading = true): void {
    if (showLoading) this.state.set('loading');

    this.orders.getOrder(id).subscribe({
      next: (order) => {
        this.order.set(order);
        this.state.set(order ? 'ready' : 'missing');
        this.title.setTitle(order ? `Pedido #${order.orderNumber} | X AutoHub` : 'Pedido no encontrado | X AutoHub');
      },
      error: () => this.state.set('error'),
    });
  }

  // --- Comprobante -----------------------------------------------------------

  onProofSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const order = this.order();
    if (!file || !order) return;

    this.uploadError.set(null);
    this.isUploading.set(true);

    this.orders.uploadProof(order.id, file).subscribe({
      next: () => {
        this.isUploading.set(false);
        input.value = '';
        this.toast.show('Recibimos tu comprobante. Lo revisamos y confirmamos tu pago.');
        this.refresh();
      },
      error: (error: Error) => {
        this.isUploading.set(false);
        input.value = '';
        this.uploadError.set(error.message);
        this.toast.show(error.message, 'error');
      },
    });
  }

  // --- WhatsApp y cuentas ----------------------------------------------------

  /**
   * Se anota que abrió WhatsApp. El enlace se abre de todos modos: el registro es
   * para el equipo, y si falla no tiene que estorbar al cliente.
   */
  onWhatsAppClick(): void {
    const order = this.order();
    if (!order) return;
    this.orders.markWhatsAppOpened(order.id).subscribe({ error: () => undefined });
  }

  async copy(text: string, what: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.show(`${what} copiado.`);
    } catch {
      // Sin permiso de portapapeles el número sigue a la vista para copiarlo a mano.
      this.toast.show('No pudimos copiarlo. Selecciónalo y cópialo.', 'error');
    }
  }
}
