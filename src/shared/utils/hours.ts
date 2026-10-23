import { AvailabilityRule } from '../models/service.model';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Los días en el orden en que se leen en RD: de lunes a domingo. */
const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** `17:00` → `5:00 p. m.`. */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'p. m.' : 'a. m.';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const weekdayName = (weekday: number): string => DAY_NAMES[weekday] ?? '';

export interface HoursLine {
  /** "Lun – Vie" o "Sáb". */
  days: string;
  /** "8:00 a. m. – 5:00 p. m.". */
  hours: string;
}

/**
 * El horario como se lee en una línea por tramo: los días seguidos con las mismas
 * horas se juntan ("Lun – Vie · 8:00 a. m. – 5:00 p. m.", "Sáb · 8:00 a. m. –
 * 1:00 p. m."). Un día sin regla es un día cerrado y no aparece.
 */
export function summarizeHours(rules: readonly AvailabilityRule[]): HoursLine[] {
  const byDay = new Map<number, string>();
  for (const rule of rules) {
    const range = `${formatClock(rule.opensAt)} – ${formatClock(rule.closesAt)}`;
    byDay.set(rule.weekday, byDay.has(rule.weekday) ? `${byDay.get(rule.weekday)} y ${range}` : range);
  }

  const lines: HoursLine[] = [];
  let run: { first: number; last: number; hours: string } | null = null;

  for (const weekday of ORDER) {
    const hours = byDay.get(weekday);
    if (hours === undefined) {
      if (run) lines.push(toLine(run));
      run = null;
    } else if (run && run.hours === hours) {
      run.last = weekday;
    } else {
      if (run) lines.push(toLine(run));
      run = { first: weekday, last: weekday, hours };
    }
  }
  if (run) lines.push(toLine(run));

  return lines;
}

function toLine(run: { first: number; last: number; hours: string }): HoursLine {
  return {
    days: run.first === run.last ? DAY_SHORT[run.first] : `${DAY_SHORT[run.first]} – ${DAY_SHORT[run.last]}`,
    hours: run.hours,
  };
}
