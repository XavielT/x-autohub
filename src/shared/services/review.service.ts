import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toReview, toReviewStats } from '../../core/supabase/mappers';
import { translateDbError, unwrap } from '../../core/supabase/supabase-error';
import { EMPTY_REVIEW_STATS, REVIEWS_PAGE_SIZE, REVIEW_COMMENT_MAX, ReviewModel, ReviewStats, ReviewTarget } from '../models/review.model';
import { REVIEWS_MOCK } from '../data/review.mock';
import { AuthService } from './auth.service';

/**
 * El texto de un `select` de supabase-js tiene que ser **una sola cadena literal**
 * (ver CLAUDE.md): el tipo de la fila sale de leerlo.
 */
const REVIEW_COLUMNS =
  'id, target_type, target_id, user_id, rating, comment, is_verified_purchase, created_at, profiles(display_name)';

const ALREADY_REVIEWED = 'Ya escribiste una reseña de esto. Si quieres cambiarla, bórrala y escribe otra.';

/**
 * Reseñas de productos y servicios.
 *
 * **Lo que vale lo decide Postgres.** La etiqueta de compra verificada la calcula la
 * base al insertar (un pedido entregado con ese producto, o una cita hecha con ese
 * servicio); desde aquí no se manda ni se puede pedir. Tampoco hay forma de editar una
 * reseña: se borra y se escribe otra.
 *
 * El modo simulado espeja las reglas de forma visible (una reseña por persona y
 * objetivo, de 1 a 5, comentario de hasta 1000) pero **no puede verificar compras**:
 * ninguna reseña nueva sale con la etiqueta.
 */
@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private mock: ReviewModel[] = REVIEWS_MOCK.map((r) => ({ ...r }));
  private mockSeq = 1000;

  /** Promedio y distribución 5→1. */
  getStats(target: ReviewTarget, targetId: number): Observable<ReviewStats> {
    if (this.supabase.shouldUseMockData()) {
      return of(statsOf(this.mock.filter((r) => r.target === target && r.targetId === targetId)));
    }

    return from(this.supabase.db.rpc('review_stats', { p_target_type: target, p_target_id: targetId })).pipe(
      map((res) => {
        const row = unwrap(res)[0];
        return row ? toReviewStats(row) : EMPTY_REVIEW_STATS;
      }),
    );
  }

  /** Una página de reseñas: las verificadas primero y, dentro de cada grupo, las más nuevas. */
  getReviews(
    target: ReviewTarget,
    targetId: number,
    offset = 0,
    limit = REVIEWS_PAGE_SIZE,
  ): Observable<ReviewModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(
        this.mock
          .filter((r) => r.target === target && r.targetId === targetId)
          .sort(byVerifiedThenNewest)
          .slice(offset, offset + limit),
      );
    }

    return from(
      this.supabase.db
        .from('reviews')
        .select(REVIEW_COLUMNS)
        .eq('target_type', target)
        .eq('target_id', targetId)
        .order('is_verified_purchase', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1),
    ).pipe(map((res) => unwrap(res).map(toReview)));
  }

  /** La reseña de quien tiene la sesión abierta, o `null` si no escribió ninguna (o no hay sesión). */
  getMine(target: ReviewTarget, targetId: number): Observable<ReviewModel | null> {
    const userId = this.auth.user()?.id;
    if (!userId) return of(null);

    if (this.supabase.shouldUseMockData()) {
      return of(this.mock.find((r) => r.target === target && r.targetId === targetId && r.userId === userId) ?? null);
    }

    return from(
      this.supabase.db
        .from('reviews')
        .select(REVIEW_COLUMNS)
        .eq('target_type', target)
        .eq('target_id', targetId)
        .eq('user_id', userId)
        .maybeSingle(),
    ).pipe(
      map((res) => {
        if (res.error) unwrap({ data: null, error: res.error });
        return res.data ? toReview(res.data) : null;
      }),
    );
  }

  /** Escribe la reseña. Falla si ya hay una de esta persona para este objetivo. */
  create(target: ReviewTarget, targetId: number, rating: number, comment: string): Observable<ReviewModel> {
    const user = this.auth.user();
    if (!user) return throwError(() => new Error('Inicia sesión para escribir una reseña.'));

    const invalid = validateReview(rating, comment);
    if (invalid) return throwError(() => new Error(invalid));

    const text = comment.trim();

    if (this.supabase.shouldUseMockData()) {
      if (this.mock.some((r) => r.target === target && r.targetId === targetId && r.userId === user.id)) {
        return throwError(() => new Error(ALREADY_REVIEWED));
      }
      const review: ReviewModel = {
        id: ++this.mockSeq,
        target,
        targetId,
        userId: user.id,
        authorName: user.displayName?.trim() || 'Cliente',
        rating,
        comment: text,
        // El modo simulado no ve pedidos ni citas: no puede verificar nada.
        isVerifiedPurchase: false,
        createdAt: new Date(),
      };
      this.mock = [...this.mock, review];
      return of(review);
    }

    return from(
      this.supabase.db
        .from('reviews')
        .insert({ target_type: target, target_id: targetId, user_id: user.id, rating, comment: text })
        .select(REVIEW_COLUMNS)
        .single(),
    ).pipe(
      map((res) => {
        // `unwrap` traduciría el código 23505 a "Ese registro ya existe", que aquí no dice nada.
        if (res.error?.code === '23505') throw new Error(ALREADY_REVIEWED);
        if (res.error) throw new Error(translateDbError(res.error));
        return toReview(res.data);
      }),
    );
  }

  /** Borra una reseña: la propia, o cualquiera si es un admin (la base lo decide). */
  remove(reviewId: number): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      const review = this.mock.find((r) => r.id === reviewId);
      const user = this.auth.user();
      if (!review || !user || (review.userId !== user.id && !this.auth.isAdmin())) {
        return throwError(() => new Error('No tienes permiso para hacer esto.'));
      }
      this.mock = this.mock.filter((r) => r.id !== reviewId);
      return of(undefined);
    }

    return from(this.supabase.db.from('reviews').delete().eq('id', reviewId).select('id')).pipe(
      map((res) => {
        const rows = unwrap(res);
        // RLS no falla cuando no deja borrar: simplemente no toca ninguna fila.
        if (rows.length === 0) throw new Error('No tienes permiso para hacer esto.');
      }),
    );
  }
}

/** Lo que tiene que cumplir una reseña antes de mandarse. Espeja los `check` de la tabla. */
export function validateReview(rating: number, comment: string): string | null {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 'Elige de 1 a 5 estrellas.';
  if (comment.trim().length > REVIEW_COMMENT_MAX) return `El comentario no puede pasar de ${REVIEW_COMMENT_MAX} caracteres.`;
  return null;
}

/** Promedio (un decimal) y distribución de una lista de reseñas. */
export function statsOf(reviews: readonly ReviewModel[]): ReviewStats {
  if (reviews.length === 0) return EMPTY_REVIEW_STATS;

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const r of reviews) {
    distribution[r.rating as 1 | 2 | 3 | 4 | 5]++;
    sum += r.rating;
  }
  return { total: reviews.length, average: Math.round((sum / reviews.length) * 10) / 10, distribution };
}

function byVerifiedThenNewest(a: ReviewModel, b: ReviewModel): number {
  if (a.isVerifiedPurchase !== b.isVerifiedPurchase) return a.isVerifiedPurchase ? -1 : 1;
  return +b.createdAt - +a.createdAt;
}
