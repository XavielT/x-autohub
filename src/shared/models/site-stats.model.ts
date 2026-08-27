/**
 * Los tres contadores del home.
 *
 * Misma forma que devuelve `get_site_stats()` (migración 0014), y misma que
 * tienen los números de impresión de `showcase-stats.ts`, para que la sección
 * pueda pintar cualquiera de los dos sin dos caminos distintos.
 */
export interface SiteStats {
  /** Vehículos de Auto Hub disponibles + publicaciones de vehículos aprobadas. */
  vehicles: number;
  /** Piezas activas del catálogo propio. */
  parts: number;
  /** Cuentas registradas, sin contar las de prueba. */
  members: number;
}
