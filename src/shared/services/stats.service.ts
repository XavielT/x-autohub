import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { unwrap } from '../../core/supabase/supabase-error';
import { SiteStats } from '../models/site-stats.model';
import { visibleTo } from '../utils/test-visibility';
import { AUTO_HUB_MOCK } from '../data/auto-hub.mock';
import { HUB_PART_MOCK } from '../data/hub-part.mock';
import { HUB_MARKET_ITEMS_MOCK } from '../data/hub-market-item.mock';
import { ADMIN_USERS_MOCK } from '../data/admin.mock';

/**
 * Los contadores reales del sitio.
 *
 * En modo real es una sola llamada a `get_site_stats()` (migración 0014): los
 * tres conteos vienen juntos porque la sección los pinta juntos, y tres
 * consultas serían tres viajes para dibujar una fila.
 *
 * Los números son siempre **los de un visitante anónimo**, sea quien sea el que
 * mire: sin contenido de prueba, sin publicaciones pendientes, sin cuentas de
 * prueba. Eso lo garantiza la función en Postgres, y aquí la rama simulada tiene
 * que hacer lo mismo — si un admin viera en el home unos números que ningún
 * visitante ve, creería que el sitio tiene más de lo que muestra.
 */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly supabase = inject(SupabaseService);

  getSiteStats(): Observable<SiteStats> {
    if (this.supabase.shouldUseMockData()) {
      return of(countMocks());
    }

    return from(this.supabase.db.rpc('get_site_stats')).pipe(
      map((res) => {
        const rows = unwrap(res);
        // `returns table` siempre trae una fila; si no la trajera, ceros es
        // mejor que reventar la portada del sitio.
        return rows[0] ?? { vehicles: 0, parts: 0, members: 0 };
      }),
    );
  }
}

/**
 * El espejo en modo simulado de las tres condiciones de `get_site_stats()`.
 *
 * `visibleTo(null)` y no `visibleTo(this.auth.user())`: el predicado se resuelve
 * para **nadie**, que es el nivel de un visitante anónimo. Es la misma función
 * que usan los listados para filtrar contenido de prueba, así que la regla se
 * escribe una vez de este lado (y una vez en la migración, del otro).
 */
function countMocks(): SiteStats {
  const anonymous = visibleTo(null);

  const autoHub = AUTO_HUB_MOCK.filter(anonymous).length;

  // La ausencia de `status` cuenta como aprobado, igual que en
  // `HubMarketService`: los mocks anteriores a la fase 5 no lo traen, y sin el
  // default no contaría ninguno.
  const marketVehicles = HUB_MARKET_ITEMS_MOCK.filter(
    (item) => item.category === 'vehiculos' && (item.status ?? 'aprobado') === 'aprobado',
  ).filter(anonymous).length;

  return {
    vehicles: autoHub + marketVehicles,
    parts: HUB_PART_MOCK.filter(anonymous).length,
    // Los perfiles no tienen mock propio del lado público; el del panel es el
    // único que existe. Es el mismo hueco que ya anota el ROADMAP (unificar los
    // mocks del panel con los del sitio).
    members: ADMIN_USERS_MOCK.filter((user) => !user.isTestUser).length,
  };
}
