import { AvailabilityRule } from '../models/service.model';
import { formatClock, summarizeHours } from './hours';
import { formatDuration } from './format-duration';

const rule = (weekday: number, opensAt = '08:00', closesAt = '17:00'): AvailabilityRule => ({
  id: weekday + 1, weekday, opensAt, closesAt, slotMinutes: 60, capacity: 2, isExample: false,
});

describe('summarizeHours', () => {
  it('junta los días seguidos con las mismas horas', () => {
    const lines = summarizeHours([1, 2, 3, 4, 5].map((d) => rule(d)));

    expect(lines).toEqual([{ days: 'Lun – Vie', hours: '8:00 a. m. – 5:00 p. m.' }]);
  });

  it('el sábado con otro horario va en su propia línea', () => {
    const lines = summarizeHours([...[1, 2, 3, 4, 5].map((d) => rule(d)), rule(6, '08:00', '13:00')]);

    expect(lines).toEqual([
      { days: 'Lun – Vie', hours: '8:00 a. m. – 5:00 p. m.' },
      { days: 'Sáb', hours: '8:00 a. m. – 1:00 p. m.' },
    ]);
  });

  it('un día cerrado en medio parte el tramo en dos', () => {
    const lines = summarizeHours([rule(1), rule(2), rule(4), rule(5)]);

    expect(lines.map((l) => l.days)).toEqual(['Lun – Mar', 'Jue – Vie']);
  });

  it('el domingo va al final, como se lee en RD', () => {
    const lines = summarizeHours([rule(0, '09:00', '12:00'), rule(1)]);

    expect(lines.map((l) => l.days)).toEqual(['Lun', 'Dom']);
  });

  it('dos tramos el mismo día se leen "mañana y tarde"', () => {
    const lines = summarizeHours([rule(1, '08:00', '12:00'), rule(1, '14:00', '18:00')]);

    expect(lines[0].hours).toBe('8:00 a. m. – 12:00 p. m. y 2:00 p. m. – 6:00 p. m.');
  });

  it('sin reglas no hay horario', () => {
    expect(summarizeHours([])).toEqual([]);
  });
});

describe('formatClock', () => {
  it('lee las 24 horas como a. m. y p. m., con las 12 en su sitio', () => {
    expect(formatClock('00:00')).toBe('12:00 a. m.');
    expect(formatClock('08:30')).toBe('8:30 a. m.');
    expect(formatClock('12:00')).toBe('12:00 p. m.');
    expect(formatClock('13:05')).toBe('1:05 p. m.');
    expect(formatClock('23:59')).toBe('11:59 p. m.');
  });
});

describe('formatDuration', () => {
  it('se lee como se dice', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1 h 30 min');
    expect(formatDuration(120)).toBe('2 h');
  });

  it('un valor que no sirve no escribe nada', () => {
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(-5)).toBe('');
    expect(formatDuration(Number.NaN)).toBe('');
  });
});
