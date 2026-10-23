/**
 * Un archivo `.ics` (iCalendar, RFC 5545) para que la cita se agregue al calendario
 * del teléfono. Se genera **en el navegador**: no hay servidor que lo arme.
 *
 * Tres cosas que un `.ics` exige y que se rompen en silencio si se olvidan:
 *   · Las líneas terminan en **CRLF**, no en LF.
 *   · Las fechas van en UTC (`20261023T120000Z`): es el único formato que todos los
 *     calendarios interpretan igual, y así el evento cae a la hora correcta sin
 *     importar el huso de quien lo abre.
 *   · `,` `;` `\` y los saltos de línea del texto se escapan, y las líneas largas
 *     se parten a 75 octetos. Un título con coma sin escapar corta el campo.
 */

export interface IcsEvent {
  /** Identificador estable: el mismo evento, el mismo UID. */
  uid: string;
  start: Date;
  durationMinutes: number;
  summary: string;
  description?: string;
  location?: string;
  /** El instante en que se genera. Se pasa de fuera para poder probarlo. */
  now?: Date;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** `2026-10-23T12:00:00Z` → `20261023T120000Z`. */
export function icsDate(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Escapa un valor de texto: barra, punto y coma, coma y saltos de línea. */
export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Parte una línea a 75 octetos; las siguientes empiezan con un espacio. */
export function icsFold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = '';
  for (const char of line) {
    // La primera línea admite 75 octetos; las siguientes 74, porque llevan el espacio.
    const limit = parts.length === 0 ? 75 : 74;
    if (encoder.encode(current + char).length > limit) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);

  return parts.map((p, i) => (i === 0 ? p : ` ${p}`)).join('\r\n');
}

export function buildIcs(event: IcsEvent): string {
  const end = new Date(event.start.getTime() + event.durationMinutes * 60_000);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//X AutoHub//Citas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${icsDate(event.now ?? new Date())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(event.summary)}`,
    ...(event.description ? [`DESCRIPTION:${icsEscape(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${icsEscape(event.location)}`] : []),
    'STATUS:TENTATIVE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(icsFold).join('\r\n') + '\r\n';
}
