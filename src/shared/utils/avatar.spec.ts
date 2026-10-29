import { SITE_AVATARS, cropRect, siteAvatarUrl } from './avatar';

describe('cropRect', () => {
  it('con zoom 1 toma el cuadrado más grande y centrado', () => {
    expect(cropRect(1000, 600, 1, 500, 300)).toEqual({ sx: 200, sy: 0, size: 600 });
  });

  it('con zoom achica el cuadrado y respeta el centro pedido', () => {
    expect(cropRect(1000, 600, 2, 500, 300)).toEqual({ sx: 350, sy: 150, size: 300 });
  });

  it('nunca se sale de la foto', () => {
    expect(cropRect(1000, 600, 2, 0, 0)).toEqual({ sx: 0, sy: 0, size: 300 });
    expect(cropRect(1000, 600, 2, 5000, 5000)).toEqual({ sx: 700, sy: 300, size: 300 });
  });

  it('un zoom menor que 1 se trata como 1', () => {
    expect(cropRect(800, 800, 0.5, 400, 400).size).toBe(800);
  });
});

describe('avatares del sitio', () => {
  it('son ocho y cada uno apunta a un archivo propio', () => {
    expect(SITE_AVATARS).toHaveLength(8);
    expect(new Set(SITE_AVATARS.map((a) => siteAvatarUrl(a.id))).size).toBe(8);
    expect(siteAvatarUrl('rueda')).toBe('assets/avatars/rueda.svg');
  });
});
