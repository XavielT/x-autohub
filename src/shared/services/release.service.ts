import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { unwrap } from '../../core/supabase/supabase-error';
import { ReleasePublicRow, ReleaseRow } from '../../core/supabase/database.types';
import { ReleaseDraft, ReleaseModel } from '../models/release.model';
import { RELEASES_MOCK } from '../data/release.mock';

function toRelease(row: ReleaseRow): ReleaseModel {
  return {
    id: row.id,
    version: row.version,
    // released_at llega como 'YYYY-MM-DD'. Se parsea a mediodía UTC para que el
    // cambio de zona horaria no mueva la fecha al día anterior en RD (-4), igual
    // que en `toNews`.
    releasedAt: new Date(`${row.released_at}T12:00:00Z`),
    title: row.title,
    summary: row.summary,
    userSummary: row.user_summary?.trim() || undefined,
    changes: row.changes ?? [],
    isPublished: row.is_published,
  };
}

/** Una versión como la ve el público: solo título y resumen para el usuario, sin el detalle técnico. */
function toPublicRelease(row: ReleasePublicRow): ReleaseModel {
  return {
    id: row.id,
    version: row.version,
    releasedAt: new Date(`${row.released_at}T12:00:00Z`),
    title: row.title,
    summary: '',
    userSummary: row.user_summary,
    changes: [],
    isPublished: true,
  };
}

/**
 * Historial de versiones del sitio.
 *
 * El público lee `releases_public` (migración 0062): solo versión, fecha, título y el resumen
 * para el usuario de lo publicado. La tabla `releases`, con el changelog técnico, es solo de
 * admin, y también la escritura: lo decide RLS, no este servicio (un no-admin que escribe
 * recibe un 42501 traducido).
 */
@Injectable({ providedIn: 'root' })
export class ReleaseService {
  private readonly supabase = inject(SupabaseService);

  /** Copia propia del mock, para no mutar la constante importada. */
  private mockReleases: ReleaseModel[] = [...RELEASES_MOCK];

  /**
   * @param includeDrafts true para el panel de admin: lee la tabla completa (borradores y
   *   detalle técnico). Sin ser admin, RLS no devuelve nada. Con false se lee la vista pública.
   */
  getAll(includeDrafts = false): Observable<ReleaseModel[]> {
    if (this.supabase.shouldUseMockData()) {
      const items = includeDrafts
        ? this.mockReleases
        : this.mockReleases
            .filter((r) => r.isPublished && r.userSummary?.trim())
            .map((r) => ({ ...r, summary: '', changes: [] }));
      return of(
        [...items].sort((a, b) => +b.releasedAt - +a.releasedAt || b.id - a.id),
      );
    }

    // El `id` desempata: dos versiones publicadas el mismo día quedarían en
    // orden arbitrario ordenando solo por fecha, y en un historial eso se nota.
    if (!includeDrafts) {
      return from(
        this.supabase.db
          .from('releases_public')
          .select('id, version, released_at, title, user_summary')
          .order('released_at', { ascending: false })
          .order('id', { ascending: false }),
      ).pipe(map((res) => unwrap(res).map(toPublicRelease)));
    }

    return from(
      this.supabase.db
        .from('releases')
        .select('*')
        .order('released_at', { ascending: false })
        .order('id', { ascending: false }),
    ).pipe(map((res) => unwrap(res).map(toRelease)));
  }

  getByVersion(version: string): Observable<ReleaseModel | null> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.mockReleases.find((r) => r.version === version) ?? null);
    }

    return from(
      this.supabase.db.from('releases').select('*').eq('version', version).maybeSingle(),
    ).pipe(map((res) => (unwrap(res) ? toRelease(unwrap(res) as ReleaseRow) : null)));
  }

  create(draft: ReleaseDraft): Observable<ReleaseModel> {
    if (this.supabase.shouldUseMockData()) {
      const created: ReleaseModel = {
        ...draft,
        id: Math.max(0, ...this.mockReleases.map((r) => r.id)) + 1,
        releasedAt: new Date(`${draft.releasedAt}T12:00:00Z`),
      };
      this.mockReleases = [created, ...this.mockReleases];
      return of(created);
    }

    return from(
      this.supabase.db
        .from('releases')
        .insert({
          version: draft.version.trim(),
          released_at: draft.releasedAt,
          title: draft.title.trim(),
          summary: draft.summary.trim(),
          user_summary: draft.userSummary?.trim() || null,
          changes: draft.changes,
          is_published: draft.isPublished,
        })
        .select('*')
        .single(),
    ).pipe(map((res) => toRelease(unwrap(res))));
  }

  update(id: number, draft: ReleaseDraft): Observable<ReleaseModel> {
    if (this.supabase.shouldUseMockData()) {
      const updated: ReleaseModel = {
        ...draft,
        id,
        releasedAt: new Date(`${draft.releasedAt}T12:00:00Z`),
      };
      this.mockReleases = this.mockReleases.map((r) => (r.id === id ? updated : r));
      return of(updated);
    }

    return from(
      this.supabase.db
        .from('releases')
        .update({
          version: draft.version.trim(),
          released_at: draft.releasedAt,
          title: draft.title.trim(),
          summary: draft.summary.trim(),
          user_summary: draft.userSummary?.trim() || null,
          changes: draft.changes,
          is_published: draft.isPublished,
        })
        .eq('id', id)
        .select('*')
        .single(),
    ).pipe(map((res) => toRelease(unwrap(res))));
  }

  remove(id: number): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.mockReleases = this.mockReleases.filter((r) => r.id !== id);
      return of(undefined);
    }

    return from(this.supabase.db.from('releases').delete().eq('id', id)).pipe(
      map((res) => {
        unwrap(res);
      }),
    );
  }
}
