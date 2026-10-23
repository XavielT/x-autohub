/**
 * La hora del taller es la de República Dominicana.
 *
 * `America/Santo_Domingo` no tiene horario de verano: siempre es UTC-4. El taller
 * abre "de 8:00 a 17:00" **en su hora**, no en la del servidor ni en la de quien
 * agenda desde otro huso. Postgres hace estas cuentas con el nombre de la zona
 * (`available_slots()`, migración 0019); aquí se espeja con el desfase fijo, que es
 * exacto mientras RD no tenga horario de verano, para el modo simulado y para
 * mostrar las horas.
 */
export const SERVICE_TZ = 'America/Santo_Domingo';

/** UTC-4: horas que hay que **sumar** a una hora de Santo Domingo para tener UTC. */
const OFFSET_HOURS = 4;

const pad = (n: number): string => String(n).padStart(2, '0');

/** `2026-10-23` → el instante en que son las `08:00` de ese día en Santo Domingo. */
export function slotInstant(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh + OFFSET_HOURS, mm));
}

/** El día (`YYYY-MM-DD`) que es en Santo Domingo en este instante. */
export function localDate(instant: Date): string {
  const shifted = new Date(instant.getTime() - OFFSET_HOURS * 3_600_000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** La hora (`HH:mm`) que es en Santo Domingo en este instante. */
export function localTime(instant: Date): string {
  const shifted = new Date(instant.getTime() - OFFSET_HOURS * 3_600_000);
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** 0 = domingo … 6 = sábado, como `extract(dow ...)`, del día `YYYY-MM-DD`. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Suma días a un `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** "8:00 a. m." — la hora en Santo Domingo, sin importar dónde esté el navegador. */
export function formatTime(instant: Date): string {
  return new Intl.DateTimeFormat('es-DO', { hour: 'numeric', minute: '2-digit', timeZone: SERVICE_TZ }).format(instant);
}

/** "jueves, 23 de octubre". */
export function formatDay(instant: Date): string {
  return new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: SERVICE_TZ }).format(instant);
}

/** "jueves, 23 de octubre, 8:00 a. m.". */
export function formatWhen(instant: Date): string {
  return `${formatDay(instant)}, ${formatTime(instant)}`;
}
