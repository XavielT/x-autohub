import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { ToastService } from '../../shared/services/toast.service';

/**
 * Protege la entrada al panel. Pasa quien pueda moderar: **moderador o admin**.
 *
 * Es el guard del contenedor `/admin`, no de sus secciones. La estructura es
 * deliberada y vale la pena explicarla, porque de un vistazo parece al revés:
 *
 *   /admin              → moderatorGuard  (el moderador entra al panel)
 *     /admin/moderacion → moderatorGuard  (y esto es lo único que puede abrir)
 *     /admin/usuarios   → adminGuard      (el resto sigue siendo solo del admin)
 *     /admin/pedidos    → adminGuard
 *     /admin/inventario → adminGuard
 *     /admin/versiones  → adminGuard
 *
 * Es decir: el guard de arriba se **afloja** para dejar entrar al moderador, y
 * cada sección de admin se protege por su cuenta. La alternativa —dejar
 * `adminGuard` arriba y colgar la moderación fuera de `/admin`— habría dejado al
 * moderador sin el marco del panel, o habría obligado a duplicarlo.
 *
 * Un guard de ruta hija se evalúa después del padre, así que un moderador que
 * escriba `/admin/usuarios` a mano pasa el padre y lo frena el hijo. Lo cubre
 * una prueba, porque es exactamente el caso que se rompe si alguien agrega una
 * sección nueva y olvida el `canActivate`.
 *
 * Como `adminGuard`, esto es **comodidad de interfaz, no la seguridad**: quien
 * fuerce la ruta solo verá pantallas vacías y errores, porque RLS y las
 * funciones `security definer` vuelven a comprobar el rol dentro de Postgres.
 * `admin_list_users()` sigue exigiendo admin, y `moderate_publication()` exige
 * moderador o admin.
 */
export const moderatorGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  await auth.whenReady();

  if (auth.canModerate()) {
    return true;
  }

  // Con sesión el problema no es identificarse, es que a esa cuenta le falta el
  // permiso: ofrecerle el login otra vez solo confunde. Mismo criterio que
  // `adminGuard`.
  if (auth.isLoggedIn()) {
    toast.show('Esa seccion es solo para el equipo de X AutoHub.', 'error');
    return router.createUrlTree(['/']);
  }

  toast.show('Inicia sesion para continuar.', 'error');
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
