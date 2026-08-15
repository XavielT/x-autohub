import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toHubPart } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import { HubPartModel } from '../models/hub-part.model';
import { HUB_PART_MOCK } from '../data/hub-part.mock';
import { AuthService } from './auth.service';
import { visibleTo } from '../utils/test-visibility';

/**
 * Catálogo: la tienda propia de piezas, la que tiene carrito y checkout.
 *
 * Lectura pública; escritura solo admin.
 *
 * En modo real las piezas de prueba las esconde RLS (migración 0013) y aquí no
 * se vuelve a filtrar. En modo simulado no hay RLS, así que el filtro lo aplica
 * este servicio con el mismo predicado que usan los demás.
 */
@Injectable({ providedIn: 'root' })
export class HubPartService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  /** El predicado de visibilidad de prueba para la sesión actual. */
  private get visible() {
    return visibleTo<HubPartModel>(this.auth.user());
  }

  getAll(): Observable<HubPartModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(HUB_PART_MOCK.filter(this.visible));
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
      return of(HUB_PART_MOCK.filter(this.visible).find((p) => p.id === id));
    }

    return from(
      this.supabase.db.from('hub_parts').select('*').eq('id', id).maybeSingle(),
    ).pipe(map((res) => (res.data ? toHubPart(res.data) : undefined)));
  }

  getByCategory(category: string): Observable<HubPartModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(HUB_PART_MOCK.filter(this.visible).filter((p) => p.category === category));
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
