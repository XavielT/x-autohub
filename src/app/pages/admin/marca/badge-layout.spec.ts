import { LOGO_RATIO, MAX_EDGE, badgeRect, fitEdge, outputName } from './badge-layout';

describe('badge-layout', () => {
  it('la insignia mide el porcentaje pedido del ancho y conserva la proporción del logo', () => {
    const r = badgeRect(1000, 600, 20, 0, 1, 1);
    expect(r.w).toBe(200);
    expect(r.h).toBe(Math.round(200 / LOGO_RATIO));
  });

  it('fx y fy mueven la insignia entre los márgenes', () => {
    const tl = badgeRect(1000, 600, 20, 5, 0, 0);
    const br = badgeRect(1000, 600, 20, 5, 1, 1);
    const mc = badgeRect(1000, 600, 20, 5, 0.5, 0.5);
    expect(tl).toMatchObject({ x: 50, y: 50 });
    expect(br.x + br.w).toBe(950);
    expect(br.y + br.h).toBe(550);
    expect(mc.x + mc.w / 2).toBe(500);
  });

  it('fx y fy fuera de rango se recortan', () => {
    expect(badgeRect(1000, 600, 20, 5, -3, 9)).toEqual(badgeRect(1000, 600, 20, 5, 0, 1));
  });

  it('no se sale de una imagen más chica que la insignia', () => {
    const r = badgeRect(100, 20, 50, 10, 1, 1);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
  });

  it('fitEdge solo reduce lo que pasa del tope', () => {
    expect(fitEdge(720, 478)).toEqual({ width: 720, height: 478 });
    const big = fitEdge(MAX_EDGE * 2, MAX_EDGE);
    expect(big.width).toBe(MAX_EDGE);
    expect(big.height).toBe(MAX_EDGE / 2);
  });

  it('outputName deja un nombre de archivo limpio', () => {
    expect(outputName('jetta mk4 2.jpg')).toBe('jetta-mk4-2-xautohub');
    expect(outputName('Ñandú Rápido.PNG')).toBe('nandu-rapido-xautohub');
    expect(outputName('***.png')).toBe('imagen-xautohub');
  });
});
