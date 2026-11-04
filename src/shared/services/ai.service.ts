import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { AiOverviewPayload } from '../../core/supabase/database.types';
import { unwrap } from '../../core/supabase/supabase-error';
import { AI_UNAVAILABLE, AiOutcome, AiOverview, AiTier } from '../models/ai.model';

/**
 * El único punto del front que habla con la IA (Edge Functions de `supabase/functions/ai-*`).
 *
 * Ninguna clave pasa por aquí: Anthropic y Google se llaman solo desde las edges, que comprueban el rol, el interruptor
 * de cada función y el tope mensual. Este servicio solo manda la petición y **nunca bloquea un flujo**: si la IA no está
 * (modo simulado, función apagada, tope alcanzado, red caída, respuesta rota) devuelve `ia_no_disponible` y quien llama
 * sigue por el camino de siempre. Los componentes no llaman a las edges directamente.
 */
@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly supabase = inject(SupabaseService);

  /** Llama a una Edge Function de IA. No falla nunca. En modo simulado, la IA "no está disponible". */
  call<T>(fn: string, body: Record<string, unknown>): Observable<AiOutcome<T>> {
    if (this.supabase.shouldUseMockData()) return of(AI_UNAVAILABLE);

    return from(this.supabase.db.functions.invoke(fn, { body })).pipe(
      map(({ data, error }): AiOutcome<T> => {
        if (error) {
          console.warn(`[${fn}] la IA no respondió`, error);
          return AI_UNAVAILABLE;
        }
        const reply = data as { ok?: boolean; data?: T } | null;
        return reply?.ok === true ? { ok: true, data: (reply.data ?? reply) as T } : AI_UNAVAILABLE;
      }),
      catchError((error) => {
        console.warn(`[${fn}] la IA no respondió`, error);
        return of(AI_UNAVAILABLE);
      }),
    );
  }

  /** Presupuesto, gasto por función y por día, y últimos errores (solo admin). */
  getOverview(): Observable<AiOverview> {
    if (this.supabase.shouldUseMockData()) return of(EMPTY_OVERVIEW);
    return from(this.supabase.db.rpc('ai_admin_overview')).pipe(map((res) => toOverview(unwrap(res))));
  }
}

const EMPTY_OVERVIEW: AiOverview = {
  budget: { spentUsd: 0, capUsd: 25, pct: 0, tier: 'ok', publicSpentUsd: 0, publicOk: true },
  maps: { spentUsd: 0, capUsd: 10, pct: 0, tier: 'ok' },
  byFeature: [],
  byDay: [],
  errors: [],
};

const TIERS: readonly AiTier[] = ['ok', 'aviso', 'sin_publico', 'apagado'];
const toTier = (value: string): AiTier => ((TIERS as readonly string[]).includes(value) ? (value as AiTier) : 'apagado');

export function toOverview(p: AiOverviewPayload): AiOverview {
  return {
    budget: {
      spentUsd: Number(p.budget.spent_usd),
      capUsd: Number(p.budget.cap_usd),
      pct: Number(p.budget.pct),
      tier: toTier(p.budget.tier),
      publicSpentUsd: Number(p.budget.public_spent_usd),
      publicOk: p.budget.public_ok,
    },
    maps: {
      spentUsd: Number(p.maps.spent_usd),
      capUsd: Number(p.maps.cap_usd),
      pct: Number(p.maps.pct),
      tier: toTier(p.maps.tier),
    },
    byFeature: p.by_feature.map((f) => ({ feature: f.feature, calls: f.calls, errors: f.errors, costUsd: Number(f.cost_usd) })),
    byDay: p.by_day.map((d) => ({ day: d.day, calls: d.calls, costUsd: Number(d.cost_usd) })),
    errors: p.errors.map((e) => ({ feature: e.feature, errorCode: e.error_code ?? 'sin código', createdAt: e.created_at })),
  };
}
