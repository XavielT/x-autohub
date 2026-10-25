import { PUBLICATION_DAYS, daysLeft, isExpired, isLive, isSold, newExpiry } from './publication-lifecycle';

const NOW = new Date('2026-10-25T12:00:00Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

describe('publication-lifecycle', () => {
  it('una publicación sin fechas (lo sembrado) está a la venta y no vence', () => {
    expect(isSold({})).toBe(false);
    expect(isExpired({}, NOW)).toBe(false);
    expect(isLive({}, NOW)).toBe(true);
    expect(daysLeft({}, NOW)).toBeNull();
  });

  it('dentro de plazo y sin vender, está a la venta', () => {
    expect(isLive({ expiresAt: inDays(10) }, NOW)).toBe(true);
  });

  it('vencida: la fecha ya pasó, y justo en la fecha también', () => {
    expect(isExpired({ expiresAt: inDays(-1) }, NOW)).toBe(true);
    expect(isExpired({ expiresAt: NOW.toISOString() }, NOW)).toBe(true);
    expect(isLive({ expiresAt: inDays(-1) }, NOW)).toBe(false);
  });

  it('vendida sale de lo vivo aunque le sobre plazo', () => {
    const item = { soldAt: NOW.toISOString(), expiresAt: inDays(30) };

    expect(isSold(item)).toBe(true);
    expect(isLive(item, NOW)).toBe(false);
  });

  it('daysLeft cuenta días enteros hacia abajo, y es negativo si ya venció', () => {
    expect(daysLeft({ expiresAt: inDays(7) }, NOW)).toBe(7);
    expect(daysLeft({ expiresAt: new Date(NOW.getTime() + 36 * 60 * 60 * 1000).toISOString() }, NOW)).toBe(1);
    expect(daysLeft({ expiresAt: new Date(NOW.getTime() + 3 * 60 * 60 * 1000).toISOString() }, NOW)).toBe(0);
    expect(daysLeft({ expiresAt: inDays(-2) }, NOW)).toBe(-2);
  });

  it('newExpiry es el plazo de la migración, 60 días', () => {
    expect(PUBLICATION_DAYS).toBe(60);
    expect(newExpiry(NOW)).toBe(inDays(60));
  });
});
