import { MIN_CROP, dragRect, fitRect, outputSize } from './image-edit';

describe('editor de fotos: recorte', () => {
  it('sin proporción el recorte es toda la imagen', () => {
    expect(fitRect(400, 300, null)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });

  it('con proporción 1:1 es el cuadrado más grande, centrado', () => {
    expect(fitRect(400, 300, 1)).toEqual({ x: 50, y: 0, w: 300, h: 300 });
  });

  it('con 16:9 sobre una foto alta ajusta al ancho', () => {
    const r = fitRect(300, 600, 16 / 9);
    expect(r.w).toBe(300);
    expect(r.h).toBeCloseTo(168.75);
    expect(r.y).toBeCloseTo((600 - 168.75) / 2);
  });

  it('mover no se sale de la imagen', () => {
    const r = dragRect({ x: 10, y: 10, w: 100, h: 100 }, 'move', 1000, -1000, 400, 300, null);
    expect(r).toEqual({ x: 300, y: 0, w: 100, h: 100 });
  });

  it('estirar un lado no pasa de la imagen ni deja el recorte más chico que el mínimo', () => {
    const start = { x: 100, y: 100, w: 100, h: 100 };
    expect(dragRect(start, 'e', 5000, 0, 400, 300, null).w).toBe(300);
    expect(dragRect(start, 'w', 5000, 0, 400, 300, null).w).toBe(MIN_CROP);
    expect(dragRect(start, 'n', 0, -5000, 400, 300, null)).toMatchObject({ y: 0, h: 200 });
  });

  it('una esquina con proporción la conserva', () => {
    const r = dragRect({ x: 50, y: 50, w: 100, h: 100 }, 'se', 60, 10, 400, 300, 1);
    expect(r.w).toBeCloseTo(r.h);
    expect(r.x).toBe(50);
    expect(r.y).toBe(50);
  });

  it('una esquina con proporción tampoco se sale de la imagen', () => {
    const r = dragRect({ x: 50, y: 50, w: 100, h: 100 }, 'se', 5000, 5000, 400, 300, 1);
    expect(r.x + r.w).toBeLessThanOrEqual(400);
    expect(r.y + r.h).toBeLessThanOrEqual(300);
    expect(r.w).toBeCloseTo(r.h);
  });

  it('la esquina de arriba a la izquierda ancla la esquina opuesta', () => {
    const r = dragRect({ x: 100, y: 100, w: 100, h: 100 }, 'nw', -40, -40, 400, 300, 1);
    expect(r.x + r.w).toBe(200);
    expect(r.y + r.h).toBe(200);
    expect(r.w).toBe(140);
  });

  it('el tamaño de salida achica a 1600 de lado largo y nunca agranda', () => {
    expect(outputSize(3200, 1600)).toEqual({ width: 1600, height: 800 });
    expect(outputSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
