import { UserRole } from './user.model';

/** Una versión publicada del sitio, como se ve en el historial. */
export interface ReleaseModel {
  id: number;
  /** Semver sin la 'v': '0.1.0'. */
  version: string;
  /** Fecha de publicación, ya parseada para el pipe `date`. */
  releasedAt: Date;
  title: string;
  /** Resumen técnico. Solo lo lee el admin: en la lista pública llega vacío (0062). */
  summary: string;
  /** Resumen para quien usa el sitio, en español llano. Es lo único que se enseña al público. */
  userSummary?: string;
  /** Los puntos del changelog, en orden. Solo admin: en la lista pública llega vacío (0062). */
  changes: string[];
  /** En false se puede redactar sin que el público la vea. */
  isPublished: boolean;
}

/** Lo que el formulario del panel envía para crear o editar una versión. */
export interface ReleaseDraft {
  version: string;
  releasedAt: string;
  title: string;
  summary: string;
  userSummary?: string;
  changes: string[];
  isPublished: boolean;
}

/** Usuario tal como lo devuelve `admin_list_users()`. */
export interface AdminUserModel {
  id: string;
  displayName: string;
  email: string;
  phone?: string;
  location?: string;
  /** Fuente de verdad de los permisos. Ver `UserRole`. */
  role: UserRole;
  /** Atajo de `role === 'admin'`, derivado. */
  isAdmin: boolean;
  isVerified: boolean;
  /** Ve el contenido de prueba. No es un rol. Ver `UserModel.isTestUser`. */
  isTestUser: boolean;
  /** Foto de perfil, si tiene. No viene de `admin_list_users()`: se lee aparte de `profiles`. */
  avatarUrl?: string;
  createdAt: Date;
}
