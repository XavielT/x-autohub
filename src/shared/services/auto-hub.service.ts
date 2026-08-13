import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toAutoHubVehicle } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import { AutoHubModel } from '../models/auto-hub.model';
import { AUTO_HUB_MOCK } from '../data/auto-hub.mock';

/**
 * Auto Hub: el inventario propio de X AutoHub, verificado por el equipo.
 *
 * Lectura pública; solo un perfil con `is_admin` puede escribir (ver
 * supabase/migrations/0002_rls.sql).
 */
@Injectable({ providedIn: 'root' })
export class AutoHubService {
  private readonly supabase = inject(SupabaseService);

  getAll(): Observable<AutoHubModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(AUTO_HUB_MOCK);
    }

    return from(
      this.supabase.db
        .from('auto_hub_vehicles')
        .select('*')
        .eq('is_available', true)
        .order('created_at', { ascending: false }),
    ).pipe(map((res) => unwrap(res).map(toAutoHubVehicle)));
  }

  getById(id: number): Observable<AutoHubModel | undefined> {
    if (this.supabase.shouldUseMockData()) {
      return of(AUTO_HUB_MOCK.find((auto) => auto.id === id));
    }

    return from(
      this.supabase.db.from('auto_hub_vehicles').select('*').eq('id', id).maybeSingle(),
    ).pipe(map((res) => (res.data ? toAutoHubVehicle(res.data) : undefined)));
  }
}
