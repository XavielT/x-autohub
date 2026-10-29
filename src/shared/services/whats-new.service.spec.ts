import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { AuthService } from './auth.service';
import { ReleaseService } from './release.service';
import { CURRENT_VERSION, LAST_SEEN_KEY, WhatsNewService } from './whats-new.service';
import { ReleaseModel } from '../models/release.model';

const rel = (version: string, userSummary?: string): ReleaseModel => ({
  id: Number(version.replace(/\./g, '')),
  version,
  releasedAt: new Date('2026-10-01T12:00:00Z'),
  title: `Versión ${version}`,
  summary: 'Resumen técnico',
  userSummary,
  changes: ['Algo cambió'],
  isPublished: true,
});

describe('WhatsNewService', () => {
  const user = signal<{ id: string } | null>(null);

  function servicio(current: string, releases: ReleaseModel[]) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: CURRENT_VERSION, useValue: current },
        { provide: AuthService, useValue: { user, whenReady: () => Promise.resolve() } },
        { provide: ReleaseService, useValue: { getAll: () => of(releases) } },
      ],
    });
    return TestBed.inject(WhatsNewService);
  }

  beforeEach(() => {
    localStorage.clear();
    user.set(null);
  });

  it('primera visita: no muestra nada y guarda la versión actual', async () => {
    const s = servicio('2.30.0', [rel('2.30.0'), rel('2.29.0')]);
    await s.check(null);

    expect(s.pending()).toBeNull();
    expect(localStorage.getItem(LAST_SEEN_KEY)).toBe('2.30.0');
  });

  it('con una versión nueva muestra las pendientes, las más recientes primero', async () => {
    localStorage.setItem(LAST_SEEN_KEY, '2.28.0');
    const s = servicio('2.30.0', [rel('2.28.0'), rel('2.29.0'), rel('2.30.0', 'Lo nuevo')]);
    await s.check(null);

    expect(s.pending()?.releases.map((r) => r.version)).toEqual(['2.30.0', '2.29.0']);
    expect(s.pending()?.hasMore).toBe(false);
  });

  it('tope de 3 versiones y avisa si hay más', async () => {
    localStorage.setItem(LAST_SEEN_KEY, '2.25.0');
    const s = servicio('2.30.0', ['2.26.0', '2.27.0', '2.28.0', '2.29.0', '2.30.0'].map((v) => rel(v)));
    await s.check(null);

    expect(s.pending()?.releases).toHaveLength(3);
    expect(s.pending()?.hasMore).toBe(true);
  });

  it('"Entendido" guarda la versión y no vuelve a salir al recargar', async () => {
    localStorage.setItem(LAST_SEEN_KEY, '2.28.0');
    const releases = [rel('2.29.0')];
    const s = servicio('2.29.0', releases);
    await s.check(null);
    expect(s.pending()).not.toBeNull();

    await s.dismiss();
    expect(s.pending()).toBeNull();
    expect(localStorage.getItem(LAST_SEEN_KEY)).toBe('2.29.0');

    const recargado = servicio('2.29.0', releases);
    await recargado.check(null);
    expect(recargado.pending()).toBeNull();
  });

  it('si ninguna versión publicada cae entre la vista y la actual, se guarda en silencio', async () => {
    localStorage.setItem(LAST_SEEN_KEY, '2.28.0');
    const s = servicio('2.29.0', [rel('2.27.0')]);
    await s.check(null);

    expect(s.pending()).toBeNull();
    expect(localStorage.getItem(LAST_SEEN_KEY)).toBe('2.29.0');
  });

  it('una versión publicada pero aún no desplegada no se anuncia', async () => {
    localStorage.setItem(LAST_SEEN_KEY, '2.28.0');
    const s = servicio('2.29.0', [rel('2.29.0'), rel('2.30.0')]);
    await s.check(null);

    expect(s.pending()?.releases.map((r) => r.version)).toEqual(['2.29.0']);
  });

  it('con cuenta: vale la mayor entre el navegador y la cuenta, y se guarda en la cuenta', async () => {
    user.set({ id: 'u-1' });
    const s = servicio('2.30.0', [rel('2.29.0'), rel('2.30.0')]);
    // La cuenta ya vio la 2.29 en otro dispositivo.
    await s.dismiss(); // guarda 2.30.0 como actual en la cuenta simulada
    localStorage.setItem(LAST_SEEN_KEY, '2.28.0');
    await s.check('u-1');

    expect(s.pending()).toBeNull(); // la cuenta ya tenía la 2.30.0
  });
});
