import { Skeleton } from '../../../../../shared/ui/skeleton/skeleton';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { AdminServicesService, DayDraft } from '../../../../../shared/services/admin-services.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import { AvailabilityRule, Blackout } from '../../../../../shared/models/service.model';
import { weekdayName } from '../../../../../shared/utils/hours';
import { localDate, slotInstant } from '../../../../../shared/utils/service-time';

/** De lunes a domingo, como se lee en RD (el domingo es el 0 de Postgres). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const SLOT_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

/** Un día para editar: con su regla si la tiene, o cerrado. */
export function dayDrafts(rules: readonly AvailabilityRule[]): DayDraft[] {
  return WEEK_ORDER.map((weekday) => {
    const rule = rules.find((r) => r.weekday === weekday);
    return rule
      ? {
          weekday,
          open: true,
          opensAt: rule.opensAt,
          closesAt: rule.closesAt,
          slotMinutes: rule.slotMinutes,
          capacity: rule.capacity,
          ruleId: rule.id,
        }
      : { weekday, open: false, opensAt: '08:00', closesAt: '17:00', slotMinutes: 60, capacity: 1, ruleId: null };
  });
}

/**
 * El horario del taller y sus cierres.
 *
 * Es lo que decide qué horas ofrece `available_slots()`: un día abierto genera una
 * franja cada `slotMinutes` desde que abre hasta una franja antes de cerrar, y
 * `capacity` es cuántas citas simultáneas atiende el taller en esa franja (de
 * cualquier servicio). Un **cierre** (feriado, vacaciones) quita las franjas que cubre.
 * El panel edita un solo tramo por día. Las horas son las de Santo Domingo.
 */
@Component({
  selector: 'app-admin-disponibilidad',
  imports: [DatePipe, Skeleton],
  templateUrl: './admin-disponibilidad.html',
  styleUrl: './admin-disponibilidad.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDisponibilidad implements OnInit {
  private readonly admin = inject(AdminServicesService);
  private readonly toast = inject(ToastService);

  readonly slotOptions = SLOT_OPTIONS;
  readonly weekdayName = weekdayName;

  readonly days = signal<DayDraft[]>([]);
  readonly blackouts = signal<Blackout[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  /** El horario que hay guardado todavía es el de ejemplo. */
  readonly isExample = signal(false);
  /** Algún día tiene más de un tramo: el panel solo edita el primero. */
  readonly hasSplitShifts = signal(false);

  // Formulario de un cierre
  readonly closeFromDate = signal(localDate(new Date()));
  readonly closeFromTime = signal('00:00');
  readonly closeToDate = signal(localDate(new Date()));
  readonly closeToTime = signal('23:59');
  readonly closeReason = signal('');
  readonly isAddingClose = signal(false);

  readonly openDays = computed(() => this.days().filter((d) => d.open).length);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    forkJoin([this.admin.getAvailability(), this.admin.getBlackouts()]).subscribe({
      next: ([rules, blackouts]) => {
        this.days.set(dayDrafts(rules));
        this.blackouts.set(blackouts);
        this.isExample.set(rules.some((r) => r.isExample));
        this.hasSplitShifts.set(new Set(rules.map((r) => r.weekday)).size < rules.length);
        this.isLoading.set(false);
      },
      error: (error: Error) => {
        this.isLoading.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  patchDay(weekday: number, change: Partial<DayDraft>): void {
    this.days.update((list) => list.map((d) => (d.weekday === weekday ? { ...d, ...change } : d)));
  }

  setOpen(weekday: number, event: Event): void {
    this.patchDay(weekday, { open: (event.target as HTMLInputElement).checked });
  }

  setTime(weekday: number, field: 'opensAt' | 'closesAt', event: Event): void {
    this.patchDay(weekday, { [field]: (event.target as HTMLInputElement).value });
  }

  setSlot(weekday: number, event: Event): void {
    this.patchDay(weekday, { slotMinutes: Number((event.target as HTMLSelectElement).value) });
  }

  setCapacity(weekday: number, event: Event): void {
    this.patchDay(weekday, { capacity: Number((event.target as HTMLInputElement).value) });
  }

  saveWeek(): void {
    if (this.isSaving()) return;

    this.isSaving.set(true);
    this.admin.saveWeek(this.days()).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toast.show('Horario guardado. Las citas nuevas ya lo usan.');
        this.load();
      },
      error: (error: Error) => {
        this.isSaving.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  // --- Cierres ---------------------------------------------------------------

  setClose(field: 'closeFromDate' | 'closeFromTime' | 'closeToDate' | 'closeToTime' | 'closeReason', event: Event): void {
    this[field].set((event.target as HTMLInputElement).value);
  }

  addBlackout(): void {
    if (this.isAddingClose()) return;

    this.isAddingClose.set(true);
    this.admin
      .addBlackout({
        startsAt: slotInstant(this.closeFromDate(), this.closeFromTime()),
        endsAt: slotInstant(this.closeToDate(), this.closeToTime()),
        reason: this.closeReason(),
      })
      .subscribe({
        next: () => {
          this.isAddingClose.set(false);
          this.closeReason.set('');
          this.toast.show('Cierre agregado. Esas horas ya no se ofrecen.');
          this.load();
        },
        error: (error: Error) => {
          this.isAddingClose.set(false);
          this.toast.show(error.message, 'error');
        },
      });
  }

  removeBlackout(blackout: Blackout): void {
    this.admin.removeBlackout(blackout.id).subscribe({
      next: () => {
        this.toast.show('Cierre quitado.');
        this.load();
      },
      error: (error: Error) => this.toast.show(error.message, 'error'),
    });
  }
}
