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

  constructor() {
    if (this.supabase.shouldUseMockData()) {
      this._user.set(this.readMockSession());
      return;
    }

    void this.restoreSupabaseSession();

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

  /** Carga el perfil y actualiza la señal. */
  private async loadProfile(userId: string): Promise<UserModel | null> {
    const { data, error } = await this.supabase.db
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      this._user.set(null);
      return null;
    }

    const user = toUser(data);
    this._user.set(user);
    return user;
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
