/** Una versión publicada del sitio, como se ve en el historial. */
export interface ReleaseModel {
  id: number;
  /** Semver sin la 'v': '0.1.0'. */
  version: string;
  /** Fecha de publicación, ya parseada para el pipe `date`. */
  releasedAt: Date;
  title: string;
  summary: string;
  /** Los puntos del changelog, en orden. */
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
  isAdmin: boolean;
  isVerified: boolean;
  createdAt: Date;
}
