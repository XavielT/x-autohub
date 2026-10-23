import { AvailabilityRule, Blackout } from '../models/service.model';
import { BOOKING_HORIZON_DAYS, computeSlots } from './slots';
import { addDays, localDate, localTime, slotInstant } from './service-time';

/**
 * `computeSlots()` espeja `available_slots()` de Postgres (migración 0019) para el
 * modo simulado. `verify-migrations.sh` fija la mitad de la base; esto fija esta: el
 * mismo horario, los mismos cierres y la misma capacidad dan las mismas horas.
 */
describe('computeSlots', () => {
  const rule = (over: Partial<AvailabilityRule> = {}): AvailabilityRule => ({
    id: 1, weekday: 1, opensAt: '08:00', closesAt: '17:00', slotMinutes: 60, capacity: 2, isExample: false, ...over,
  });

  // Un lunes bien adelante, para que "ya pasó" no estorbe, y "ahora" bien antes.
  const MONDAY = '2026-11-02';
  const NOW = new Date('2026-10-23T12:00:00Z');
  const none = () => 0;

  const slots = (over: Partial<Parameters<typeof computeSlots>[0]> = {}) =>
    computeSlots({ date: MONDAY, rules: [rule()], blackouts: [], taken: none, now: NOW, ...over });

  const hours = (list: ReturnType<typeof slots>) => list.map((s) => localTime(s.at));

  it('de 8:00 a 17:00 con franjas de 60 minutos hay 9: la última empieza a las 16:00', () => {
    expect(hours(slots())).toEqual(['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
  });

  it('cada franja trae sus cupos', () => {
    expect(slots().every((s) => s.remaining === 2)).toBe(true);
  });

  it('el sábado cierra a la 1: de 8:00 a 12:00', () => {
    const list = slots({ date: '2026-11-07', rules: [rule({ weekday: 6, closesAt: '13:00' })] });

    expect(hours(list)).toEqual(['08:00', '09:00', '10:00', '11:00', '12:00']);
  });

  it('un día sin regla es un día cerrado', () => {
    expect(slots({ date: '2026-11-08' })).toEqual([]); // domingo
  });

  it('franjas de 30 minutos', () => {
    const list = slots({ rules: [rule({ opensAt: '09:00', closesAt: '11:00', slotMinutes: 30 })] });

    expect(hours(list)).toEqual(['09:00', '09:30', '10:00', '10:30']);
  });

  it('lo que ya pasó no se ofrece', () => {
    // "Ahora" son las 10:30 del propio lunes: quedan de las 11:00 en adelante.
    const list = slots({ now: slotInstant(MONDAY, '10:30') });

    expect(hours(list)[0]).toBe('11:00');
  });

  it('una franja que empieza justo ahora ya no se ofrece', () => {
    const list = slots({ now: slotInstant(MONDAY, '10:00') });

    expect(hours(list)).not.toContain('10:00');
    expect(hours(list)[0]).toBe('11:00');
  });

  it('un día entero en el pasado no tiene horas', () => {
    expect(slots({ now: slotInstant('2026-11-03', '08:00') })).toEqual([]);
  });

  describe('capacidad', () => {
    it('resta las citas ya tomadas y deja los cupos que quedan', () => {
      const taken = (at: Date) => (+at === +slotInstant(MONDAY, '09:00') ? 1 : 0);

      expect(slots({ taken }).find((s) => localTime(s.at) === '09:00')?.remaining).toBe(1);
    });

    it('una franja llena desaparece', () => {
      const taken = (at: Date) => (+at === +slotInstant(MONDAY, '09:00') ? 2 : 0);

      expect(hours(slots({ taken }))).not.toContain('09:00');
    });

    it('con capacidad 1, una sola cita llena la franja', () => {
      const list = slots({ rules: [rule({ capacity: 1 })], taken: (at) => (+at === +slotInstant(MONDAY, '08:00') ? 1 : 0) });

      expect(hours(list)).not.toContain('08:00');
    });
  });

  describe('cierres', () => {
    const blackout = (from: string, to: string): Blackout => ({
      id: 1, startsAt: slotInstant(MONDAY, from), endsAt: slotInstant(MONDAY, to), reason: 'Cierre',
    });

    it('quita las franjas que cubre', () => {
      expect(hours(slots({ blackouts: [blackout('08:00', '10:00')] }))).toEqual(
        ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'],
      );
    });

    it('el cierre incluye su inicio y excluye su fin', () => {
      const list = hours(slots({ blackouts: [blackout('09:00', '10:00')] }));

      expect(list).not.toContain('09:00');
      expect(list).toContain('10:00');
    });

    it('un cierre de todo el día no deja nada', () => {
      expect(slots({ blackouts: [blackout('00:00', '23:59')] })).toEqual([]);
    });
  });

  it('dos tramos el mismo día (mañana y tarde) suman sus franjas, en orden', () => {
    const list = slots({
      rules: [rule({ id: 1, opensAt: '14:00', closesAt: '16:00' }), rule({ id: 2, opensAt: '08:00', closesAt: '10:00' })],
    });

    expect(hours(list)).toEqual(['08:00', '09:00', '14:00', '15:00']);
  });

  describe('horizonte', () => {
    it(`más allá de ${BOOKING_HORIZON_DAYS} días no hay nada`, () => {
      const far = addDays(localDate(NOW), BOOKING_HORIZON_DAYS + 1);

      expect(computeSlots({ date: far, rules: [1, 2, 3, 4, 5, 6, 0].map((weekday) => rule({ weekday })), blackouts: [], taken: none, now: NOW })).toEqual([]);
    });

    it('el último día del horizonte sí', () => {
      const edge = addDays(localDate(NOW), BOOKING_HORIZON_DAYS);

      expect(computeSlots({ date: edge, rules: [1, 2, 3, 4, 5, 6, 0].map((weekday) => rule({ weekday })), blackouts: [], taken: none, now: NOW }).length).toBeGreaterThan(0);
    });
  });
});
