import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

/**
 * Doble de prueba del `SupabaseService`.
 *
 * Existe por la trampa que documenta CLAUDE.md: **Supabase no pasa por
 * `HttpClient`** (usa fetch por dentro), así que `provideHttpClientTesting` no
 * lo intercepta. Sin este doble, en cuanto `environment.ts` tiene credenciales
 * reales las pruebas dejan de ejercitar la rama de mocks y le pegan por red al
 * proyecto de Supabase de verdad — que es justo lo que pasó al conectar el
 * backend: 6 pruebas de sesión empezaron a fallar contra la base en vivo.
 *
 * Forzar `shouldUseMockData()` a `true` mantiene el suite hermético y
 * determinista, sin depender de lo que haya en el environment.
 *
 * Los specs que necesiten ejercitar la rama de Supabase deben sustituir este
 * provider por un doble propio con los datos que esa prueba espera.
 */
export class TestSupabaseService implements Pick<SupabaseService, 'isConfigured' | 'shouldUseMockData'> {
  readonly isConfigured = false;

  get db(): SupabaseClient {
    throw new Error(
      'Una prueba intentó usar el cliente real de Supabase. Los specs corren ' +
        'en modo mock; si necesitas la rama de Supabase, sustituye el provider ' +
        'de SupabaseService en ese spec.',
    );
  }

  shouldUseMockData(): boolean {
    return true;
  }
}
