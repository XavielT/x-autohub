import { SiteStats } from '../models/site-stats.model';

/**
 * Los números de impresión de la sección de contadores del home.
 *
 * Es lo que la sección mostraba **escrito a mano en el HTML** desde el primer
 * día: "280+ Vehiculos", "1.3K Piezas", "2.8K Miembros". No salían de ningún
 * dato — el sitio decía 280 vehículos teniendo 6.
 *
 * No se borran, se mueven aquí: mientras el sitio es joven, los números reales
 * son pequeños y esa fila es lo primero que ve alguien que llega. Cuál de los
 * dos se muestra lo decide el ajuste `stats_mode`, que un admin cambia en
 * /admin/ajustes.
 *
 * Esto **no** es un mock: no es la versión simulada de un dato real, es texto de
 * la interfaz. Por eso el archivo no lleva `.mock.ts` y sí lo puede importar un
 * componente (ver la regla de CLAUDE.md).
 */

/**
 * Los valores numéricos. Solo se usan para el panel, que muestra los dos modos
 * lado a lado; la sección del home pinta las cadenas de abajo tal cual.
 */
export const SHOWCASE_STATS: SiteStats = {
  vehicles: 280,
  parts: 1300,
  members: 2800,
};

/**
 * Las cadenas exactas que llevaba el HTML, con su "+" y sus "K".
 *
 * Se guardan literales en vez de derivarlas de `SHOWCASE_STATS` con
 * `compactNumber()` porque el "+" de "280+" no es un formato: es una promesa
 * ("más de 280"), y el formateador de números reales no debe inventarla nunca.
 */
export const SHOWCASE_DISPLAY: Record<keyof SiteStats, string> = {
  vehicles: '280+',
  parts: '1.3K',
  members: '2.8K',
};
