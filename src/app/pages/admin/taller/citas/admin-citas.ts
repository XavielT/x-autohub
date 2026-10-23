import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { AdminServicesService } from '../../../../../shared/services/admin-services.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import { AdminAppointmentModel, AppointmentStatus } from '../../../../../shared/models/service.model';
import {
  APPOINTMENT_ACTION_LABELS,
  APPOINTMENT_STATUS_LABELS,
  nextAppointmentStatuses,
} from '../../../../../shared/utils/appointment-rules';
import { addDays, formatDay, formatTime, localDate } from '../../../../../shared/utils/service-time';
import { buildWaLink } from '../../../../../shared/utils/whatsapp';

export type AgendaRange = 'pending' | 'today' | 'week' | 'upcoming' | 'past';

const RANGES: readonly { value: AgendaRange; label: string }[] = [
  { value: 'pending', label: 'Por confirmar' },
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Esta semana' },
  { value: 'upcoming', label: 'Próximas' },
  { value: 'past', label: 'Pasadas' },
];

interface AgendaDay {
  /** `YYYY-MM-DD`. */
  date: string;
  label: string;
  items: AdminAppointmentModel[];
}

interface AppointmentAction {
  to: AppointmentStatus;
  label: string;
  destructive: boolean;
}

/**
 * La agenda del taller: las citas por día, con quién es, qué vehículo y qué pidió, y
 * los pasos que cada una puede dar **ahora**.
 *
 * Pensado para el teléfono: confirmar una cita es un toque. El orden lo hace cumplir
 * `set_appointment_status()` en Postgres; aquí solo se ofrecen los botones que la base
 * aceptaría. Cancelar pide un segundo toque, y la nota la ve el cliente en "Mis citas".
 */
@Component({
  selector: 'app-admin-citas',
  imports: [],
  templateUrl: './admin-citas.html',
  styleUrl: './admin-citas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCitas implements OnInit {
  private readonly admin = inject(AdminServicesService);
  private readonly toast = inject(ToastService);

  readonly ranges = RANGES;
  readonly range = signal<AgendaRange>('pending');
  readonly appointments = signal<AdminAppointmentModel[]>([]);
  readonly isLoading = signal(true);
  readonly savingId = signal<string | null>(null);
  readonly confirmCancelId = signal<string | null>(null);
  /** La nota que se está escribiendo, por cita. La ve el cliente. */
  readonly notes = signal<Record<string, string>>({});

  readonly statusLabels = APPOINTMENT_STATUS_LABELS;

  readonly pendingCount = computed(() => this.appointments().filter((a) => a.status === 'requested').length);

  /** Las citas del rango elegido, agrupadas por día (en hora de Santo Domingo). */
  readonly days = computed<AgendaDay[]>(() => {
    const today = localDate(new Date());
    const weekEnd = addDays(today, 6);
    const now = Date.now();

    const inRange = this.appointments().filter((a) => {
      const day = localDate(a.scheduledAt);
      switch (this.range()) {
        case 'pending':
          return a.status === 'requested';
        case 'today':
          return day === today;
        case 'week':
          return day >= today && day <= weekEnd;
        case 'upcoming':
          return a.scheduledAt.getTime() >= now;
        case 'past':
          return a.scheduledAt.getTime() < now;
      }
    });

    const byDay = new Map<string, AdminAppointmentModel[]>();
    for (const a of [...inRange].sort((x, y) => +x.scheduledAt - +y.scheduledAt)) {
      const key = localDate(a.scheduledAt);
      byDay.set(key, [...(byDay.get(key) ?? []), a]);
    }

    // "Pasadas" se lee de la más reciente a la más vieja.
    const days = [...byDay.entries()].map(([date, items]) => ({
      date,
      label: formatDay(items[0].scheduledAt),
      items,
    }));
    return this.range() === 'past' ? days.reverse() : days;
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.admin.getAppointments().subscribe({
      next: (list) => {
        this.appointments.set(list);
        this.isLoading.set(false);
      },
      error: (error: Error) => {
        this.isLoading.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  setRange(range: AgendaRange): void {
    this.range.set(range);
    this.confirmCancelId.set(null);
  }

  time(a: AdminAppointmentModel): string {
    return formatTime(a.scheduledAt);
  }

  actionsFor(a: AdminAppointmentModel): AppointmentAction[] {
    return nextAppointmentStatuses(a.status).map((to) => ({
      to,
      label: APPOINTMENT_ACTION_LABELS[to],
      destructive: to === 'cancelled' || to === 'no_show',
    }));
  }

  noteOf(id: string): string {
    return this.notes()[id] ?? '';
  }

  setNote(id: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.notes.update((all) => ({ ...all, [id]: value }));
  }

  act(a: AdminAppointmentModel, action: AppointmentAction): void {
    if (this.savingId() !== null) return;

    // Cancelar o marcar que no se presentó no se deshace: se pide un segundo toque.
    if (action.destructive && this.confirmCancelId() !== `${a.id}:${action.to}`) {
      this.confirmCancelId.set(`${a.id}:${action.to}`);
      return;
    }

    this.confirmCancelId.set(null);
    this.savingId.set(a.id);

    this.admin.setAppointmentStatus(a.id, action.to, this.noteOf(a.id)).subscribe({
      next: () => {
        this.savingId.set(null);
        this.notes.update((all) => ({ ...all, [a.id]: '' }));
        this.toast.show(`Cita #${a.number}: ${APPOINTMENT_STATUS_LABELS[action.to].toLowerCase()}.`);
        this.load();
      },
      error: (error: Error) => {
        this.savingId.set(null);
        this.toast.show(error.message, 'error');
        // Lo más probable es que otro admin ya la moviera: se muestra lo que hay.
        this.load();
      },
    });
  }

  isConfirming(a: AdminAppointmentModel, action: AppointmentAction): boolean {
    return this.confirmCancelId() === `${a.id}:${action.to}`;
  }

  /** Para escribirle al cliente por su cita, con el número ya puesto. */
  whatsapp(a: AdminAppointmentModel): string {
    return buildWaLink(
      a.contactPhone,
      `Hola ${a.contactName}, te escribimos de X AutoHub por tu cita #${a.number} (${a.serviceTitle}).`,
    );
  }
}
