import { compactNumber } from './compact-number';

/**
 * El formato de los contadores del home.
 *
 * Lo que fija, sobre todo: **a un número real no se le añade nunca un "+"**. El
 * "280+" de la sección es una promesa que escribió alguien, no un formato, y
 * vive en `showcase-stats.ts`. Si el día que el sitio tenga 7 vehículos el home
 * dice "7+", el contador miente por su cuenta.
 */
describe('compactNumber', () => {
  it('los numeros de tres cifras van tal cual', () => {
    expect(compactNumber(0)).toBe('0');
    expect(compactNumber(7)).toBe('7');
    expect(compactNumber(42)).toBe('42');
    expect(compactNumber(280)).toBe('280');
    expect(compactNumber(999)).toBe('999');
  });

  it('a partir de mil, un decimal y K', () => {
    expect(compactNumber(1000)).toBe('1K');
    expect(compactNumber(1200)).toBe('1.2K');
    expect(compactNumber(1250)).toBe('1.3K');
    expect(compactNumber(1300)).toBe('1.3K');
    expect(compactNumber(2800)).toBe('2.8K');
    expect(compactNumber(9949)).toBe('9.9K');
  });

  it('a partir de diez mil, sin decimal', () => {
    expect(compactNumber(10_000)).toBe('10K');
    expect(compactNumber(12_345)).toBe('12K');
    expect(compactNumber(999_000)).toBe('999K');
  });

  it('y millones con M', () => {
    expect(compactNumber(1_000_000)).toBe('1M');
    expect(compactNumber(1_450_000)).toBe('1.5M');
    expect(compactNumber(23_000_000)).toBe('23M');
  });

  it('nunca inventa un "+" ni un separador de miles', () => {
    for (const value of [7, 280, 1300, 12_345, 1_450_000]) {
      const text = compactNumber(value);
      expect(text).not.toContain('+');
      expect(text).not.toContain(',');
    }
  });

  it('aguanta basura sin romper la portada', () => {
    expect(compactNumber(Number.NaN)).toBe('0');
    expect(compactNumber(-5)).toBe('0');
    expect(compactNumber(Number.POSITIVE_INFINITY)).toBe('0');
  });
});
