import { fitWithin, imageInputProblem } from './image-compress';

describe('fitWithin', () => {
  it('no agranda una foto que ya cabe', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('reduce al borde largo conservando la proporción', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });
});

describe('imageInputProblem', () => {
  it('acepta JPG, PNG y WebP de hasta 10 MB', () => {
    expect(imageInputProblem({ type: 'image/jpeg', size: 9 * 1024 * 1024 })).toBeNull();
    expect(imageInputProblem({ type: 'image/png', size: 100 })).toBeNull();
    expect(imageInputProblem({ type: 'image/webp', size: 100 })).toBeNull();
  });

  it('rechaza otros tipos y lo que pasa de 10 MB', () => {
    expect(imageInputProblem({ type: 'image/gif', size: 100 })).toMatch(/JPG, PNG o WebP/);
    expect(imageInputProblem({ type: 'image/jpeg', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
  });
});
