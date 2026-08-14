import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';

import { authGuard, guestGuard } from './auth.guard';
import { AuthService } from '../../shared/services/auth.service';

/**
 * El caso que importa aquí es la restauración asíncrona de la sesión.
 *
 * Con Supabase, `AuthService` restaura la sesión con una promesa; en la primera
 * navegación `isLoggedIn()` todavía es `false` aunque haya sesión válida. El
 * guard resolvía eso sincrónicamente, así que un F5 sobre /publicar rebotaba a
 * /login mientras el navbar ya mostraba al usuario. Estas pruebas fijan que el
 * guard espera a `whenReady()` antes de decidir.
 */
describe('authGuard', () => {
  /** Doble que simula la restauración tardía: primero null, luego un usuario. */
  function provideAuth(options: { restoresTo: 'user' | 'nobody'; delayMs?: number }) {
    let loggedIn = false;

    const ready = new Promise<void>((resolve) => {
      setTimeout(() => {
        loggedIn = options.restoresTo === 'user';
        resolve();
      }, options.delayMs ?? 5);
    });

    const stub: Pick<AuthService, 'whenReady'> & { isLoggedIn: () => boolean } = {
      whenReady: () => ready,
      isLoggedIn: () => loggedIn,
    };

    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: stub }],
    });
  }

  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/publicar' } as RouterStateSnapshot;

  const run = (guard: typeof authGuard) =>
    TestBed.runInInjectionContext(() => guard(route, state));

  it('deja pasar cuando la sesion se restaura despues de la navegacion', async () => {
    provideAuth({ restoresTo: 'user' });

    await expect(run(authGuard)).resolves.toBe(true);
  });

  it('redirige a /login con returnUrl cuando de verdad no hay sesion', async () => {
    provideAuth({ restoresTo: 'nobody' });

    const result = await run(authGuard);

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/login?returnUrl=%2Fpublicar');
  });

  it('guestGuard saca de /login a quien ya tiene sesion, aun restaurada tarde', async () => {
    provideAuth({ restoresTo: 'user' });

    const result = await run(guestGuard);

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/');
  });

  it('guestGuard deja ver /login a quien no tiene sesion', async () => {
    provideAuth({ restoresTo: 'nobody' });

    await expect(run(guestGuard)).resolves.toBe(true);
  });
});
