import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AdminPublicar } from './admin-publicar';
import { SiteRebuildService } from '../../../../shared/services/site-rebuild.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { SiteBuild, SiteRebuildResult, SiteRebuildStatus } from '../../../../shared/models/site-rebuild.model';

const AL_DIA: SiteRebuildStatus = {
  pendingSince: null,
  lastChangeAt: null,
  lastFiredAt: null,
  fireCount: 0,
  hookConfigured: true,
};

const build = (patch: Partial<SiteBuild> = {}): SiteBuild => ({
  state: 'ready',
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  readyAt: new Date(Date.now() - 4 * 60_000).toISOString(),
  message: 'Bump versión to 2.13.0',
  inspectorUrl: null,
  ...patch,
});

describe('AdminPublicar', () => {
  afterEach(() => vi.useRealTimers());

  function montar(
    opts: { status?: SiteRebuildStatus; result?: SiteRebuildResult; fail?: boolean; builds?: (SiteBuild | null)[] } = {},
  ) {
    const requestNow = vi.fn(() => of<SiteRebuildResult>(opts.result ?? 'requested'));
    const getStatus = vi.fn(() => (opts.fail ? throwError(() => new Error('x')) : of(opts.status ?? AL_DIA)));
    const show = vi.fn();
    // Cada pregunta por el despliegue saca la siguiente de la lista; la ultima se repite.
    const queue = [...(opts.builds ?? [null])];
    const getBuild = vi.fn(() => of(queue.length > 1 ? queue.shift()! : queue[0]));

    TestBed.configureTestingModule({
      providers: [
        { provide: SiteRebuildService, useValue: { getStatus, requestNow, getBuild } },
        { provide: ToastService, useValue: { show } },
      ],
    });

    const fixture = TestBed.createComponent(AdminPublicar);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, requestNow, getStatus, getBuild, show };
  }

  it('sin cambios dice que el sitio está al día', () => {
    const { el } = montar();
    expect(el.textContent).toContain('El sitio está al día.');
  });

  it('con cambios pendientes dice desde hace cuanto', () => {
    const { el } = montar({ status: { ...AL_DIA, pendingSince: new Date(Date.now() - 4 * 60_000).toISOString() } });
    expect(el.textContent).toContain('Hay cambios sin publicar desde hace 4 min');
  });

  it('sin el enlace avisa y no deja publicar', () => {
    const { el } = montar({ status: { ...AL_DIA, hookConfigured: false } });
    expect(el.textContent).toContain('Falta el enlace de publicación');
    expect((el.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Publicar ahora lo pide, avisa y vuelve a leer el estado', () => {
    const { el, requestNow, getStatus, show } = montar();

    (el.querySelector('button') as HTMLButtonElement).click();

    expect(requestNow).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(expect.stringContaining('Publicación pedida'));
    expect(getStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
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

  describe('el estado del despliegue (build-status)', () => {
    it('un despliegue listo dice cuando y con que mensaje', () => {
      const { el } = montar({ builds: [build()] });
      expect(el.textContent).toContain('Último despliegue: listo');
      expect(el.textContent).toContain('Bump versión to 2.13.0');
    });

    it('uno que falló avisa que el sitio sigue con la versión anterior, con el enlace a Vercel', () => {
      const { el } = montar({ builds: [build({ state: 'error', readyAt: null, inspectorUrl: 'https://vercel.com/equipo/x/abc' })] });

      expect(el.textContent).toContain('El último despliegue falló');
      expect(el.querySelector('[role=alert] a')?.getAttribute('href')).toBe('https://vercel.com/equipo/x/abc');
    });

    it('sin saber nada del despliegue (null) no dibuja esa línea y sigue diciendo lo de antes', () => {
      const { el } = montar({ status: { ...AL_DIA, lastFiredAt: '2026-10-24T20:00:00Z' }, builds: [null] });

      expect(el.textContent).not.toContain('despliegue');
      expect(el.textContent).toContain('Última publicación pedida');
    });

    it('mientras se construye, lo dice, bloquea el boton y vuelve a preguntar hasta que termina', () => {
      vi.useFakeTimers();
      const { el, getBuild, fixture } = montar({
        builds: [build({ state: 'building', readyAt: null }), build({ state: 'building', readyAt: null }), build()],
      });

      expect(el.textContent).toContain('Construyendo la versión nueva');
      expect((el.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
      expect(getBuild).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(10_000);
      expect(getBuild).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(10_000);
      fixture.detectChanges();
      expect(getBuild).toHaveBeenCalledTimes(3);
      expect(el.textContent).toContain('Último despliegue: listo');
      expect((el.querySelector('button') as HTMLButtonElement).disabled).toBe(false);

      // Ya termino: no se sigue preguntando.
      vi.advanceTimersByTime(60_000);
      expect(getBuild).toHaveBeenCalledTimes(3);
    });

    it('después de Publicar ahora espera el despliegue nuevo, aunque primero llegue el viejo', () => {
      vi.useFakeTimers();
      const viejo = build();
      const nuevo = build({ state: 'ready', createdAt: new Date(Date.now() + 5_000).toISOString() });
      const { el, getBuild, fixture } = montar({ builds: [viejo, viejo, nuevo] });

      (el.querySelector('button') as HTMLButtonElement).click();
      // 1 lectura al abrir + 1 al pedir: lo que llega es todavia el despliegue viejo.
      expect(getBuild).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(10_000);
      fixture.detectChanges();
      expect(getBuild).toHaveBeenCalledTimes(3);

      vi.advanceTimersByTime(60_000);
      expect(getBuild).toHaveBeenCalledTimes(3);
    });

    it('si el despliegue nuevo no aparece nunca, se rinde a los 6 minutos', () => {
      vi.useFakeTimers();
      const { el, getBuild } = montar({ builds: [build()] });

      (el.querySelector('button') as HTMLButtonElement).click();
      vi.advanceTimersByTime(7 * 60_000);
      const lecturas = getBuild.mock.calls.length;

      vi.advanceTimersByTime(5 * 60_000);
      expect(getBuild.mock.calls.length).toBe(lecturas);
      expect(lecturas).toBeLessThanOrEqual(2 + 36);
    });

    it('al cerrar el panel se deja de preguntar', () => {
      vi.useFakeTimers();
      const { fixture, getBuild } = montar({ builds: [build({ state: 'building', readyAt: null })] });

      fixture.destroy();
      vi.advanceTimersByTime(60_000);

      expect(getBuild).toHaveBeenCalledTimes(1);
    });
  });
});
