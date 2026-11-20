import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ReleaseService } from './release.service';

describe('ReleaseService (modo simulado)', () => {
  let service: ReleaseService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ReleaseService);
  });

  it('la lista pública no trae el resumen técnico ni los puntos del changelog', async () => {
    await firstValueFrom(
      service.create({
        version: '9.9.9',
        releasedAt: '2026-11-20',
        title: 'Con resumen',
        summary: 'Migración 0099 aplicada',
        userSummary: 'Ahora todo carga más rápido.',
        changes: ['Función admin_x() con service_role'],
        isPublished: true,
      }),
    );

    const publicas = await firstValueFrom(service.getAll(false));
    const nueva = publicas.find((r) => r.version === '9.9.9')!;

    expect(nueva.userSummary).toBe('Ahora todo carga más rápido.');
    expect(nueva.summary).toBe('');
    expect(nueva.changes).toEqual([]);
  });

  it('una versión sin resumen para el usuario no sale en lo público', async () => {
    await firstValueFrom(
      service.create({
        version: '9.9.8',
        releasedAt: '2026-11-20',
        title: 'Solo técnica',
        summary: 'Detalle interno',
        changes: ['algo interno'],
        isPublished: true,
      }),
    );

    const publicas = await firstValueFrom(service.getAll(false));

    expect(publicas.some((r) => r.version === '9.9.8')).toBe(false);
  });

  it('el panel de admin sigue viendo todo, incluido el detalle técnico', async () => {
    const todas = await firstValueFrom(service.getAll(true));
    const conDetalle = todas.find((r) => r.changes.length > 0);

    expect(conDetalle?.summary).not.toBe('');
  });
});
