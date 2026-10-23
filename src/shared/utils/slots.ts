import { AvailabilityRule, Blackout, Slot } from '../models/service.model';
import { addDays, localDate, slotInstant, weekdayOf } from './service-time';

/** Hasta dónde se puede agendar: igual que `available_slots()` en Postgres. */
export const BOOKING_HORIZON_DAYS = 90;

export interface SlotInput {
  /** `YYYY-MM-DD`, en Santo Domingo. */
  date: string;
  rules: readonly AvailabilityRule[];
  blackouts: readonly Blackout[];
  /** Cuántas citas ocupan ya esa franja (requested, confirmed o in_progress). */
  taken: (at: Date) => number;
  now: Date;
}

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const hhmm = (total: number): string =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

/**
 * Las franjas libres de un día. **Espeja `available_slots()` de Postgres**
 * (migración 0019) para el modo simulado, y es lo que fija `slots.spec.ts`: el
 * mismo horario, los mismos cierres y la misma capacidad dan las mismas horas aquí
 * y en la base. En producción la que manda es la base; esto nunca decide una cita.
 *
 *   · Cada regla del día de la semana genera franjas desde que abre hasta que
 *     cierra **menos una franja** (la última empieza una franja antes del cierre).
 *   · Se descarta lo que ya pasó, lo que cae dentro de un cierre (el cierre incluye
 *     su inicio y excluye su fin) y lo que ya no tiene cupo.
 *   · Más allá de 90 días no hay nada.
 */
export function computeSlots(input: SlotInput): Slot[] {
  const { date, rules, blackouts, taken, now } = input;

  if (date > addDays(localDate(now), BOOKING_HORIZON_DAYS)) return [];

  const slots: Slot[] = [];

  for (const rule of rules.filter((r) => r.weekday === weekdayOf(date))) {
    const last = minutes(rule.closesAt) - rule.slotMinutes;

    for (let t = minutes(rule.opensAt); t <= last; t += rule.slotMinutes) {
      const at = slotInstant(date, hhmm(t));

      if (at <= now) continue;
      if (blackouts.some((b) => at >= b.startsAt && at < b.endsAt)) continue;

      const remaining = rule.capacity - taken(at);
      if (remaining > 0) slots.push({ at, remaining });
    }
  }

  return slots.sort((a, b) => +a.at - +b.at);
}
