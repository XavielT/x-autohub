import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, from, map, of, switchMap, tap, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toUser } from '../../core/supabase/mappers';
import { LoginCredentials, RegisterPayload, UserModel } from '../models/user.model';

const MOCK_SESSION_KEY = 'x-autohub.session';

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
   * Acceso al panel de administración.
   *
   * Sirve para mostrar u ocultar la entrada del navbar y para el `adminGuard`,
   * **no como medida de seguridad**: quien manipule el cliente puede poner esto
   * en true y no conseguirá nada, porque RLS y las funciones del panel vuelven a
   * comprobarlo dentro de Postgres.
   */
  readonly isAdmin = computed(() => this._user()?.isAdmin === true);

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
      if (event === 'SIGNED_OUT' || !session) {
        this._user.set(null);
        return;
      }
      void this.loadProfile(session.user.id);
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
        return data.user.id;
      }),
      // El nombre visible sale del perfil, no de los metadatos del auth.
      switchMap((userId) => this.loadProfileOrThrow(userId)),
    );
  }

  register(payload: RegisterPayload): Observable<UserModel> {
    if (this.supabase.shouldUseMockData()) {
      return this.mockRegister(payload);
    }

    return from(
      this.supabase.db.auth.signUp({
        email: payload.email.trim(),
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
        return data.user.id;
      }),
      switchMap((userId) => this.loadProfileOrThrow(userId)),
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
   * Carga el perfil y falla si no existe.
   *
   * El trigger `on_auth_user_created` lo crea en el mismo momento del registro,
   * así que su ausencia significa que el trigger no está instalado.
   */
  private loadProfileOrThrow(userId: string): Observable<UserModel> {
    return from(this.loadProfile(userId)).pipe(
      map((user) => {
        if (!user) {
          throw new Error(
            'Tu cuenta existe pero no encontramos su perfil. Verifica que el ' +
              'trigger on_auth_user_created este instalado (0001_schema.sql).',
          );
        }
        return user;
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
   * La función no recibe ningún id — usa `auth.uid()` — así que `userId` solo
   * sirve para el camino simulado.
   */
  private async loadProfile(userId: string): Promise<UserModel | null> {
    const { data, error } = await this.supabase.db.rpc('get_my_profile');
    const row = data?.[0];

    if (error || !row) {
      if (error) console.error('[supabase] get_my_profile', error);
      this._user.set(null);
      return null;
    }

    // El correo sale de Supabase Auth, no de la tabla: es su fuente
    // autoritativa y sigue disponible para el usuario en sesión.
    const { data: authData } = await this.supabase.db.auth.getUser();
    const user = toUser(row, authData.user?.email ?? row.email, row.phone);
    this._user.set(user);
    return user;
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
        return from(this.loadProfile(current.id));
      }),
      map((user) => user ?? next),
    );
  }

  private async restoreSupabaseSession(): Promise<void> {
    try {
      const { data } = await this.supabase.db.auth.getSession();
      if (data.session?.user) {
        await this.loadProfile(data.session.user.id);
      }
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
    return {
      // Determinista a partir del correo: la misma cuenta conserva su id.
      id: `mock-${Math.abs(this.hash(email))}`,
      displayName: handle.charAt(0).toUpperCase() + handle.slice(1),
      email,
      isVerified: false,
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
      return parsed?.email ? parsed : null;
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
