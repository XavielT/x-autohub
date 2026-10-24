import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AdminPublicar } from './admin-publicar';
import { SiteRebuildService } from '../../../../shared/services/site-rebuild.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { SiteRebuildResult, SiteRebuildStatus } from '../../../../shared/models/site-rebuild.model';

const AL_DIA: SiteRebuildStatus = {
  pendingSince: null,
  lastChangeAt: null,
  lastFiredAt: null,
  fireCount: 0,
  hookConfigured: true,
};

describe('AdminPublicar', () => {
  function montar(opts: { status?: SiteRebuildStatus; result?: SiteRebuildResult; fail?: boolean } = {}) {
    const requestNow = vi.fn(() => of<SiteRebuildResult>(opts.result ?? 'requested'));
    const getStatus = vi.fn(() => (opts.fail ? throwError(() => new Error('x')) : of(opts.status ?? AL_DIA)));
    const show = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: SiteRebuildService, useValue: { getStatus, requestNow } },
        { provide: ToastService, useValue: { show } },
      ],
    });

    const fixture = TestBed.createComponent(AdminPublicar);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, requestNow, getStatus, show };
  }

  it('sin cambios dice que el sitio esta al dia', () => {
    const { el } = montar();
    expect(el.textContent).toContain('El sitio esta al dia.');
  });

  it('con cambios pendientes dice desde hace cuanto', () => {
    const { el } = montar({ status: { ...AL_DIA, pendingSince: new Date(Date.now() - 4 * 60_000).toISOString() } });
    expect(el.textContent).toContain('Hay cambios sin publicar desde hace 4 min');
  });

  it('sin el enlace avisa y no deja publicar', () => {
    const { el } = montar({ status: { ...AL_DIA, hookConfigured: false } });
    expect(el.textContent).toContain('Falta el enlace de publicacion');
    expect((el.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Publicar ahora lo pide, avisa y vuelve a leer el estado', () => {
    const { el, requestNow, getStatus, show } = montar();

    (el.querySelector('button') as HTMLButtonElement).click();

    expect(requestNow).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(expect.stringContaining('Publicacion pedida'));
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it('si ya se pidio hace un momento, lo dice como error', () => {
    const { el, show } = montar({ result: 'too_soon' });

    (el.querySelector('button') as HTMLButtonElement).click();

    expect(show).toHaveBeenCalledWith(expect.stringContaining('Ya se pidio'), 'error');
  });

  it('si no se puede leer el estado, lo dice y no dibuja el boton', () => {
    const { el } = montar({ fail: true });
    expect(el.textContent).toContain('No pudimos leer el estado');
    expect(el.querySelector('button')).toBeNull();
  });
});
