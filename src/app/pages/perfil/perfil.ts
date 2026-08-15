import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../shared/services/auth.service';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { OrderService } from '../../../shared/services/order.service';
import { ToastService } from '../../../shared/services/toast.service';
import { HubMarketCard } from '../../../shared/components/hub-market-card/hub-market-card';
import { LocationSelect } from '../../../shared/ui/location-select/location-select';
import {
  HubMarketItemModel,
  PublicationStatus,
} from '../../../shared/models/hub-market-item.model';
import { ORDER_STATUS_LABELS, UserOrderModel } from '../../../shared/models/user-order.model';
import { OrderStatus } from '../../../core/supabase/database.types';
import {
  RequiredField,
  focusFirstInvalid,
  missingFieldsMessage,
} from '../../../shared/forms/required-fields';

/**
 * Perfil del propio usuario: sus datos, sus publicaciones y su actividad.
 *
 * El teléfono llega por `get_my_profile()` (migración 0009). No se puede leer con
 * un select porque 0006 le quitó esa columna a las claves anon y authenticated —
 * ver `docs/BACKEND.md`. Esta página nunca consulta `profiles` directamente.
 *
 * Los pedidos de invitado no aparecen, y no es un olvido: RLS los limita a
 * `user_id = auth.uid()` y un pedido sin cuenta no tiene dueño con el que
 * comparar. Comprar sin cuenta no deja rastro en ningún perfil, a propósito.
 */
@Component({
  selector: 'app-perfil',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule, RouterLink, HubMarketCard, LocationSelect],
  templateUrl: './perfil.html',
  styleUrl: './perfil.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Perfil implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly hubMarket = inject(HubMarketService);
  private readonly orders = inject(OrderService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** La señal de sesión, no una copia: el navbar y esta página van a la par. */
  readonly user = this.auth.user;

  readonly isEditing = signal(false);
  readonly isSaving = signal(false);

  readonly publications = signal<HubMarketItemModel[]>([]);
  readonly isLoadingPublications = signal(true);

  readonly myOrders = signal<UserOrderModel[]>([]);
  readonly isLoadingOrders = signal(true);

  /** La inicial del círculo, igual que en el navbar. */
  readonly initial = computed(() => this.user()?.displayName?.charAt(0)?.toUpperCase() ?? '?');

  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    phone: [''],
    location: [''],
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    const user = this.user();
    if (!user) return; // El authGuard ya lo cubre; esto es por si la sesión expira.

    this.hubMarket.getBySellerId(user.id).subscribe({
      next: (items) => {
        this.publications.set(items);
        this.isLoadingPublications.set(false);
      },
      error: (error: Error) => {
        this.isLoadingPublications.set(false);
        this.toast.show(error.message, 'error');
      },
    });

    this.orders.getByUserId(user.id).subscribe({
      next: (list) => {
        this.myOrders.set(list);
        this.isLoadingOrders.set(false);
      },
      error: (error: Error) => {
        this.isLoadingOrders.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  // --- Edicion -------------------------------------------------------------

  startEdit(): void {
    const user = this.user();
    if (!user) return;

    this.form.setValue({
      displayName: user.displayName,
      phone: user.phone ?? '',
      location: user.location ?? '',
    });
    this.isEditing.set(true);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
    this.form.reset();
  }

  /** Solo el nombre es obligatorio; el patrón es el mismo de la fase 1. */
  requiredFields(): RequiredField[] {
    return [
      {
        key: 'displayName',
        label: 'Nombre',
        invalid: this.form.controls.displayName.invalid,
      },
    ];
  }

  showError(field: 'displayName'): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }

  save(): void {
    this.form.markAllAsTouched();

    const missing = missingFieldsMessage(this.requiredFields());
    if (missing) {
      this.toast.show(missing, 'error');
      focusFirstInvalid(this.host.nativeElement, this.requiredFields());
      return;
    }

    this.isSaving.set(true);
    this.auth.updateProfile(this.form.getRawValue()).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.isEditing.set(false);
        this.toast.show('Perfil actualizado.');
      },
      error: (error: Error) => {
        this.isSaving.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  // --- Mis publicaciones ---------------------------------------------------

  /**
   * Estado de una publicación, tratando la ausencia como aprobada.
   *
   * Lo sembrado y lo publicado antes de la fase 5 no trae `status`. Mostrarlo
   * como "Pendiente" asustaría a quien tiene publicaciones que llevan meses
   * visibles en el sitio.
   */
  statusOf(item: HubMarketItemModel): PublicationStatus {
    return item.status ?? 'aprobado';
  }

  publicationStatusLabel(status: PublicationStatus): string {
    switch (status) {
      case 'pendiente':
        return 'Pendiente';
      case 'aprobado':
        return 'Aprobado';
      case 'rechazado':
        return 'Rechazado';
    }
  }

  // --- Actividad -----------------------------------------------------------

  statusLabel(status: OrderStatus): string {
    return ORDER_STATUS_LABELS[status];
  }

  /**
   * Referencia corta del pedido.
   *
   * Los ids reales son uuid, y los 8 primeros bastan para nombrar uno. Los del
   * modo simulado son cortos (`demo-1002`), y recortarlos a 8 los dejaba en
   * `demo-100` — engañoso, y peor aún: dos pedidos distintos se veían con la
   * misma referencia. Solo se recorta lo que de verdad es largo.
   */
  shortId(id: string): string {
    return id.length > 12 ? id.slice(0, 8) : id;
  }
}
