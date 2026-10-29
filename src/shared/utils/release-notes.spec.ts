import { compareVersions, maxVersion, parseVersion, pendingReleases } from './release-notes';

const v = (version: string) => ({ version });

describe('release-notes', () => {
  it('parsea solo tres números', () => {
    expect(parseVersion('2.30.1')).toEqual([2, 30, 1]);
    expect(parseVersion('v2.30.1')).toBeNull();
    expect(parseVersion('2.30')).toBeNull();
    expect(parseVersion(null)).toBeNull();
  });

  it('compara por número, no por texto: 2.9.0 < 2.10.0', () => {
    expect(compareVersions('2.9.0', '2.10.0')).toBeLessThan(0);
    expect(compareVersions('2.30.0', '2.29.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('basura', '0.0.1')).toBeLessThan(0);
  });

  it('maxVersion toma la mayor y deja pasar la única que existe', () => {
    expect(maxVersion('2.29.0', '2.30.0')).toBe('2.30.0');
    expect(maxVersion(null, '2.1.0')).toBe('2.1.0');
    expect(maxVersion('2.1.0', 'x')).toBe('2.1.0');
    expect(maxVersion(null, null)).toBeNull();
  });

  it('las pendientes: mayores que la vista, hasta la actual, las más nuevas primero', () => {
    const all = ['2.28.0', '2.29.0', '2.29.1', '2.30.0', '2.31.0'].map(v);
    const { shown, hasMore } = pendingReleases(all, '2.28.0', '2.30.0');

    expect(shown.map((r) => r.version)).toEqual(['2.30.0', '2.29.1', '2.29.0']);
    expect(hasMore).toBe(false);
  });

  it('tope de 3: si hay más, las 3 más recientes y hasMore', () => {
    const all = ['2.26.0', '2.27.0', '2.28.0', '2.29.0', '2.30.0'].map(v);
    const { shown, hasMore } = pendingReleases(all, '2.25.0', '2.30.0');

    expect(shown.map((r) => r.version)).toEqual(['2.30.0', '2.29.0', '2.28.0']);
    expect(hasMore).toBe(true);
  });

  it('sin novedades desde la última vista no hay nada', () => {
    expect(pendingReleases(['2.29.0'].map(v), '2.29.0', '2.29.0').shown).toEqual([]);
  });
});
