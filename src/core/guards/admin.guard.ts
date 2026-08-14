import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { ToastService } from '../../shared/services/toast.service';

/**
 * Protege `/admin`. Solo pasa quien tenga `is_admin` en su perfil.
 *
 * Espera a `whenReady()` por lo mismo que `authGuard`: con Supabase la sesión se
 * restaura de forma asíncrona y decidir antes rebotaría al admin en cada
 * refresh. Ver `auth.guard.ts`.
 *
 * Esto es **comodidad de interfaz, no la seguridad**. Lo que de verdad protege
 * los datos son las políticas RLS y las funciones `admin_list_users()` y
 * `set_user_admin()`, que vuelven a comprobar `is_admin` dentro de Postgres.
 * Un usuario que fuerce la ruta a mano solo verá pantallas vacías y errores.
 *
 * Manda a la raíz en vez de a /login cuando ya hay sesión: el problema no es
 * que falte identificarse, es que esa cuenta no tiene permiso, y ofrecerle el
 * formulario de nuevo solo confunde.
 */
export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  await auth.whenReady();

  if (auth.isAdmin()) {
    return true;
  }

  if (auth.isLoggedIn()) {
    toast.show('Esa seccion es solo para administradores.', 'error');
    return router.createUrlTree(['/']);
  }

  toast.show('Inicia sesion para continuar.', 'error');
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
