import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { SiteRebuildStatusRow } from '../../core/supabase/database.types';
import { unwrap } from '../../core/supabase/supabase-error';
import { SiteRebuildResult, SiteRebuildStatus } from '../models/site-rebuild.model';

/** Lo mismo que `c_min_gap` de `request_site_rebuild()`: un doble clic no pide dos despliegues. */
const MIN_GAP_MS = 60_000;

/**
 * La republicación del sitio desde el panel (migraciones 0026 y 0027).
 *
 * Las páginas públicas son HTML prerenderizado, una foto del último despliegue. La base pide
 * sola un despliegue unos minutos después de un cambio de catálogo; esto deja ver si hay algo
 * pendiente y pedirlo ya ("Publicar ahora"). Las dos funciones son solo de admin y vuelven a
 * comprobarlo dentro de Postgres: la tabla y el enlace del hook no se leen desde el navegador.
 *
 * En modo simulado no hay base ni Vercel: el estado vive en memoria y "publicar" solo lo anota.
 */
@Injectable({ providedIn: 'root' })
export class SiteRebuildService {
  private readonly supabase = inject(SupabaseService);

  private mockLastFiredAt: string | null = null;
  private mockFireCount = 0;

  getStatus(): Observable<SiteRebuildStatus> {
    if (this.supabase.shouldUseMockData()) {
      return of({
        pendingSince: null,
        lastChangeAt: null,
        lastFiredAt: this.mockLastFiredAt,
        fireCount: this.mockFireCount,
        hookConfigured: true,
      });
    }

    return from(this.supabase.db.rpc('site_rebuild_status')).pipe(
      map((res) => {
        const row = unwrap(res)[0];
        // Sin fila no hay estado que enseñar: se trata como "al día y sin enlace" y no como un error.
        return row ? toStatus(row) : EMPTY_STATUS;
      }),
    );
  }

  /** "Publicar ahora": pide el despliegue sin esperar a que el panel se calle. */
  requestNow(): Observable<SiteRebuildResult> {
    if (this.supabase.shouldUseMockData()) {
      const last = this.mockLastFiredAt ? Date.parse(this.mockLastFiredAt) : 0;
      if (Date.now() - last < MIN_GAP_MS) return of('too_soon');

      this.mockLastFiredAt = new Date().toISOString();
      this.mockFireCount += 1;
      return of('requested');
    }

    return from(this.supabase.db.rpc('request_site_rebuild')).pipe(
      map((res) => toResult(unwrap(res))),
    );
  }
}

const EMPTY_STATUS: SiteRebuildStatus = {
  pendingSince: null,
  lastChangeAt: null,
  lastFiredAt: null,
  fireCount: 0,
  hookConfigured: false,
};

export function toStatus(row: SiteRebuildStatusRow): SiteRebuildStatus {
  return {
    pendingSince: row.dirty_since,
    lastChangeAt: row.last_change_at,
    lastFiredAt: row.last_fired_at,
    fireCount: row.fired_count,
    hookConfigured: row.hook_configured,
  };
}

/** Un código que la función no conoce se trata como la negativa más prudente, no como un éxito. */
export function toResult(code: string): SiteRebuildResult {
  return code === 'requested' || code === 'too_soon' || code === 'no_hook' ? code : 'no_hook';
}
