import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { ToastService } from '../../shared/services/toast.service';

/**
 * Protege las rutas que necesitan sesión. Guarda la URL original en
 * `returnUrl` para devolver al usuario a donde iba después del login.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (auth.isLoggedIn()) {
    return true;
  }

  toast.show('Inicia sesion para continuar.', 'error');
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/**
 * Lo contrario: mantiene a un usuario ya autenticado fuera de /login y
 * /registro, para que no vea un formulario que no necesita.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isLoggedIn() ? router.createUrlTree(['/']) : true;
};
