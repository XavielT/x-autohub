import { buildMonth, monthHasBookableDay, shiftMonth } from './calendar';

describe('calendar', () => {
  // Octubre de 2026: el 1 es jueves y tiene 31 días.
  const TODAY = '2026-10-15';
  const october = () => buildMonth(2026, 10, TODAY);
  const cells = () => october().weeks.flat();
  const day = (n: number) => cells().find((c) => c.day === n)!;

  it('tiene semanas de 7 celdas que empiezan en lunes', () => {
    expect(october().weeks.every((w) => w.length === 7)).toBe(true);
    // El 1 de octubre es jueves: 3 huecos antes (lun, mar, mié).
    expect(october().weeks[0].slice(0, 3).every((c) => c.date === null)).toBe(true);
    expect(october().weeks[0][3].day).toBe(1);
  });

  it('un mes que empieza en lunes no tiene huecos al principio', () => {
    // Junio de 2026 empieza en lunes.
    expect(buildMonth(2026, 6, '2026-06-01').weeks[0][0].day).toBe(1);
  });

  it('un mes que empieza en domingo tiene seis huecos', () => {
    // Noviembre de 2026 empieza en domingo.
    const first = buildMonth(2026, 11, '2026-10-01').weeks[0];

    expect(first.filter((c) => c.date === null)).toHaveLength(6);
    expect(first[6].day).toBe(1);
  });

  it('trae todos los días del mes, y febrero bisiesto 29', () => {
    expect(cells().filter((c) => c.date !== null)).toHaveLength(31);
    expect(buildMonth(2028, 2, '2028-01-01').weeks.flat().filter((c) => c.date !== null)).toHaveLength(29);
    expect(buildMonth(2026, 2, '2026-01-01').weeks.flat().filter((c) => c.date !== null)).toHaveLength(28);
  });

  it('la última semana se completa con huecos', () => {
    const last = october().weeks.at(-1)!;

    expect(last).toHaveLength(7);
    expect(last.filter((c) => c.date === null).length).toBeGreaterThan(0);
  });

  it('los días pasados están deshabilitados, y hoy no', () => {
    expect(day(14).disabled).toBe(true);
    expect(day(1).disabled).toBe(true);
    expect(day(15).disabled).toBe(false);
    expect(day(16).disabled).toBe(false);
  });

  it('marca cuál es hoy', () => {
    expect(day(15).isToday).toBe(true);
    expect(day(16).isToday).toBe(false);
    expect(cells().filter((c) => c.isToday)).toHaveLength(1);
  });

  it('los huecos están deshabilitados y sin fecha', () => {
    for (const c of cells().filter((x) => x.date === null)) {
      expect(c.disabled).toBe(true);
      expect(c.day).toBeNull();
    }
  });

  it('más allá de 90 días también se deshabilita', () => {
    // 90 días después del 15 de octubre de 2026 es el 13 de enero de 2027.
    const january = buildMonth(2027, 1, TODAY);

    expect(january.weeks.flat().find((c) => c.day === 13)!.disabled).toBe(false);
    expect(january.weeks.flat().find((c) => c.day === 14)!.disabled).toBe(true);
  });

  it('el título es el mes y el año', () => {
    expect(october().label).toBe('octubre 2026');
  });

  it('un mes entero en el pasado no tiene nada que ofrecer', () => {
    expect(monthHasBookableDay(2026, 9, TODAY)).toBe(false);
    expect(monthHasBookableDay(2026, 10, TODAY)).toBe(true);
    expect(monthHasBookableDay(2026, 11, TODAY)).toBe(true);
    expect(monthHasBookableDay(2027, 3, TODAY)).toBe(false); // pasa del horizonte
  });

  it('shiftMonth cruza el año en los dos sentidos', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 10, 0)).toEqual({ year: 2026, month: 10 });
  });
});
