import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { SiteRebuildService, toResult, toStatus } from './site-rebuild.service';

describe('SiteRebuildService (migración 0027)', () => {
  let service: SiteRebuildService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SiteRebuildService);
  });

  it('en modo simulado el sitio nace al día y con el enlace cargado', async () => {
    expect(await firstValueFrom(service.getStatus())).toEqual({
      pendingSince: null,
      lastChangeAt: null,
      lastFiredAt: null,
      fireCount: 0,
      hookConfigured: true,
    });
  });

  it('publicar ahora lo anota en el estado', async () => {
    expect(await firstValueFrom(service.requestNow())).toBe('requested');

    const status = await firstValueFrom(service.getStatus());
    expect(status.fireCount).toBe(1);
    expect(status.lastFiredAt).not.toBeNull();
  });

  it('un segundo clic enseguida no pide otro despliegue', async () => {
    await firstValueFrom(service.requestNow());

    expect(await firstValueFrom(service.requestNow())).toBe('too_soon');
    expect((await firstValueFrom(service.getStatus())).fireCount).toBe(1);
  });

  it('toStatus traduce la fila de la base', () => {
    expect(
      toStatus({
        dirty_since: '2026-10-24T10:00:00Z',
        last_change_at: '2026-10-24T10:05:00Z',
        last_fired_at: null,
        fired_count: 3,
        hook_configured: false,
      }),
    ).toEqual({
      pendingSince: '2026-10-24T10:00:00Z',
      lastChangeAt: '2026-10-24T10:05:00Z',
      lastFiredAt: null,
      fireCount: 3,
      hookConfigured: false,
    });
  });

  it('un código desconocido no se toma por un éxito', () => {
    expect(toResult('requested')).toBe('requested');
    expect(toResult('too_soon')).toBe('too_soon');
    expect(toResult('no_hook')).toBe('no_hook');
    expect(toResult('lo-que-sea')).toBe('no_hook');
  });
});
