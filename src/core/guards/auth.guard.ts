import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { ToastService } from '../../shared/services/toast.service';

/**
 * Protege las rutas que necesitan sesión. Guarda la URL original en
 * `returnUrl` para devolver al usuario a donde iba después del login.
 *
 * Espera a `whenReady()` antes de decidir: con Supabase la sesión se restaura
 * de forma asíncrona, así que resolver esto sincrónicamente rebotaba a /login
 * en cada refresh sobre una ruta protegida, aun teniendo sesión válida.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  await auth.whenReady();

  if (auth.isLoggedIn()) {
    return true;
  }

  toast.show('Inicia sesion para continuar.', 'error');
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/**
 * Lo contrario: mantiene a un usuario ya autenticado fuera de /login y
 * /registro, para que no vea un formulario que no necesita.
 *
 * También espera la restauración: sin eso, un usuario con sesión que recarga
 * /login veía el formulario un instante antes de que la app lo sacara.
 */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady();

  return auth.isLoggedIn() ? router.createUrlTree(['/']) : true;
};
