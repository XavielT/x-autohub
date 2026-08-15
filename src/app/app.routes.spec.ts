import { Route } from '@angular/router';
import { routes } from './app.routes';
import { adminGuard } from '../core/guards/admin.guard';
import { moderatorGuard } from '../core/guards/moderator.guard';

/**
 * La forma de las rutas del panel, no su comportamiento.
 *
 * Existe por un riesgo concreto de la estructura que introdujo la fase 5: el
 * guard del padre `/admin` se aflojó a `moderatorGuard` para que el moderador
 * entre al marco del panel, y lo que mantiene fuera de las secciones de admin es
 * el `canActivate` de **cada hija**. Una sección nueva sin su guard no falla, no
 * avisa y no rompe ninguna prueba de comportamiento: simplemente queda abierta a
 * los moderadores.
 *
 * Esta prueba convierte ese olvido en rojo.
 */
describe('rutas de /admin', () => {
  const admin = routes.find((r) => r.path === 'admin');

  /** Las secciones que un moderador puede abrir. El resto es solo de admin. */
  const PARA_MODERADORES = ['moderacion'];

  it('el padre deja entrar a quien pueda moderar', () => {
    expect(admin).toBeDefined();
    expect(admin!.canActivate).toEqual([moderatorGuard]);
  });

  it('toda seccion hija declara su propio guard', () => {
    const secciones = (admin!.children ?? []).filter((child) => child.path);

    expect(secciones.length).toBeGreaterThan(0);

    for (const seccion of secciones) {
      expect(
        seccion.canActivate,
        `La seccion '${seccion.path}' no declara canActivate: el guard del padre ` +
          `la dejaria abierta a los moderadores.`,
      ).toBeDefined();
    }
  });

  it('las secciones de admin usan adminGuard, y solo moderacion se afloja', () => {
    const secciones = (admin!.children ?? []).filter((child): child is Route => !!child.path);

    for (const seccion of secciones) {
      const esperado = PARA_MODERADORES.includes(seccion.path!) ? moderatorGuard : adminGuard;

      expect(seccion.canActivate, `Guard equivocado en '${seccion.path}'`).toEqual([esperado]);
    }
  });

  it('entrar a /admin lleva a una pantalla que los dos roles pueden abrir', () => {
    const redirect = (admin!.children ?? []).find((child) => child.path === '');

    // Antes caia en 'versiones', que un moderador no puede abrir: al entrar al
    // panel lo habria rebotado a la raiz con un mensaje de error.
    expect(redirect?.redirectTo).toBeDefined();
    expect(PARA_MODERADORES).toContain(redirect!.redirectTo!);
  });
});
