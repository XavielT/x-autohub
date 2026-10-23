import {
  addDays,
  formatTime,
  formatWhen,
  localDate,
  localTime,
  slotInstant,
  weekdayOf,
} from './service-time';

/**
 * La hora del taller es la de Santo Domingo (UTC-4, sin horario de verano). Estas
 * pruebas fijan la conversión en los dos sentidos: el mismo reloj tiene que dar las
 * mismas horas en la base (`available_slots()`, que usa el nombre de la zona) y aquí.
 */
describe('service-time', () => {
  it('las 8:00 de Santo Domingo son las 12:00 UTC', () => {
    expect(slotInstant('2026-10-23', '08:00').toISOString()).toBe('2026-10-23T12:00:00.000Z');
  });

  it('las 22:00 de Santo Domingo ya son del día siguiente en UTC', () => {
    expect(slotInstant('2026-10-23', '22:00').toISOString()).toBe('2026-10-24T02:00:00.000Z');
  });

  it('localDate y localTime son la inversa de slotInstant', () => {
    const at = slotInstant('2026-12-31', '23:30');

    expect(localDate(at)).toBe('2026-12-31');
    expect(localTime(at)).toBe('23:30');
  });

  it('un instante de madrugada en UTC es todavía el día anterior en Santo Domingo', () => {
    // 02:00 UTC del 24 = 22:00 del 23 en Santo Domingo.
    expect(localDate(new Date('2026-10-24T02:00:00Z'))).toBe('2026-10-23');
  });

  it('weekdayOf usa 0 = domingo, como extract(dow ...)', () => {
    expect(weekdayOf('2026-10-25')).toBe(0); // domingo
    expect(weekdayOf('2026-10-26')).toBe(1); // lunes
    expect(weekdayOf('2026-10-31')).toBe(6); // sábado
  });

  it('addDays cruza meses y años', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('muestra la hora de Santo Domingo sin importar el huso del navegador', () => {
    // 12:00 UTC = 8:00 a. m. en Santo Domingo.
    expect(formatTime(new Date('2026-10-23T12:00:00Z'))).toMatch(/^8:00/);
    expect(formatWhen(new Date('2026-10-23T12:00:00Z'))).toMatch(/octubre/);
  });
});
