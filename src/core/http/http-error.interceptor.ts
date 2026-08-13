import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../../shared/services/auth.service';
import { ToastService } from '../../shared/services/toast.service';

/** Mensajes en español para los códigos que el usuario puede provocar. */
const MESSAGES: Record<number, string> = {
  0: 'Sin conexion con el servidor. Revisa tu internet.',
  400: 'Los datos enviados no son validos.',
  401: 'Tu sesion expiro. Vuelve a iniciar sesion.',
  403: 'No tienes permiso para hacer esto.',
  404: 'No encontramos lo que buscabas.',
  409: 'Ese registro ya existe.',
  422: 'Revisa los campos del formulario.',
  429: 'Demasiados intentos. Espera un momento.',
};

/**
 * Rutas de autenticación. Un 401 aquí significa "credenciales incorrectas", no
 * "sesión vencida": redirigir al login desde el propio login sería un bucle.
 */
const AUTH_ENDPOINT = /\/(auth|login|logout|token)(\/|$|\?)/i;

/**
 * Traduce errores HTTP a un toast en español y vuelve a lanzar el error para que
 * el componente pueda reaccionar (por ejemplo apagar un spinner).
 *
 * El error se sigue propagando a propósito: este interceptor informa al usuario,
 * no decide el flujo. La única excepción es el 401, donde además cierra la
 * sesión y manda al login.
 *
 * ⚠️ Hoy no lo atraviesa ninguna petición: Supabase usa `fetch` por dentro, así
 * que sus llamadas no pasan por HttpClient. Esto queda listo para la primera
 * API ajena a Supabase (una pasarela de pago, por ejemplo).
 */
export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      const status = (error as { status?: number })?.status ?? 0;
      const message = MESSAGES[status] ?? 'Algo salio mal. Intenta de nuevo.';
      toast.show(message, 'error');

      // El token ya no sirve: limpiar la sesión y mandar al login, guardando
      // a dónde iba el usuario. Si el que falló fue el propio login, solo se
      // informa — el formulario ya muestra el error.
      if (status === 401 && !AUTH_ENDPOINT.test(req.url)) {
        auth.logout();
        void router.navigate(['/login'], {
          queryParams: { returnUrl: router.url },
        });
      }

      return throwError(() => error);
    }),
  );
};
