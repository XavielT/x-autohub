import { ChangeDetectionStrategy, Component, OnInit, ElementRef, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HubMarketService } from '../../../../shared/services/hub-market.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { HubMarketItemModel } from '../../../../shared/models/hub-market-item.model';
import { focusFirstInvalid } from '../../../../shared/forms/required-fields';

/** Mínimo del motivo de rechazo. Postgres exige lo mismo en `moderate_publication()`. */
const MIN_REASON = 10;

/**
 * Cola de revisión: lo que la comunidad publicó y todavía no se ve en el sitio.
 *
 * La abren moderadores y admins (`moderatorGuard`). La lista sale de
 * `getPending()`, que en modo real depende de la política de select de 0012:
 * a un usuario normal le devolvería una lista vacía, no los datos de otros.
 *
 * Aprobar es un clic. Rechazar pide un motivo **porque lo lee el vendedor** en
 * su perfil: un rechazo sin explicación no le dice qué corregir y garantiza que
 * vuelva a publicar lo mismo. La validación sigue el patrón de la fase 1
 * (mensaje inline + foco al campo), y Postgres la vuelve a exigir, así que esto
 * es comodidad y no la barrera.
 */
@Component({
  selector: 'app-admin-moderacion',
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink],
  templateUrl: './admin-moderacion.html',
  styleUrl: './admin-moderacion.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminModeracion implements OnInit {
  private readonly hubMarket = inject(HubMarketService);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly items = signal<HubMarketItemModel[]>([]);
  readonly isLoading = signal(true);
  /** Id en curso: deshabilita los botones de esa tarjeta, no los de todas. */
  readonly savingId = signal<number | null>(null);

  /** Id de la publicación cuyo formulario de rechazo está abierto. */
  readonly rejectingId = signal<number | null>(null);
  readonly reason = signal('');
  /** El error solo aparece tras el primer intento, no al abrir el formulario. */
  readonly reasonTouched = signal(false);

  readonly minReason = MIN_REASON;

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.isLoading.set(true);
    this.hubMarket.getPending().subscribe({
      next: (items) => {
        this.items.set(items);
        this.isLoading.set(false);
      },
      error: (error: Error) => {
        this.isLoading.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  /** Cuántos días lleva esperando. Es lo que hace visible una cola descuidada. */
  waitingDays(item: HubMarketItemModel): number {
    if (!item.createdAt) return 0;
    const ms = Date.now() - new Date(item.createdAt).getTime();
    return Math.max(0, Math.floor(ms / 86_400_000));
  }

  approve(item: HubMarketItemModel): void {
    this.apply(item, 'aprobado');
  }

  /**
   * Marca o desmarca la publicación como de prueba, **sin sacarla de la cola**.
   *
   * Es lo contrario de aprobar o rechazar: aquellas son decisiones que cierran
   * la revisión, esta es una etiqueta. Si la quitara de la lista, quien la marcó
   * para probar el flujo perdería de vista justo lo que quería seguir.
   *
   * Un moderador puede hacerlo con un `update` normal; a cualquier otro el
   * trigger de 0013 le devuelve la columna a su valor anterior.
   */
  toggleTest(item: HubMarketItemModel): void {
    const next = !item.isTest;
    this.savingId.set(item.id);

    this.hubMarket.setTestFlag(item.id, next).subscribe({
      next: () => {
        this.savingId.set(null);
        this.items.update((list) =>
          list.map((i) => (i.id === item.id ? { ...i, isTest: next } : i)),
        );
        this.toast.show(
          next
            ? `"${item.title}" quedo marcada como publicacion de prueba.`
            : `"${item.title}" ya no es una publicacion de prueba.`,
        );
      },
      error: (error: Error) => {
        this.savingId.set(null);
        this.toast.show(error.message, 'error');
      },
    });
  }

  /** Abre (o cierra) el formulario de rechazo de una publicación. */
  askReject(item: HubMarketItemModel): void {
    const open = this.rejectingId() === item.id;
    this.rejectingId.set(open ? null : item.id);
    this.reason.set('');
    this.reasonTouched.set(false);
  }

  get isReasonInvalid(): boolean {
    return this.reason().trim().length < MIN_REASON;
  }

  get showReasonError(): boolean {
    return this.reasonTouched() && this.isReasonInvalid;
  }

  confirmReject(item: HubMarketItemModel): void {
    this.reasonTouched.set(true);

    if (this.isReasonInvalid) {
      this.toast.show(`Explica en al menos ${MIN_REASON} caracteres por que se rechaza.`, 'error');
      focusFirstInvalid(this.host.nativeElement, [
        { key: 'reason', label: 'Motivo', invalid: true },
      ]);
      return;
    }

    this.apply(item, 'rechazado', this.reason().trim());
  }

  /**
   * Saca la tarjeta de la lista en cuanto la base confirma.
   *
   * Se quita en vez de recargar la cola entera: recargar haría saltar la lista
   * bajo el cursor de quien está revisando varias seguidas. La decisión ya está
   * guardada cuando esto ocurre, así que no es optimista — es la respuesta.
   */
  private apply(item: HubMarketItemModel, decision: 'aprobado' | 'rechazado', reason?: string): void {
    this.savingId.set(item.id);

    this.hubMarket.moderate(item.id, decision, reason).subscribe({
      next: () => {
        this.savingId.set(null);
        this.rejectingId.set(null);
        this.reason.set('');
        this.reasonTouched.set(false);
        this.items.update((list) => list.filter((i) => i.id !== item.id));
        this.toast.show(
          decision === 'aprobado'
            ? `"${item.title}" ya esta publicada.`
            : `"${item.title}" fue rechazada. El vendedor vera el motivo.`,
        );
      },
      error: (error: Error) => {
        this.savingId.set(null);
        this.toast.show(error.message, 'error');
      },
    });
  }
}
