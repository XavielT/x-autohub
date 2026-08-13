import { PostgrestError } from '@supabase/supabase-js';

/**
 * Traduce un error de Postgrest a un mensaje que el usuario pueda entender.
 *
 * Supabase no pasa por HttpClient (usa fetch internamente), así que el
 * httpErrorInterceptor de Angular no lo ve. Esta es la traducción equivalente
 * para las llamadas a la base de datos.
 *
 * Códigos: https://postgrest.org/en/stable/references/errors.html
 */
export function translateDbError(error: PostgrestError | null): string {
  if (!error) return 'Algo salio mal. Intenta de nuevo.';

  switch (error.code) {
    case '23505': // unique_violation
      return 'Ese registro ya existe.';
    case '23503': // foreign_key_violation
      return 'El registro referenciado no existe.';
    case '23514': // check_violation
      return 'Los datos no cumplen con lo requerido. Revisa el formulario.';
    case '23502': // not_null_violation
      return 'Faltan campos obligatorios.';
    case '42501': // insufficient_privilege — típicamente RLS
    case 'PGRST301':
      return 'No tienes permiso para hacer esto. Inicia sesion e intenta de nuevo.';
    case 'PGRST116': // 0 filas cuando se esperaba exactamente 1
      return 'No encontramos lo que buscabas.';
    default:
      // Sin conexión: supabase-js no llena `code`.
      if (!error.code && /fetch|network/i.test(error.message ?? '')) {
        return 'Sin conexion con el servidor. Revisa tu internet.';
      }
      return 'Algo salio mal. Intenta de nuevo.';
  }
}

/**
 * Envuelve el resultado de una consulta: devuelve los datos o lanza con el
 * mensaje ya traducido.
 */
export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }): T {
  if (result.error) {
    // El detalle técnico queda en consola para depurar; el usuario ve el
    // mensaje traducido.
    console.error('[supabase]', result.error);
    throw new Error(translateDbError(result.error));
  }
  if (result.data === null) {
    throw new Error('No encontramos lo que buscabas.');
  }
  return result.data;
}
