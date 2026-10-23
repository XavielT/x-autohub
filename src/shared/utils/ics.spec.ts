import { buildIcs, icsDate, icsEscape, icsFold } from './ics';

describe('ics', () => {
  const event = {
    uid: 'abc-123@xautohubrd.com',
    start: new Date('2026-10-23T12:00:00Z'),
    durationMinutes: 90,
    summary: 'Cita en X AutoHub: Frenos',
    description: 'Cita #2001 (por confirmar).\nVehículo: Toyota Corolla 2015',
    location: 'Av. Principal 1, Santiago',
    now: new Date('2026-10-20T15:30:45Z'),
  };

  it('las fechas van en UTC con el formato de iCalendar', () => {
    expect(icsDate(new Date('2026-10-23T12:00:00Z'))).toBe('20261023T120000Z');
    expect(icsDate(new Date('2026-01-05T03:04:05Z'))).toBe('20260105T030405Z');
  });

  it('escapa la barra, el punto y coma, la coma y los saltos de línea', () => {
    expect(icsEscape('a, b; c \\ d\ne')).toBe('a\\, b\\; c \\\\ d\\ne');
  });

  it('el archivo es un VCALENDAR con un VEVENT y termina cada línea en CRLF', () => {
    const ics = buildIcs(event);
    const lines = ics.split('\r\n');

    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.at(-2)).toBe('END:VCALENDAR');
    expect(lines.at(-1)).toBe(''); // termina con CRLF
    expect(ics).not.toMatch(/[^\r]\n/); // ningún LF suelto
    expect(lines).toContain('BEGIN:VEVENT');
    expect(lines).toContain('END:VEVENT');
    expect(lines).toContain('VERSION:2.0');
  });

  it('trae el inicio, el fin según la duración, y el sello', () => {
    const ics = buildIcs(event);

    expect(ics).toContain('UID:abc-123@xautohubrd.com');
    expect(ics).toContain('DTSTART:20261023T120000Z');
    expect(ics).toContain('DTEND:20261023T133000Z'); // +90 min
    expect(ics).toContain('DTSTAMP:20261020T153045Z');
  });

  it('el título con dos puntos y la ubicación con coma quedan bien escapados', () => {
    const ics = buildIcs(event);

    expect(ics).toContain('SUMMARY:Cita en X AutoHub: Frenos');
    expect(ics).toContain('LOCATION:Av. Principal 1\\, Santiago');
  });

  it('la descripción multilínea queda en una sola línea lógica con \\n', () => {
    expect(buildIcs(event)).toContain('DESCRIPTION:Cita #2001 (por confirmar).\\nVehículo: Toyota Corolla 2015');
  });

  it('sin descripción ni ubicación no escribe esos campos vacíos', () => {
    const ics = buildIcs({ ...event, description: undefined, location: undefined });

    expect(ics).not.toContain('DESCRIPTION');
    expect(ics).not.toContain('LOCATION');
  });

  it('una línea de más de 75 octetos se parte y la continuación empieza con un espacio', () => {
    const long = `SUMMARY:${'x'.repeat(200)}`;
    const folded = icsFold(long).split('\r\n');

    expect(folded.length).toBeGreaterThan(1);
    expect(new TextEncoder().encode(folded[0]).length).toBeLessThanOrEqual(75);
    expect(folded.slice(1).every((l) => l.startsWith(' '))).toBe(true);
    expect(folded.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(long);
  });

  it('partir cuenta octetos, no letras: un acento ocupa dos', () => {
    const folded = icsFold(`SUMMARY:${'é'.repeat(80)}`).split('\r\n');

    expect(folded.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });

  it('una línea corta no se toca', () => {
    expect(icsFold('SUMMARY:corta')).toBe('SUMMARY:corta');
  });
});
