import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toService } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import { ServiciosCardModel } from '../models/servicios-card.model';
import { SERVICIOS_CARD_MOCK } from '../data/servicios-card.mock';

@Injectable({ providedIn: 'root' })
export class ServiciosCardService {
  private readonly supabase = inject(SupabaseService);

  getServicios(): Observable<ServiciosCardModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(SERVICIOS_CARD_MOCK);
    }

    return from(
      this.supabase.db
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ).pipe(map((res) => unwrap(res).map(toService)));
  }
}
