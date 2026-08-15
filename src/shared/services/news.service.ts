import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toNews } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import { NewCardModel } from '../models/new-card.model';
import { NEWS_MOCK } from '../data/new-card.mock';
import { AuthService } from './auth.service';
import { visibleTo } from '../utils/test-visibility';

/**
 * Noticias del home y su página de detalle.
 *
 * Antes `home-news` y `new-details` importaban NEWS_MOCK directamente, saltándose
 * la capa de servicios. Este servicio cierra ese hueco.
 *
 * Las noticias de prueba las esconde RLS en modo real (0013); en modo simulado
 * las filtra este servicio.
 */
@Injectable({ providedIn: 'root' })
export class NewsService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  /** El predicado de visibilidad de prueba para la sesión actual. */
  private get visible() {
    return visibleTo<NewCardModel>(this.auth.user());
  }

  getAll(): Observable<NewCardModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(NEWS_MOCK.filter(this.visible));
    }

    return from(
      this.supabase.db
        .from('news')
        .select('*')
        .eq('is_published', true)
        .order('published_at', { ascending: false }),
    ).pipe(map((res) => unwrap(res).map(toNews)));
  }

  getById(id: number): Observable<NewCardModel | undefined> {
    if (this.supabase.shouldUseMockData()) {
      return of(NEWS_MOCK.filter(this.visible).find((n) => n.id === id));
    }

    return from(this.supabase.db.from('news').select('*').eq('id', id).maybeSingle()).pipe(
      map((res) => (res.data ? toNews(res.data) : undefined)),
    );
  }
}
