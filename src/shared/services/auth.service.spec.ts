import { TestBed } from '@angular/core/testing';

import { AuthService, RegisterOutcome } from './auth.service';
import { SupabaseService } from '../../core/supabase/supabase.service';

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

  // --- Registro contra Supabase (imp 27082026, fase 1) ----------------------
  //
  // `signUp` tiene dos finales legitimos y solo uno trae sesion. Antes se
  // asumia que siempre la traia y se leia el perfil de inmediato; sin sesion
  // esa lectura sale como `anon` y la persona veia un error tecnico en el
  // formulario, con la cuenta ya creada. Ver la BITACORA del 27/08/2026.

  const PROFILE_ROW = {
    id: 'uuid-1',
    display_name: 'Tecnologia CSD',
    email: 'tecnologia@constructorasd.com',
    phone: '8097799782',
    location: 'Santo Domingo',
    avatar_url: null,
    role: 'user',
    is_verified: false,
    is_admin: false,
    is_test_user: false,
    created_at: '2026-08-27T20:29:00Z',
  };

  /**
   * Doble del cliente de Supabase con lo justo que toca `register()`.
   *
   * `signUpSession` es la palanca del caso: `null` finge un proyecto que pide
   * confirmar el correo, y un objeto finge uno que no.
   */
  function supabaseDouble(options: {
    signUpSession: Record<string, unknown> | null;
    rpc?: () => Promise<{ data: unknown; error: unknown }>;
  }) {
    const calls = { rpc: 0 };
    const db = {
      auth: {
        signUp: () =>
          Promise.resolve({
            data: { user: { id: PROFILE_ROW.id }, session: options.signUpSession },
            error: null,
          }),
        getSession: () => Promise.resolve({ data: { session: options.signUpSession } }),
        getUser: () => Promise.resolve({ data: { user: { email: PROFILE_ROW.email } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      },
      rpc: () => {
        calls.rpc += 1;
        return options.rpc
          ? options.rpc()
          : Promise.resolve({ data: [PROFILE_ROW], error: null });
      },
    };

    return {
      calls,
      provider: {
        provide: SupabaseService,
        useValue: {
          isConfigured: true,
          db,
          shouldUseMockData: () => false,
        },
      },
    };
  }

  const registrar = (svc: AuthService) =>
    new Promise<RegisterOutcome>((resolve, reject) =>
      svc
        .register({
          displayName: 'Tecnologia CSD',
          email: PROFILE_ROW.email,
          password: 'secreta1',
        })
        .subscribe({ next: resolve, error: reject }),
    );

  const conSupabase = (double: ReturnType<typeof supabaseDouble>): AuthService => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [double.provider] });
    return TestBed.inject(AuthService);
  };

  it('sin sesion en el signUp devuelve confirm-email y no toca el perfil', async () => {
    const double = supabaseDouble({ signUpSession: null });
    const outcome = await registrar(conSupabase(double));

    expect(outcome.status).toBe('confirm-email');
    expect(outcome).toEqual({ status: 'confirm-email', email: PROFILE_ROW.email });
    // Lo que provocaba el fallo: pedir el perfil sin sesion, o sea como `anon`.
    expect(double.calls.rpc).toBe(0);
  });

  it('con sesion en el signUp devuelve active con el usuario cargado', async () => {
    const double = supabaseDouble({ signUpSession: { access_token: 'jwt' } });
    const outcome = await registrar(conSupabase(double));

    expect(outcome.status).toBe('active');
    if (outcome.status !== 'active') throw new Error('se esperaba active');
    expect(outcome.user.displayName).toBe('Tecnologia CSD');
    expect(outcome.user.email).toBe(PROFILE_ROW.email);
  });

  it('reintenta el perfil cuando la primera llamada sale sin token (401)', async () => {
    // La carrera real: la primera llamada se va con la clave anon —que desde la
    // migracion 0015 no puede ejecutar get_my_profile— y responde 401. Con la
    // sesion ya asentada, el reintento trae la fila.
    let attempt = 0;
    const double = supabaseDouble({
      signUpSession: { access_token: 'jwt' },
      rpc: () => {
        attempt += 1;
        return attempt === 1
          ? Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied' } })
          : Promise.resolve({ data: [PROFILE_ROW], error: null });
      },
    });

    const outcome = await registrar(conSupabase(double));

    expect(double.calls.rpc).toBe(2);
    expect(outcome.status).toBe('active');
  });

  it('un fallo del perfil no filtra el detalle tecnico al usuario', async () => {
    const double = supabaseDouble({
      signUpSession: { access_token: 'jwt' },
      rpc: () => Promise.resolve({ data: null, error: { code: '42501', message: 'denied' } }),
    });

    const error = await registrar(conSupabase(double)).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toBe('No pudimos cargar tu perfil. Intenta de nuevo en un momento.');
    // Nada de nombres de triggers ni de archivos .sql en lo que se lee en pantalla.
    expect(message).not.toContain('on_auth_user_created');
    expect(message).not.toContain('.sql');
  });

  it('en modo simulado el registro sigue entrando directo', async () => {
    const outcome = await registrar(service);

    expect(outcome.status).toBe('active');
    if (outcome.status !== 'active') throw new Error('se esperaba active');
    expect(outcome.user.displayName).toBe('Tecnologia CSD');
    expect(service.isLoggedIn()).toBe(true);
  });
});
