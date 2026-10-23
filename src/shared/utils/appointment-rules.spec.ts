import { AppointmentStatus } from '../models/service.model';
import {
  APPOINTMENT_STATUS_LABELS,
  CANCEL_WINDOW_HOURS,
  OPEN_STATUSES,
  canCancel,
  nextAppointmentStatuses,
} from './appointment-rules';

const HOUR = 3_600_000;

describe('canCancel (la regla de 24 horas)', () => {
  const NOW = new Date('2026-10-23T12:00:00Z');
  const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

  it('con más de 24 horas se puede cancelar', () => {
    expect(canCancel({ status: 'requested', scheduledAt: at(24.1) }, NOW)).toBe(true);
    expect(canCancel({ status: 'confirmed', scheduledAt: at(72) }, NOW)).toBe(true);
  });

  it('justo a las 24 horas ya no: tiene que ser MÁS de 24', () => {
    expect(canCancel({ status: 'confirmed', scheduledAt: at(24) }, NOW)).toBe(false);
  });

  it('con menos de 24 horas no', () => {
    expect(canCancel({ status: 'requested', scheduledAt: at(23.9) }, NOW)).toBe(false);
    expect(canCancel({ status: 'requested', scheduledAt: at(1) }, NOW)).toBe(false);
  });

  it('una cita que ya pasó no se cancela', () => {
    expect(canCancel({ status: 'confirmed', scheduledAt: at(-2) }, NOW)).toBe(false);
  });

  it('solo una por confirmar o confirmada: una hecha, en curso o cancelada no', () => {
    for (const status of ['in_progress', 'done', 'cancelled', 'no_show'] as AppointmentStatus[]) {
      expect(canCancel({ status, scheduledAt: at(72) }, NOW), status).toBe(false);
    }
  });

  it('la ventana es de 24 horas', () => {
    expect(CANCEL_WINDOW_HOURS).toBe(24);
  });
});

/** Espeja `set_appointment_status()` (migración 0019). */
describe('nextAppointmentStatuses', () => {
  it('requested → confirmed o cancelled', () => {
    expect(nextAppointmentStatuses('requested')).toEqual(['confirmed', 'cancelled']);
  });

  it('confirmed → en curso, hecha, cancelada o no se presentó', () => {
    expect(nextAppointmentStatuses('confirmed')).toEqual(['in_progress', 'done', 'cancelled', 'no_show']);
  });

  it('in_progress → hecha o cancelada', () => {
    expect(nextAppointmentStatuses('in_progress')).toEqual(['done', 'cancelled']);
  });

  it('hecha, cancelada y no se presentó son finales', () => {
    for (const status of ['done', 'cancelled', 'no_show'] as AppointmentStatus[]) {
      expect(nextAppointmentStatuses(status), status).toEqual([]);
    }
  });

  it('no se salta: de requested no se va a done', () => {
    expect(nextAppointmentStatuses('requested')).not.toContain('done');
  });
});

describe('estados', () => {
  it('cada estado tiene su etiqueta en español', () => {
    expect(Object.keys(APPOINTMENT_STATUS_LABELS).sort()).toEqual(
      ['cancelled', 'confirmed', 'done', 'in_progress', 'no_show', 'requested'],
    );
    expect(APPOINTMENT_STATUS_LABELS.requested).toBe('Por confirmar');
  });

  it('los que ocupan cupo son los tres abiertos', () => {
    expect(OPEN_STATUSES).toEqual(['requested', 'confirmed', 'in_progress']);
  });
});
