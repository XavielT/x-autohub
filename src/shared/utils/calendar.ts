import { addDays, weekdayOf } from './service-time';
import { BOOKING_HORIZON_DAYS } from './slots';

/** Un día del calendario. `date` es `YYYY-MM-DD`; `null` es un hueco antes del día 1. */
export interface CalendarDay {
  date: string | null;
  day: number | null;
  /** Ya pasó, o está más allá de lo que se puede agendar. */
  disabled: boolean;
  isToday: boolean;
}

export interface CalendarMonth {
  year: number;
  /** 1 a 12. */
  month: number;
  label: string;
  /** Semanas de lunes a domingo, de 7 celdas cada una. */
  weeks: CalendarDay[][];
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const WEEKDAY_HEADERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * El mes de un calendario, hecho a mano: las semanas empiezan en lunes (como en RD)
 * y los días que **ya pasaron** o están más allá de 90 días vienen deshabilitados.
 *
 * `today` es el día de hoy en Santo Domingo (`YYYY-MM-DD`, ver `localDate`); se pasa
 * de fuera para que el calendario no dependa del reloj del navegador y se pueda
 * probar con cualquier fecha.
 */
export function buildMonth(year: number, month: number, today: string): CalendarMonth {
  const first = `${year}-${pad(month)}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastBookable = addDays(today, BOOKING_HORIZON_DAYS);

  // Lunes = 0 … domingo = 6.
  const lead = (weekdayOf(first) + 6) % 7;

  const cells: CalendarDay[] = Array.from({ length: lead }, () => ({
    date: null, day: null, disabled: true, isToday: false,
  }));

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${pad(month)}-${pad(day)}`;
    cells.push({ date, day, disabled: date < today || date > lastBookable, isToday: date === today });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ date: null, day: null, disabled: true, isToday: false });
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return { year, month, label: `${MONTHS[month - 1]} ${year}`, weeks };
}

/** El mes anterior o siguiente. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** ¿Hay algo que mostrar en este mes? Un mes entero en el pasado no se ofrece. */
export function monthHasBookableDay(year: number, month: number, today: string): boolean {
  return buildMonth(year, month, today).weeks.some((w) => w.some((d) => d.date !== null && !d.disabled));
}
