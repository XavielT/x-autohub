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

  // --- Roles (fase 5) -------------------------------------------------------
  //
  // En modo simulado el rol sale del correo: `admin@` es admin, `mod@` es
  // moderador y el resto usuario. Hacía falta una convención porque antes no
  // existía ninguna — el constructor de usuarios simulados nunca ponía
  // `is_admin`, así que con mocks nadie era admin y el panel no se podía abrir.

  const entrar = (email: string) =>
    new Promise((resolve, reject) =>
      service.login({ email, password: 'secreta1' }).subscribe({
        next: resolve,
        error: reject,
      }),
    );

  it('sin sesion el rol es user: el permiso mas bajo', () => {
    expect(service.role()).toBe('user');
    expect(service.canModerate()).toBe(false);
    expect(service.isAdmin()).toBe(false);
  });

  it('un correo cualquiera entra como usuario normal', async () => {
    await entrar('xaviel@correo.com');

    expect(service.role()).toBe('user');
    expect(service.canModerate()).toBe(false);
    expect(service.isAdmin()).toBe(false);
  });

  it('mod@ entra como moderador y puede moderar, pero no es admin', async () => {
    await entrar('mod@ejemplo.com');

    expect(service.role()).toBe('moderador');
    expect(service.isModerator()).toBe(true);
    expect(service.canModerate()).toBe(true);
    expect(service.isAdmin()).toBe(false);
  });

  it('admin@ entra como admin, y canModerate tambien lo incluye', async () => {
    await entrar('admin@ejemplo.com');

    expect(service.role()).toBe('admin');
    expect(service.isAdmin()).toBe(true);
    // La jerarquia: un admin puede todo lo que puede un moderador.
    expect(service.canModerate()).toBe(true);
    // ...pero `isModerator` es el rol exacto, no el permiso.
    expect(service.isModerator()).toBe(false);
  });

  it('no confunde un handle que solo empieza igual', async () => {
    // `administracion@` y `modelos@` no son admin ni moderador: se compara el
    // handle completo, no un prefijo.
    await entrar('administracion@ejemplo.com');
    expect(service.role()).toBe('user');

    service.logout();
    await entrar('modelos@ejemplo.com');
    expect(service.role()).toBe('user');
  });

  /**
   * Un servicio nuevo que lee lo que haya en localStorage, como haría un F5.
   *
   * Va por TestBed y no por `new AuthService()` porque el servicio usa
   * `inject()`, que fuera de un contexto de inyección lanza.
   */
  const recargar = (): AuthService => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(AuthService);
  };

  it('el rol sobrevive a recargar la pagina', async () => {
    await entrar('mod@ejemplo.com');

    const revivido = recargar();

    expect(revivido.role()).toBe('moderador');
    expect(revivido.canModerate()).toBe(true);
  });

  it('una sesion guardada antes de la fase 5 no se queda sin rol', () => {
    // Sin `role`, como la dejaria un bundle anterior.
    localStorage.setItem(
      'x-autohub.session',
      JSON.stringify({ id: 'mock-1', displayName: 'Mod', email: 'mod@ejemplo.com' }),
    );

    expect(recargar().role()).toBe('moderador');
  });
});
