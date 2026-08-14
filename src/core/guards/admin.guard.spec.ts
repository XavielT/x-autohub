import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';

import { adminGuard } from './admin.guard';
import { AuthService } from '../../shared/services/auth.service';

/**
 * Tres caminos distintos, y la diferencia entre los dos últimos importa: a quien
 * ya tiene sesión pero no es admin no se le puede ofrecer el formulario de login,
 * porque volver a identificarse no le va a dar el permiso que le falta.
 *
 * Igual que `authGuard`, espera la restauración asíncrona de la sesión: sin eso
 * un admin que refresca /admin saldría rebotado.
 */
describe('adminGuard', () => {
  function provideAuth(kind: 'admin' | 'usuario' | 'anonimo', delayMs = 5) {
    let admin = false;
    let logged = false;

    const ready = new Promise<void>((resolve) => {
      setTimeout(() => {
        admin = kind === 'admin';
        logged = kind !== 'anonimo';
        resolve();
      }, delayMs);
    });

    const stub: Pick<AuthService, 'whenReady'> & {
      isAdmin: () => boolean;
      isLoggedIn: () => boolean;
    } = {
      whenReady: () => ready,
      isAdmin: () => admin,
      isLoggedIn: () => logged,
    };

    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: stub }],
    });
  }

  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/admin/pedidos' } as RouterStateSnapshot;
  const run = () => TestBed.runInInjectionContext(() => adminGuard(route, state));

  it('deja pasar a un admin, aunque la sesion se restaure despues', async () => {
    provideAuth('admin');

    await expect(run()).resolves.toBe(true);
  });

  it('manda a la raiz a un usuario con sesion que no es admin', async () => {
    provideAuth('usuario');

    const result = await run();

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/');
  });

  it('manda al login, con returnUrl, a quien no tiene sesion', async () => {
    provideAuth('anonimo');

    const result = await run();

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/login?returnUrl=%2Fadmin%2Fpedidos');
  });
});
