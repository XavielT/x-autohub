import { RouterStateSnapshot, ActivatedRouteSnapshot } from '@angular/router';

import { unsavedGuard } from './unsaved.guard';

describe('unsavedGuard', () => {
  const run = (hasWork: boolean) =>
    unsavedGuard({ hasUnsavedWork: () => hasWork }, {} as ActivatedRouteSnapshot, {} as RouterStateSnapshot, {} as RouterStateSnapshot);

  afterEach(() => vi.unstubAllGlobals());

  it('sin trabajo a medias deja salir sin preguntar', () => {
    const confirmar = vi.fn();
    vi.stubGlobal('confirm', confirmar);
    expect(run(false)).toBe(true);
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('con trabajo a medias pregunta, y sale solo si la persona acepta', () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    expect(run(true)).toBe(false);
    vi.stubGlobal('confirm', vi.fn(() => true));
    expect(run(true)).toBe(true);
  });
});
