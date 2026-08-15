import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';

import { moderatorGuard } from './moderator.guard';
import { adminGuard } from './admin.guard';
import { AuthService } from '../../shared/services/auth.service';
import { UserRole } from '../../shared/models/user.model';

/**
 * La matriz de acceso al panel, que es la parte de la fase 5 más fácil de
 * romper sin darse cuenta.
 *
 * La estructura de rutas afloja el guard del padre (`moderatorGuard` en
 * `/admin`) y protege cada sección de admin por su cuenta (`adminGuard`). Eso
 * significa que **un moderador pasa el guard del padre**, y lo único que lo
 * frena en `/admin/usuarios` es el guard del hijo. Si alguien agrega una sección
 * nueva y olvida su `canActivate`, queda abierta a los moderadores — por eso
 * aquí se comprueban los dos guards juntos y no cada uno por su lado.
 *
 * Como los demás guards, esperan `whenReady()`: con Supabase la sesión se
 * restaura de forma asíncrona y decidir antes rebotaría al usuario en cada
 * refresh. Los dobles simulan esa restauración tardía.
 */
describe('acceso al panel por rol', () => {
  /** Doble de sesión con restauración tardía, como la de Supabase. */
  function provideAuth(kind: UserRole | 'anonimo', delayMs = 5) {
    let role: UserRole = 'user';
    let logged = false;

    const ready = new Promise<void>((resolve) => {
      setTimeout(() => {
        role = kind === 'anonimo' ? 'user' : kind;
        logged = kind !== 'anonimo';
        resolve();
      }, delayMs);
    });

    const stub: Pick<AuthService, 'whenReady'> & {
      isAdmin: () => boolean;
      canModerate: () => boolean;
      isLoggedIn: () => boolean;
    } = {
      whenReady: () => ready,
      isAdmin: () => logged && role === 'admin',
      canModerate: () => logged && role !== 'user',
      isLoggedIn: () => logged,
    };

    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: stub }],
    });
  }

  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/admin/usuarios' } as RouterStateSnapshot;

  const runModerator = () =>
    TestBed.runInInjectionContext(() => moderatorGuard(route, state));
  const runAdmin = () => TestBed.runInInjectionContext(() => adminGuard(route, state));

  describe('moderador', () => {
    it('entra al panel: pasa el guard del padre', async () => {
      provideAuth('moderador');

      await expect(runModerator()).resolves.toBe(true);
    });

    it('NO entra a una seccion de admin: lo frena el guard del hijo', async () => {
      provideAuth('moderador');

      const result = await runAdmin();

      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/');
    });
  });

  describe('admin', () => {
    it('entra al panel', async () => {
      provideAuth('admin');

      await expect(runModerator()).resolves.toBe(true);
    });

    it('entra tambien a las secciones de admin', async () => {
      provideAuth('admin');

      await expect(runAdmin()).resolves.toBe(true);
    });
  });

  describe('usuario normal', () => {
    it('no entra al panel', async () => {
      provideAuth('user');

      const result = await runModerator();

      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/');
    });

    it('tampoco a una seccion de admin', async () => {
      provideAuth('user');

      const result = await runAdmin();

      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/');
    });
  });

  describe('sin sesion', () => {
    it('va al login con returnUrl, no a la raiz', async () => {
      provideAuth('anonimo');

      const result = await runModerator();

      // La diferencia con el caso anterior importa: a quien ya tiene sesion no
      // se le ofrece el login, porque volver a identificarse no le va a dar el
      // permiso que le falta.
      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/login?returnUrl=%2Fadmin%2Fusuarios');
    });
  });

  it('decide despues de que la sesion se restaure, no antes', async () => {
    // Con un retraso mayor: si el guard resolviera sincronicamente, veria
    // `canModerate() === false` y rebotaria a un moderador con sesion valida.
    provideAuth('moderador', 30);

    await expect(runModerator()).resolves.toBe(true);
  });
});
