import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { PwaUpdateService } from './pwa-update.service';

class TestablePwaUpdate extends PwaUpdateService {
  reloads = 0;
  protected override reload(): void {
    this.reloads++;
  }
}

describe('PwaUpdateService', () => {
  function montar(overrides: Partial<Record<'isEnabled' | 'checkForUpdate' | 'activateUpdate', unknown>> = {}) {
    const versionUpdates = new Subject<{ type: string }>();
    const sw = {
      isEnabled: true,
      versionUpdates,
      checkForUpdate: vi.fn().mockResolvedValue(true),
      activateUpdate: vi.fn().mockResolvedValue(true),
      ...overrides,
    };
    TestBed.configureTestingModule({
      providers: [{ provide: SwUpdate, useValue: sw }, { provide: PwaUpdateService, useClass: TestablePwaUpdate }],
    });
    return { sw, versionUpdates, service: TestBed.inject(PwaUpdateService) as TestablePwaUpdate };
  }

  const visibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  afterEach(() => visibility('visible'));

  it('sin service worker (desarrollo, pruebas) no hace nada', async () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(PwaUpdateService);

    expect(service.updateReady()).toBe(false);
    expect(await service.check()).toBe(false);
  });

  it('con el service worker apagado tampoco', async () => {
    const { service, sw } = montar({ isEnabled: false });

    expect(await service.check()).toBe(false);
    expect(sw.checkForUpdate).not.toHaveBeenCalled();
  });

  it('VERSION_READY activa el aviso; otros eventos no', () => {
    const { service, versionUpdates } = montar();

    versionUpdates.next({ type: 'VERSION_DETECTED' });
    expect(service.updateReady()).toBe(false);

    versionUpdates.next({ type: 'VERSION_READY' });
    expect(service.updateReady()).toBe(true);
  });

  it('"Más tarde" apaga el aviso', () => {
    const { service, versionUpdates } = montar();
    versionUpdates.next({ type: 'VERSION_READY' });

    service.dismiss();

    expect(service.updateReady()).toBe(false);
  });

  it('Actualizar activa la versión nueva y recarga', async () => {
    const { service, sw } = montar();

    await service.apply();

    expect(sw.activateUpdate).toHaveBeenCalledTimes(1);
    expect(service.reloads).toBe(1);
  });

  it('recarga aunque la activación falle: peor es dejar al usuario con un botón muerto', async () => {
    const { service } = montar({ activateUpdate: vi.fn().mockRejectedValue(new Error('x')) });

    await service.apply();

    expect(service.reloads).toBe(1);
  });

  it('al volver a la pestaña busca una versión nueva; al irse no', () => {
    const { sw } = montar();

    visibility('hidden');
    expect(sw.checkForUpdate).not.toHaveBeenCalled();

    visibility('visible');
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('un fallo de red al buscar no es un error', async () => {
    const { service } = montar({ checkForUpdate: vi.fn().mockRejectedValue(new Error('offline')) });

    expect(await service.check()).toBe(false);
  });
});
