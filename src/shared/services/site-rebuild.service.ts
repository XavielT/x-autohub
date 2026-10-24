import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { SiteRebuildStatusRow } from '../../core/supabase/database.types';
import { unwrap } from '../../core/supabase/supabase-error';
import { SiteBuild, SiteBuildState, SiteRebuildResult, SiteRebuildStatus } from '../models/site-rebuild.model';

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

  /**
   * Cómo va el último despliegue de producción, preguntándoselo a Vercel por la Edge Function
   * `build-status` (solo admin). `null` cuando no se puede saber: modo simulado, la función sin
   * desplegar o sin su token, Vercel caído. **Nunca falla**: la barra es informativa y sin esto
   * sigue diciendo lo que ya sabía (cuándo se pidió el despliegue).
   */
  getBuild(): Observable<SiteBuild | null> {
    if (this.supabase.shouldUseMockData()) return of(null);

    return from(this.supabase.db.functions.invoke('build-status')).pipe(
      map(({ data, error }) => {
        if (error) console.warn('[build-status] no se pudo leer el despliegue', error);
        return error ? null : toBuildFromResponse(data);
      }),
      catchError((error) => {
        console.warn('[build-status] no se pudo leer el despliegue', error);
        return of(null);
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

const BUILD_STATES: readonly SiteBuildState[] = ['queued', 'building', 'ready', 'error', 'canceled', 'unknown'];

/** La respuesta de `build-status` → un `SiteBuild`, o `null` si no trae un despliegue que enseñar. */
export function toBuildFromResponse(data: unknown): SiteBuild | null {
  const body = data as { configured?: boolean; available?: boolean; build?: Partial<SiteBuild> } | null;
  if (!body?.configured || !body.available || !body.build) return null;

  const { build } = body;
  return {
    state: BUILD_STATES.includes(build.state as SiteBuildState) ? (build.state as SiteBuildState) : 'unknown',
    createdAt: build.createdAt ?? null,
    readyAt: build.readyAt ?? null,
    message: build.message ?? '',
    inspectorUrl: build.inspectorUrl ?? null,
  };
}

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
