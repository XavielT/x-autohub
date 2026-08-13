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
