import { AppointmentStatus } from '../models/service.model';

/** Con cuántas horas de anticipación se puede cancelar una cita. */
export const CANCEL_WINDOW_HOURS = 24;

export const APPOINTMENT_STATUS_LABELS: Readonly<Record<AppointmentStatus, string>> = {
  requested: 'Por confirmar',
  confirmed: 'Confirmada',
  in_progress: 'En curso',
  done: 'Hecha',
  cancelled: 'Cancelada',
  no_show: 'No se presentó',
};

/** Los estados que todavía ocupan un cupo en la agenda. */
export const OPEN_STATUSES: readonly AppointmentStatus[] = ['requested', 'confirmed', 'in_progress'];

/**
 * ¿Se puede cancelar ahora? Solo una cita por confirmar o confirmada, y solo si
 * falta **más de 24 horas**. Espeja `cancel_appointment()` (migración 0019): el
 * botón se esconde con esto, pero quien decide es la base.
 */
export function canCancel(
  appointment: { status: AppointmentStatus; scheduledAt: Date },
  now: Date = new Date(),
): boolean {
  return (
    (appointment.status === 'requested' || appointment.status === 'confirmed') &&
    appointment.scheduledAt.getTime() - now.getTime() > CANCEL_WINDOW_HOURS * 3_600_000
  );
}

/**
 * Los pasos que una cita puede dar. Espeja `set_appointment_status()`:
 *
 *   requested → confirmed · cancelled
 *   confirmed → in_progress · done · cancelled · no_show
 *   in_progress → done · cancelled
 */
export function nextAppointmentStatuses(status: AppointmentStatus): AppointmentStatus[] {
  switch (status) {
    case 'requested':
      return ['confirmed', 'cancelled'];
    case 'confirmed':
      return ['in_progress', 'done', 'cancelled', 'no_show'];
    case 'in_progress':
      return ['done', 'cancelled'];
    default:
      return [];
  }
}

/** El texto del botón que lleva una cita a cada estado. */
export const APPOINTMENT_ACTION_LABELS: Readonly<Record<AppointmentStatus, string>> = {
  requested: 'Volver a por confirmar',
  confirmed: 'Confirmar la cita',
  in_progress: 'Empezar el trabajo',
  done: 'Marcar como hecha',
  cancelled: 'Cancelar la cita',
  no_show: 'No se presentó',
};
