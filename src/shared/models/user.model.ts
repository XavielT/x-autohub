/**
 * Jerarquía de permisos, de más a menos:
 *
 * - `admin` — todo. Es el único que reparte roles.
 * - `moderador` — aprueba y rechaza publicaciones de Hub Market. Nada más:
 *   ni catálogo, ni pedidos, ni inventario, ni nombrar a nadie.
 * - `user` — el valor por defecto de cualquier cuenta nueva.
 *
 * Migración 0011. La fuente de verdad es la columna `role`; `isAdmin` se deriva
 * de ella.
 */
export type UserRole = 'admin' | 'moderador' | 'user';

export interface UserModel {
  /** uuid de auth.users / profiles.id en Supabase. */
  id: string;
  /** Nombre visible en listados, comentarios y perfil. */
  displayName: string;
  email: string;
  /** Teléfono de contacto que se muestra en sus publicaciones. */
  phone?: string;
  location?: string;
  avatarUrl?: string;
  /** Cuenta verificada por el equipo de X AutoHub. */
  isVerified?: boolean;
  /**
   * Qué puede hacer esta cuenta. Ver `UserRole`.
   *
   * Solo lo cambia `set_user_role()` llamada por un admin, o la clave
   * `service_role`: el trigger de 0005 —extendido en 0011— congela la columna
   * para cualquier sesión del navegador.
   */
  role: UserRole;
  /**
   * Atajo de `role === 'admin'`.
   *
   * Se conserva mientras queden consumidores que lo lean (`AdminUserModel`, el
   * panel). La fuente de verdad es `role`; esto se deriva, nunca se guarda
   * aparte.
   */
  isAdmin?: boolean;
  /**
   * Puede ver el contenido marcado como de prueba.
   *
   * **No es un rol**: quien lo tiene sigue siendo `user` y no modera ni
   * administra nada. Solo lo cambia `set_user_test()` llamada por un admin; el
   * trigger de 0005 —extendido en 0013— congela la columna para el navegador.
   *
   * Un admin o un moderador ven lo de prueba por su rol, sin necesidad de esto.
   * Ver `shared/utils/test-visibility.ts`.
   */
  isTestUser?: boolean;
  createdAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  displayName: string;
  email: string;
  password: string;
  phone?: string;
  location?: string;
}
