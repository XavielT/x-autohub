import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toHubPart } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import { HubPartModel } from '../models/hub-part.model';
import { HUB_PART_MOCK } from '../data/hub-part.mock';

/**
 * Catálogo: la tienda propia de piezas, la que tiene carrito y checkout.
 *
 * Lectura pública; escritura solo admin.
 */
@Injectable({ providedIn: 'root' })
export class HubPartService {
  private readonly supabase = inject(SupabaseService);

  getAll(): Observable<HubPartModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(HUB_PART_MOCK);
    }

    return from(
      this.supabase.db
        .from('hub_parts')
        .select('*')
        .eq('is_active', true)
        .order('id', { ascending: true }),
    ).pipe(map((res) => unwrap(res).map(toHubPart)));
  }

  getById(id: number): Observable<HubPartModel | undefined> {
    if (this.supabase.shouldUseMockData()) {
      return of(HUB_PART_MOCK.find((p) => p.id === id));
    }

    return from(
      this.supabase.db.from('hub_parts').select('*').eq('id', id).maybeSingle(),
    ).pipe(map((res) => (res.data ? toHubPart(res.data) : undefined)));
  }

  getByCategory(category: string): Observable<HubPartModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(HUB_PART_MOCK.filter((p) => p.category === category));
    }

    return from(
      this.supabase.db
        .from('hub_parts')
        .select('*')
        .eq('category', category)
        .eq('is_active', true),
    ).pipe(map((res) => unwrap(res).map(toHubPart)));
  }
}
