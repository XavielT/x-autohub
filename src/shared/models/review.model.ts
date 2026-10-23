/**
 * Reseñas de productos y servicios (pivote, fase 7; migración 0020).
 */

/** A qué se refiere una reseña. */
export type ReviewTarget = 'product' | 'service';

export interface ReviewModel {
  id: number;
  target: ReviewTarget;
  targetId: number;
  userId: string;
  /** Quién la escribió. Un perfil sin nombre sale como "Cliente". */
  authorName: string;
  /** De 1 a 5. */
  rating: number;
  comment: string;
  /**
   * Postgres la calcula al insertar: un pedido entregado con ese producto, o una cita
   * hecha con ese servicio. Quien escribe la reseña no la puede pedir.
   */
  isVerifiedPurchase: boolean;
  createdAt: Date;
}

/** Promedio y cuántas reseñas hay de cada estrella (`distribution[5]` = las de 5). */
export interface ReviewStats {
  total: number;
  /** Un decimal. 0 cuando no hay reseñas. */
  average: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export const EMPTY_REVIEW_STATS: ReviewStats = {
  total: 0,
  average: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

/** Cuántas reseñas se piden por página. */
export const REVIEWS_PAGE_SIZE = 10;

/** Lo máximo que cabe en un comentario (el `check` de la tabla). */
export const REVIEW_COMMENT_MAX = 1000;
