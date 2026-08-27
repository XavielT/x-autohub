import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, from, map, of, switchMap, tap, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toUser } from '../../core/supabase/mappers';
import { LoginCredentials, RegisterPayload, UserModel, UserRole } from '../models/user.model';

const MOCK_SESSION_KEY = 'x-autohub.session';

/**
 * En qué termina un registro.
 *
 * `signUp` puede devolver la cuenta **sin sesión**: es lo que pasa cuando el
 * proyecto tiene activada la confirmación por correo. No es un error — la
 * cuenta se creó — pero todavía no hay con qué leer el perfil, así que la
 * pantalla tiene que contarlo en vez de fallar.
 *
 * Hoy el proyecto en vivo corre con `mailer_autoconfirm` encendido (o sea, sin
 * confirmación) y siempre cae en `active`. Los dos caminos existen porque el
 * ajuste está a un clic de distancia en el panel de Supabase, y el código no
 * puede romperse el día que se cambie.
 */
export type RegisterOutcome =
  { status: 'active'; user: UserModel } | { status: 'confirm-email'; email: string };

/**
 * Resultado de leer el perfil, con la distinción que importa: **no es lo mismo
 * que la fila no exista a que la petición fallara.**
 *
 * Confundirlas fue el bug de producción del 27/08/2026: un 401 pasajero se
 * reportaba como "tu cuenta no tiene perfil". Ver `fetchProfile()`.
 */
type ProfileLoad = { status: 'ok'; user: UserModel } | { status: 'missing' } | { status: 'failed' };

/**
 * Cómo se finge un rol en modo simulado: **por el correo con el que entras.**
 *
 *   admin@lo-que-sea.com  → admin
 *   mod@lo-que-sea.com    → moderador
 *   cualquier otro        → user
 *
 * Hacía falta inventar una convención porque **antes no existía ninguna**: el
 * constructor de usuarios simulados nunca ponía `is_admin`, así que con mocks
 * nadie era admin nunca y el panel no se podía ni abrir sin credenciales de
 * Supabase. Esto es solo para desarrollo — en modo real el rol sale de
 * `get_my_profile()` y lo reparte `set_user_role()` un admin.
 *
 * Se compara el handle completo (lo de antes de la `@`) y no un prefijo, para
 * que `administracion@` o `modelos@` no se conviertan en admin sin querer.
 */
function mockRoleFor(email: string): UserRole {
  const handle = email.split('@')[0]?.trim().toLowerCase();
  if (handle === 'admin') return 'admin';
  if (handle === 'mod' || handle === 'moderador') return 'moderador';
  return 'user';
}

/**
 * Y cómo se finge un **usuario de prueba**: `prueba@` o `test@`.
 *
 * Sigue la convención que estableció la fase 5 —el handle completo, no un
 * prefijo— y hace falta por la misma razón: en modo simulado no hay base donde
 * marcar a nadie, así que sin una convención no habría forma de abrir el sitio
 * como usuario de prueba y comprobar que el contenido marcado se ve.
 *
 * No es un rol: quien entra así sigue siendo `user`. Lo único que gana es ver lo
 * marcado como de prueba, exactamente como en modo real.
 *
 * Marcar a alguien desde `/admin/usuarios` **no** cambia la sesión abierta, ni
 * aquí ni en modo real: cambia su fila, y ese usuario lo nota cuando entra.
 */
function mockIsTestUser(email: string): boolean {
  const handle = email.split('@')[0]?.trim().toLowerCase();
  return handle === 'prueba' || handle === 'test';
}

