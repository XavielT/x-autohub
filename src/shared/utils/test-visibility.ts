import { UserModel } from '../models/user.model';

/**
 * Visibilidad del contenido marcado como de prueba.
 *
 * En modo real esto lo resuelve Postgres: la migración 0013 añade
 * `(not is_test or can_see_test_items())` a las políticas de select de las
 * cuatro tablas de contenido, así que las filas de prueba **no llegan** al
 * navegador de quien no debe verlas. El cliente no vuelve a filtrar; si lo
 * hiciera, escondería también lo que un admin sí tiene que ver.
 *
 * En modo simulado no hay RLS ni hay nada parecido, y el filtro tiene que
 * hacerlo la app. De ahí este módulo: **una sola** definición de "quién ve qué",
 * usada por todos los servicios en su rama de mocks. Repetir la condición en
 * cada servicio es cómo se termina con un listado que la aplica y un
 * "relacionados" que no.
 */

/** Cualquier cosa que se pueda marcar como de prueba. */
export interface TestFlagged {
  isTest?: boolean;
}

/**
 * Quién puede ver el contenido de prueba: admin, moderador y usuario de prueba.
 *
 * Es el espejo de `can_see_test_items()` en Postgres. Sin sesión, `false`: es el
 * permiso más bajo, y tratar "nadie" como "usuario normal" nunca abre de más.
 *
 * Un moderador entra porque la función de la base se apoya en
 * `is_moderator_or_admin()`; las dos jerarquías se escriben una vez de cada lado
 * y no se repiten en cada componente.
 */
export function canSeeTestItems(user: UserModel | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'moderador' || user.isTestUser === true;
}

/**
 * Predicado listo para `Array.filter`, resuelto **una vez** por llamada.
 *
 * Se devuelve una función y no se recibe el artículo directamente para que el
 * permiso se calcule una sola vez por listado y no una vez por fila.
 *
 *     items.filter(visibleTo(this.auth.user()))
 *
 * La ausencia de `isTest` cuenta como `false`: el contenido sembrado y los mocks
 * anteriores a la fase 6 no lo traen, y esconderlos vaciaría el sitio.
 */
export function visibleTo<T extends TestFlagged>(
  user: UserModel | null | undefined,
): (item: T) => boolean {
  const allowed = canSeeTestItems(user);
  return (item) => allowed || item.isTest !== true;
}
