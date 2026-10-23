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

/**
 * La tienda y el cambio de nombre (pivote, fase 2).
 *
 * `/catalogo` ya estaba publicado y enlazado; pasa a `/tienda` y **no puede
 * dejar de funcionar**. Estas pruebas fijan que el redirect existe, que es
 * exacto (no se come `/catalogo-algo`) y que las rutas de detalle no se movieron.
 */
describe('rutas de la tienda', () => {
  const route = (path: string) => routes.find((r) => r.path === path);

  it('/catalogo redirige a /tienda con pathMatch full', () => {
    const catalogo = route('catalogo');

    expect(catalogo?.redirectTo).toBe('tienda');
    expect(catalogo?.pathMatch).toBe('full');
    // Un redirect no carga ni titula nada.
    expect(catalogo?.loadComponent).toBeUndefined();
  });

  it('/tienda y /buscar existen, con su titulo', () => {
    expect(route('tienda')?.title).toBe('Tienda — Accesorios y piezas | X AutoHub');
    expect(route('buscar')?.title).toBe('Buscar | X AutoHub');
    expect(route('tienda')?.loadComponent).toBeDefined();
    expect(route('buscar')?.loadComponent).toBeDefined();
  });

  it('/tienda y /buscar cargan la misma pagina (hasta la fase 3)', async () => {
    const tienda = await route('tienda')!.loadComponent!();
    const buscar = await route('buscar')!.loadComponent!();

    expect(tienda).toBe(buscar);
  });

  it('las rutas de detalle y el checkout siguen donde estaban', () => {
    for (const path of ['hub-part-details/:id', 'checkout', 'car-details/:id', 'hub-market-part-details/:id']) {
      expect(route(path), `Falta la ruta '${path}'`).toBeDefined();
    }
  });

  it('/social-hub sigue siendo la ruta de la Comunidad, con el nombre nuevo en el titulo', () => {
    expect(route('social-hub')?.title).toBe('Comunidad — Clubes y eventos | X AutoHub');
  });

  it('el home tiene el titulo del pivote', () => {
    expect(route('')?.title).toBe('X AutoHub — Todo lo que tu carro necesita');
  });

  it('el comodin sigue de ultimo', () => {
    expect(routes[routes.length - 1].path).toBe('**');
  });
});
