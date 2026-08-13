import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    // La sesion vive en localStorage: limpiarla antes de crear el servicio,
    // porque el estado inicial se lee en el constructor.
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuthService);
  });

  it('starts with no session', () => {
    expect(service.isLoggedIn()).toBe(false);
    expect(service.user()).toBeNull();
  });

  it('logs in with valid credentials and exposes the user', async () => {
    const user = await new Promise<{ displayName: string }>((resolve, reject) =>
      service.login({ email: 'xaviel@correo.com', password: 'secreta1' }).subscribe({
        next: resolve,
        error: reject,
      }),
    );

    expect(user.displayName).toBe('Xaviel');
    expect(service.isLoggedIn()).toBe(true);
  });

  it('rejects a malformed email', async () => {
    const error = await new Promise<Error>((resolve) =>
      service.login({ email: 'no-es-correo', password: 'secreta1' }).subscribe({
        error: resolve,
      }),
    );

    expect(error.message).toContain('correo');
    expect(service.isLoggedIn()).toBe(false);
  });

  it('clears the session on logout', async () => {
    await new Promise((resolve, reject) =>
      service.login({ email: 'xaviel@correo.com', password: 'secreta1' }).subscribe({
        next: resolve,
        error: reject,
      }),
    );
    expect(service.isLoggedIn()).toBe(true);

    service.logout();

    expect(service.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('x-autohub.session')).toBeNull();
  });
});
