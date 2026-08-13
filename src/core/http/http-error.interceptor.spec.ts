import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { httpErrorInterceptor } from './http-error.interceptor';
import { AuthService } from '../../shared/services/auth.service';
import { ToastService } from '../../shared/services/toast.service';

/**
 * Estas pruebas cubren el 401: es la única rama del interceptor que decide
 * flujo (cerrar sesión y redirigir) en vez de solo informar.
 */
describe('httpErrorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: AuthService;
  let router: Router;

  /** Deja una sesión simulada activa, como si el usuario ya hubiera entrado. */
  const login = async () => {
    await new Promise((resolve, reject) =>
      auth.login({ email: 'xaviel@correo.com', password: 'secreta1' }).subscribe({
        next: resolve,
        error: reject,
      }),
    );
  };

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([httpErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => httpMock.verify());

  it('clears the session and redirects to /login on a 401', async () => {
    await login();
    expect(auth.isLoggedIn()).toBe(true);

    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    http.get('/api/publicaciones').subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/publicaciones')
      .flush('nope', { status: 401, statusText: 'Unauthorized' });

    expect(auth.isLoggedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: router.url },
    });
  });

  it('does not redirect when the failing call is the login itself', async () => {
    await login();

    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    http.post('/api/auth/login', {}).subscribe({ error: () => undefined });
    httpMock
      .expectOne('/api/auth/login')
      .flush('bad credentials', { status: 401, statusText: 'Unauthorized' });

    // Sin esta excepción, un login fallido redirigiría al propio login.
    expect(navigate).not.toHaveBeenCalled();
    expect(auth.isLoggedIn()).toBe(true);
  });

  it('shows a toast but keeps the session on a non-401 error', async () => {
    await login();

    const toast = TestBed.inject(ToastService);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    http.get('/api/catalogo').subscribe({ error: () => undefined });
    httpMock.expectOne('/api/catalogo').flush('boom', { status: 500, statusText: 'Server Error' });

    expect(toast.toasts().at(-1)?.message).toBe('Algo salio mal. Intenta de nuevo.');
    expect(navigate).not.toHaveBeenCalled();
    expect(auth.isLoggedIn()).toBe(true);
  });
});
