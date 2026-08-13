/**
 * Forma del objeto de configuración por entorno.
 *
 * Vive en su propio archivo a propósito: `environment.ts` se sustituye por
 * `environment.production.ts` en el build de producción, así que el tipo no
 * puede declararse dentro de ninguno de los dos.
 */
export interface AppEnvironment {
  production: boolean;

  /**
   * Fuerza el uso de mocks locales aunque Supabase esté configurado.
   * Útil para trabajar la UI sin tocar la base de datos.
   *
   * Si es `false` pero faltan las credenciales de Supabase, la app **también**
   * usa mocks: nadie se queda con la pantalla en blanco por no haber
   * configurado el backend. Ver `shouldUseMockData()`.
   */
  useMockData: boolean;

  /** URL del proyecto: https://<ref>.supabase.co */
  supabaseUrl: string;

  /**
   * Clave `anon` / `publishable`.
   *
   * Es pública por diseño y va en el bundle del navegador; lo que protege los
   * datos son las políticas RLS de supabase/migrations/0002_rls.sql.
   *
   * ⚠️ La clave `service_role` NUNCA va aquí ni en ningún archivo del frontend:
   * se salta todas las políticas RLS.
   */
  supabaseAnonKey: string;
}