/**
 * Sesión del usuario.
 *
 * Con Supabase configurado usa Supabase Auth (correo + contraseña) y el perfil
 * sale de la tabla `profiles`, que el trigger `on_auth_user_created` crea sola
 * al registrarse. La sesión la persiste y renueva el propio cliente de Supabase.
 *
 * Sin configurar, cae a una sesión simulada en localStorage para que la app se
 * pueda usar sin backend. Ver SupabaseService.shouldUseMockData().
 *
 * Los componentes solo consumen las señales públicas y no saben cuál de los dos
 * modos está activo.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);

  private readonly _user = signal<UserModel | null>(null);
  /** Evita renderizar "no hay sesión" mientras se restaura la de Supabase. */
  private readonly _isRestoring = signal(!this.supabase.shouldUseMockData());

  readonly user = this._user.asReadonly();
  readonly isRestoring = this._isRestoring.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);

  /**
   * Rol de la sesión. Sin sesión, `user`: es el permiso más bajo, así que
   * tratar "nadie" como "usuario normal" nunca abre nada de más.
   */
  readonly role = computed<UserRole>(() => this._user()?.role ?? 'user');

  /**
   * Acceso al panel de administración.
   *
   * Las tres señales de rol sirven para mostrar u ocultar entradas y para los
   * guards, **no como medida de seguridad**: quien manipule el cliente puede
   * ponerlas en true y no conseguirá nada, porque RLS y las funciones del panel
   * vuelven a comprobar el rol dentro de Postgres.
   */
  readonly isAdmin = computed(() => this.role() === 'admin');

  /** Solo moderador. Rara vez es lo que quieres — casi siempre es `canModerate`. */
  readonly isModerator = computed(() => this.role() === 'moderador');

  /**
   * Quién puede revisar publicaciones: moderador **y** admin.
   *
   * Es el espejo de `is_moderator_or_admin()` en Postgres. La jerarquía se
   * escribe una vez de cada lado y no se repite en cada componente.
   */
  readonly canModerate = computed(() => this.role() !== 'user');

  /**
   * Se resuelve cuando ya se intentó restaurar la sesión.
   *
   * Los guards **tienen** que esperarla: con Supabase la restauración es
   * asíncrona, así que en la primera carga de la página `isLoggedIn()` todavía
   * es `false` aunque haya sesión guardada. Sin esperar, un refresh (F5) sobre
   * una ruta protegida rebotaba a /login mientras el navbar ya mostraba al
   * usuario. Con mocks nunca se notó, porque ahí la sesión se lee sincrónicamente.
   */
  private readonly ready: Promise<void>;

  /**
   * La lectura del perfil que ya está en vuelo, si hay alguna.
   *
   * Existe porque el perfil se pedía **4 o 5 veces por navegación**: cada
   * `onAuthStateChange` (`INITIAL_SESSION`, `SIGNED_IN`, `TOKEN_REFRESHED`…)
   * lanzaba la suya, y encima `restoreSupabaseSession` y `login`/`register`
   * pedían la propia. Todas devolvían lo mismo. Compartiendo la que ya corre,
   * las que coinciden en el tiempo se vuelven una sola petición.
   */
  private inFlight: Promise<ProfileLoad> | null = null;

  constructor() {
    if (this.supabase.shouldUseMockData()) {
      this._user.set(this.readMockSession());
      this.ready = Promise.resolve();
      return;
    }

    this.ready = this.restoreSupabaseSession();

    // Mantiene la señal sincronizada con el cliente: cubre el refresh del token,
    // el cierre de sesión desde otra pestaña y el enlace de confirmación.
    this.supabase.db.auth.onAuthStateChange((event, session) => {
      // **Solo** `SIGNED_OUT` cierra la sesión. Antes bastaba con que el evento
      // llegara sin `session`, y eso borraba el usuario y la lectura en vuelo:
      // un `INITIAL_SESSION` sin sesión —que llega al arrancar— soltaba el
      // candado y dejaba pasar lecturas repetidas.
      if (event === 'SIGNED_OUT') {
        this._user.set(null);
        // Lo que estuviera cargando era de la sesión que acaba de cerrarse.
        this.inFlight = null;
        return;
      }

      // Un evento sin sesión que no sea `SIGNED_OUT` no dice nada nuevo: no hay
      // a quién cargar, y pisar lo que ya hay solo provoca releerlo.
      if (!session) return;

      // Ya tenemos el perfil de esta persona. `TOKEN_REFRESHED` llega cada vez
      // que se renueva el token y no cambia nada del perfil, así que releerlo
      // es una petición por gusto. Si cambia de cuenta, el id no coincide y sí
      // se relee.
      if (this._user()?.id === session.user.id) return;

      void this.loadProfile();
    });
  }

  // --- API pública ---------------------------------------------------------

  /**
   * Espera a que la sesión termine de restaurarse. Pensada para los guards,
   * que deciden en la primera navegación de la app.
   */
  whenReady(): Promise<void> {
    return this.ready;
  }

  login(credentials: LoginCredentials): Observable<UserModel> {
    if (this.supabase.shouldUseMockData()) {
      return this.mockLogin(credentials);
    }

    return from(
      this.supabase.db.auth.signInWithPassword({
        email: credentials.email.trim(),
        password: credentials.password,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(this.translateAuthError(error.message));
        if (!data.user) throw new Error('No pudimos iniciar tu sesion.');
      }),
      // El nombre visible sale del perfil, no de los metadatos del auth.
      switchMap(() => this.loadProfileOrThrow()),
    );
  }

  /**
   * Crea la cuenta.
   *
   * Devuelve **en qué terminó** el registro en vez de un usuario a secas,
   * porque `signUp` tiene dos finales legítimos y solo uno trae usuario:
   *
   * - Con sesión (el proyecto no pide confirmar el correo): se lee el perfil y
   *   la persona queda dentro → `active`.
   * - Sin sesión (el proyecto sí la pide): la cuenta existe pero no hay con qué
   *   leer `profiles`, y tocarla iría como `anon` → `confirm-email`. **No es un
   *   error**, así que no se lanza: la pantalla enseña el aviso de confirmación.
   */
  register(payload: RegisterPayload): Observable<RegisterOutcome> {
    const email = payload.email.trim();

    if (this.supabase.shouldUseMockData()) {
      return this.mockRegister(payload).pipe(map((user) => ({ status: 'active', user }) as const));
    }

    return from(
      this.supabase.db.auth.signUp({
        email,
        password: payload.password,
        options: {
          // El trigger handle_new_user lee estos metadatos para armar el perfil.
          data: {
            display_name: payload.displayName.trim(),
            phone: payload.phone ?? '',
            location: payload.location ?? '',
          },
        },
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(this.translateAuthError(error.message));
        if (!data.user) throw new Error('No pudimos crear tu cuenta.');
        return data.session !== null;
      }),
      switchMap((hasSession) =>
        hasSession
          ? this.loadProfileOrThrow().pipe(map((user) => ({ status: 'active', user }) as const))
          : of({ status: 'confirm-email', email } as const),
      ),
    );
  }

  logout(): void {
    if (this.supabase.shouldUseMockData()) {
      this._user.set(null);
      this.clearMockSession();
      return;
    }

    void this.supabase.db.auth.signOut().then(() => this._user.set(null));
  }

  /** uuid del usuario actual, o null. Lo usan los servicios que escriben. */
  currentUserId(): string | null {
    return this._user()?.id ?? null;
  }

  // --- Supabase ------------------------------------------------------------

  /**
   * Carga el perfil para login/registro y falla si no se pudo.
   *
   * Lo que ve el usuario es siempre la misma frase amable: la pista técnica
   * —que el trigger `on_auth_user_created` podría no estar instalado— va a la
   * consola, que es donde sirve. Antes se lanzaba tal cual y esa frase acabó
   * impresa en el formulario de registro del sitio en vivo.
   */
  private loadProfileOrThrow(): Observable<UserModel> {
    return from(this.loadProfile()).pipe(
      map((result) => {
        if (result.status === 'ok') return result.user;

        if (result.status === 'missing') {
          console.error(
            '[supabase] get_my_profile no devolvio fila para una sesion valida. ' +
              'Verifica que el trigger on_auth_user_created este instalado (0001_schema.sql).',
          );
        }
        throw new Error('No pudimos cargar tu perfil. Intenta de nuevo en un momento.');
      }),
    );
  }

  /**
   * Carga el perfil y actualiza la señal.
   *
   * Va por `get_my_profile()` (migración 0009) y no por un select sobre
   * `profiles`, porque es la única forma de leer el propio `phone`: 0006 le quitó
   * esa columna a las claves anon y authenticated, y los permisos de columna son
   * por rol, no por fila. Con el select normal `user().phone` era siempre
   * `undefined`, así que el checkout nunca precargaba el teléfono.
   *
   * La función no recibe ningún id: usa `auth.uid()`.
   *
   * **Un fallo no borra la sesión.** Solo se limpia la señal cuando la fila de
   * verdad no está; si la petición falló, lo que había se queda. Un 401 pasajero
   * no es motivo para sacar a nadie de su cuenta.
   */
  private loadProfile(): Promise<ProfileLoad> {
    if (this.inFlight) return this.inFlight;

    const run = this.reloadProfile();
    this.inFlight = run;
    void run.finally(() => {
      // Solo si sigue siendo la misma: un cierre de sesión pudo haberla soltado
      // ya, y no hay que pisar lo que venga después.
      if (this.inFlight === run) this.inFlight = null;
    });
    return run;
  }

  /**
   * La lectura de verdad, sin compartir. La usa `updateProfile()`, que
   * **necesita** releer después de guardar: reusar una lectura que empezó antes
   * del guardado devolvería los datos viejos.
   */
  private async reloadProfile(): Promise<ProfileLoad> {
    const { data, error } = await this.fetchProfile();
    const row = data?.[0];

    if (error) {
      console.error('[supabase] get_my_profile', error);
      return { status: 'failed' };
    }
    if (!row) {
      this._user.set(null);
      return { status: 'missing' };
    }

    // El correo sale de Supabase Auth, no de la tabla: es su fuente
    // autoritativa y sigue disponible para el usuario en sesión.
    const { data: authData } = await this.supabase.db.auth.getUser();
    const user = toUser(row, authData.user?.email ?? row.email, row.phone);
    this._user.set(user);
    return { status: 'ok', user };
  }

  /**
   * `get_my_profile()`, con un reintento cuando la primera llamada sale sin
   * sesión.
   *
   * Esto arregla el fallo de registro del 27/08/2026. supabase-js resuelve la
   * cabecera `Authorization` de cada llamada a PostgREST con
   * `auth.getSession()`, y **si eso devuelve null cae a la clave anon**. Durante
   * un `signUp`/`signInWithPassword` el cliente tiene tomado su propio lock de
   * auth mientras notifica `SIGNED_IN`, así que esa carrera se puede perder: la
   * llamada sale como `anon` y desde la migración 0015 `anon` ya no puede
   * ejecutar la función → **401**. En los registros del proyecto se ven las dos
   * llamadas seguidas, una 200 y otra 401.
   *
   * Con la sesión ya asentada el reintento va con el token bueno. Se reintenta
   * también cuando no vino fila, porque una llamada como `anon` que sí tuviera
   * permiso devolvería cero filas (`auth.uid()` es null) y eso se confundiría
   * con "esta cuenta no tiene perfil".
   */
  private async fetchProfile(): Promise<Awaited<ReturnType<typeof this.callGetMyProfile>>> {
    const first = await this.callGetMyProfile();
    if (!first.error && first.data?.[0]) return first;

    const { data } = await this.supabase.db.auth.getSession();
    if (!data.session) return first;

    return await this.callGetMyProfile();
  }

  private callGetMyProfile() {
    return this.supabase.db.rpc('get_my_profile');
  }

  /**
   * Guarda los cambios del propio perfil y refresca la señal.
   *
   * Solo estos tres campos: son los que la política de `profiles` permite
   * cambiar a su dueño. `is_admin` e `is_verified` se pueden enviar y la petición
   * responde 204, pero el trigger de 0005 los deja como estaban — así que no se
   * envían, para no dar la impresión de que se guardaron.
   *
   * El `update` **no pide la fila de vuelta**: traería `email` y `phone`, que no
   * son legibles con un select. Después se relee con `loadProfile()`, que sí los
   * obtiene por la función de 0009. Se prefiere releer a quedarse con lo enviado
   * porque así la señal refleja lo que la base guardó de verdad, incluido
   * cualquier recorte o normalización que haga Postgres.
   */
  updateProfile(changes: {
    displayName: string;
    phone?: string;
    location?: string;
  }): Observable<UserModel> {
    const current = this._user();
    if (!current) {
      return throwError(() => new Error('Necesitas una sesion para editar tu perfil.'));
    }

    const next: UserModel = {
      ...current,
      displayName: changes.displayName.trim(),
      phone: changes.phone?.trim() || undefined,
      location: changes.location?.trim() || undefined,
    };

    if (this.supabase.shouldUseMockData()) {
      this.persistMockSession(next);
      return of(next);
    }

    return from(
      this.supabase.db
        .from('profiles')
        .update({
          display_name: next.displayName,
          phone: next.phone ?? null,
          location: next.location ?? null,
        })
        .eq('id', current.id),
    ).pipe(
      switchMap((res) => {
        if (res.error) {
          console.error('[supabase] updateProfile', res.error);
          throw new Error('No pudimos guardar tu perfil. Intenta de nuevo.');
        }
        return from(this.reloadProfile());
      }),
      map((result) => (result.status === 'ok' ? result.user : next)),
    );
  }

  private async restoreSupabaseSession(): Promise<void> {
    try {
      const { data } = await this.supabase.db.auth.getSession();
      const user = data.session?.user;
      if (!user) return;

      // El `INITIAL_SESSION` de `onAuthStateChange` puede habérsenos adelantado
      // y dejar el perfil ya cargado. Si sigue en vuelo, `loadProfile()`
      // devuelve esa misma promesa y esto la espera, que es lo que los guards
      // necesitan de `whenReady()`.
      if (this._user()?.id === user.id) return;

      await this.loadProfile();
    } finally {
      this._isRestoring.set(false);
    }
  }

  /** Mensajes de Supabase (en inglés) traducidos a lo que ve el usuario. */
  private translateAuthError(message: string): string {
    const normalized = message.toLowerCase();

    if (normalized.includes('invalid login credentials')) {
      return 'Correo o contrasena incorrectos.';
    }
    if (normalized.includes('email not confirmed')) {
      return 'Confirma tu correo antes de entrar. Revisa tu bandeja.';
    }
    if (normalized.includes('user already registered')) {
      return 'Ese correo ya tiene una cuenta.';
    }
    if (normalized.includes('password should be at least')) {
      return 'La contrasena debe tener al menos 6 caracteres.';
    }
    if (normalized.includes('rate limit') || normalized.includes('too many')) {
      return 'Demasiados intentos. Espera un momento.';
    }
    return 'No pudimos completar la operacion. Intenta de nuevo.';
  }

  // --- Modo simulado -------------------------------------------------------

  private mockLogin(credentials: LoginCredentials): Observable<UserModel> {
    const problem = this.validateMock(credentials.email, credentials.password);
    if (problem) return throwError(() => new Error(problem));

    const user = this.buildMockUser(credentials.email);
    return of(user).pipe(tap((u) => this.persistMockSession(u)));
  }

  private mockRegister(payload: RegisterPayload): Observable<UserModel> {
    const problem = this.validateMock(payload.email, payload.password);
    if (problem) return throwError(() => new Error(problem));

    const user: UserModel = {
      ...this.buildMockUser(payload.email),
      displayName: payload.displayName,
      phone: payload.phone,
      location: payload.location,
    };
    return of(user).pipe(tap((u) => this.persistMockSession(u)));
  }

  private validateMock(email: string, password: string): string | null {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return 'Ingresa un correo valido.';
    }
    if (password.length < 6) {
      return 'La contrasena debe tener al menos 6 caracteres.';
    }
    return null;
  }

  private buildMockUser(email: string): UserModel {
    const handle = email.split('@')[0];
    const role = mockRoleFor(email);
    return {
      // Determinista a partir del correo: la misma cuenta conserva su id.
      id: `mock-${Math.abs(this.hash(email))}`,
      displayName: handle.charAt(0).toUpperCase() + handle.slice(1),
      email,
      isVerified: false,
      role,
      isAdmin: role === 'admin',
      isTestUser: mockIsTestUser(email),
      createdAt: new Date().toISOString(),
    };
  }

  private hash(value: string): number {
    let h = 0;
    for (const char of value) {
      h = (h << 5) - h + char.charCodeAt(0);
      h |= 0;
    }
    return h;
  }

  private persistMockSession(user: UserModel): void {
    this._user.set(user);
    try {
      localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(user));
    } catch {
      // Modo privado o storage lleno: la sesión sigue viva en memoria.
    }
  }

  private readMockSession(): UserModel | null {
    try {
      const raw = localStorage.getItem(MOCK_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as UserModel;
      if (!parsed?.email) return null;

      // Una sesión guardada antes de la fase 5 no tiene `role`. Se deriva del
      // correo con la misma convención, para que quien tenga el navegador
      // abierto desde ayer no se quede con un rol indefinido.
      const role = parsed.role ?? mockRoleFor(parsed.email);
      // `isTestUser` se deriva igual que el rol para las sesiones guardadas
      // antes de la fase 6, que no lo traen.
      const isTestUser = parsed.isTestUser ?? mockIsTestUser(parsed.email);
      return { ...parsed, role, isAdmin: role === 'admin', isTestUser };
    } catch {
      return null;
    }
  }

  private clearMockSession(): void {
    try {
      localStorage.removeItem(MOCK_SESSION_KEY);
    } catch {
      // Nada que limpiar.
    }
  }
}
