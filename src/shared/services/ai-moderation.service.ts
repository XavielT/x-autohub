import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { AiModerationRow } from '../../core/supabase/database.types';
import { unwrap } from '../../core/supabase/supabase-error';

export type ModerationTarget = 'hub_market_item' | 'social_post' | 'social_comment' | 'review';
export type ModerationRisk = 'bajo' | 'medio' | 'alto';

/** La sugerencia de la IA sobre un contenido (migración 0053). Es solo eso: la decisión es del moderador. */
export interface ModerationSuggestion {
  targetType: ModerationTarget;
  targetId: number;
  risk: ModerationRisk;
  categories: string[];
  reasons: string;
  suggested: 'aprobar' | 'revisar' | 'rechazar';
  confidence: number;
  /** Lo que calculó la base sobre el precio de una publicación de Hub Market. */
  priceContext: { median?: number; outlier?: boolean; direction?: 'muy_bajo' | 'muy_alto' | null } | null;
}

/** Contenido de la comunidad que la IA ocultó por riesgo alto. Se restaura con un toque. */
export interface HiddenContent {
  targetType: ModerationTarget;
  targetId: number;
  preview: string;
  categories: string[];
  reasons: string;
  hiddenAt: Date | null;
}

export const RISK_ORDER: Record<ModerationRisk, number> = { alto: 0, medio: 1, bajo: 2 };

export const CATEGORY_LABELS: Record<string, string> = {
  spam: 'Spam',
  estafa: 'Posible estafa',
  insultos_graves: 'Insultos graves',
  sexual_explicito: 'Contenido sexual explícito',
  pago_adelantado: 'Pide pago por adelantado',
  canal_externo: 'Saca la conversación a otro canal',
  articulo_prohibido: 'Artículo prohibido',
  foto_no_coincide: 'La foto no coincide',
  precio_sospechoso: 'Precio fuera de rango',
  duplicado: 'Repetida',
  otro: 'Otro',
};

export const TARGET_LABELS: Record<ModerationTarget, string> = {
  hub_market_item: 'Publicación',
  social_post: 'Publicación del feed',
  social_comment: 'Comentario',
  review: 'Reseña',
};

/**
 * La moderación asistida (migración 0053). La IA sugiere; "Aplicar sugerencia" solo prellena y el moderador confirma. Lo único que
 * pasa solo es ocultar contenido de la comunidad claramente dañino, y aquí se restaura con un toque. Nunca se borra nada.
 */
@Injectable({ providedIn: 'root' })
export class AiModerationService {
  private readonly supabase = inject(SupabaseService);

  /** Las sugerencias de una lista de publicaciones de Hub Market, por id. En modo simulado no hay ninguna. */
  getForItems(ids: number[]): Observable<Record<number, ModerationSuggestion>> {
    if (this.supabase.shouldUseMockData() || ids.length === 0) return of({});

    return from(
      this.supabase.db
        .from('ai_moderation')
        .select('target_type, target_id, risk, categories, reasons, suggested, confidence, price_context')
        .eq('target_type', 'hub_market_item')
        .in('target_id', ids),
    ).pipe(map((res) => Object.fromEntries(unwrap(res).map((r) => [r.target_id, toSuggestion(r)]))));
  }

  getHidden(): Observable<HiddenContent[]> {
    if (this.supabase.shouldUseMockData()) return of([]);
    return from(this.supabase.db.rpc('ai_hidden_content')).pipe(
      map((res) =>
        unwrap(res).map((r) => ({
          targetType: r.target_type as ModerationTarget,
          targetId: Number(r.target_id),
          preview: r.preview,
          categories: r.categories ?? [],
          reasons: r.reasons ?? '',
          hiddenAt: r.hidden_at ? new Date(r.hidden_at) : null,
        })),
      ),
    );
  }

  restore(type: ModerationTarget, id: number): Observable<void> {
    return from(this.supabase.db.rpc('restore_hidden_content', { p_target_type: type, p_target_id: id })).pipe(
      map((res) => {
        unwrap(res);
      }),
    );
  }
}

type SuggestionRow = Pick<AiModerationRow, 'target_type' | 'target_id' | 'risk' | 'categories' | 'reasons' | 'suggested' | 'confidence' | 'price_context'>;

export function toSuggestion(r: SuggestionRow): ModerationSuggestion {
  return {
    targetType: r.target_type,
    targetId: Number(r.target_id),
    risk: r.risk,
    categories: r.categories ?? [],
    reasons: r.reasons ?? '',
    suggested: r.suggested,
    confidence: Number(r.confidence),
    priceContext: r.price_context,
  };
}
