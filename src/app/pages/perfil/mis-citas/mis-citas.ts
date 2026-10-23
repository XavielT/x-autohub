import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppointmentModel } from '../../../../shared/models/service.model';
import { AppointmentService } from '../../../../shared/services/appointment.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { APPOINTMENT_STATUS_LABELS, CANCEL_WINDOW_HOURS, canCancel } from '../../../../shared/utils/appointment-rules';
import { formatWhen } from '../../../../shared/utils/service-time';

/**
 * "Mis citas" en el perfil: las citas de quien tiene sesión, con su estado y, si falta
 * **más de 24 horas**, la opción de cancelar.
 *
 * El botón se esconde con `canCancel()`, pero la regla de verdad la hace
 * `cancel_appointment()` en Postgres. Cancelar pide un segundo toque: libera el cupo y
 * no se deshace. Las citas de un invitado no aparecen aquí: no tienen dueño.
 */
@Component({
  selector: 'app-mis-citas',
  imports: [RouterLink],
  templateUrl: './mis-citas.html',
  styleUrl: './mis-citas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MisCitas implements OnInit {
  private readonly appointments = inject(AppointmentService);
  private readonly toast = inject(ToastService);

  readonly list = signal<AppointmentModel[]>([]);
  readonly isLoading = signal(true);
  readonly hasError = signal(false);
  /** La cita a la que se le pidió cancelar y espera el segundo toque. */
  readonly confirming = signal<string | null>(null);
  readonly cancelling = signal<string | null>(null);

  readonly cancelHours = CANCEL_WINDOW_HOURS;

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.appointments.getMyAppointments().subscribe({
      next: (list) => {
        this.list.set(list);
        this.isLoading.set(false);
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  statusLabel(appointment: AppointmentModel): string {
    return APPOINTMENT_STATUS_LABELS[appointment.status];
  }

  when(appointment: AppointmentModel): string {
    return formatWhen(appointment.scheduledAt);
  }

  canCancel(appointment: AppointmentModel): boolean {
    return canCancel(appointment);
  }

  cancel(appointment: AppointmentModel): void {
    if (this.cancelling() !== null) return;

    if (this.confirming() !== appointment.id) {
      this.confirming.set(appointment.id);
      return;
    }

    this.confirming.set(null);
    this.cancelling.set(appointment.id);

    this.appointments.cancel(appointment.id).subscribe({
      next: () => {
        this.cancelling.set(null);
        this.toast.show(`Cita #${appointment.number} cancelada.`);
        this.load();
      },
      error: (error: Error) => {
        this.cancelling.set(null);
        this.toast.show(error.message, 'error');
        // Lo más probable es que el estado ya fuera otro: se muestra lo que hay.
        this.load();
      },
    });
  }
}
