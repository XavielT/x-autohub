import { ReviewModel } from '../models/review.model';

/**
 * Reseñas de demostración para el modo simulado (sin credenciales de Supabase).
 *
 * Son de mentira y solo existen en desarrollo: la base real arranca sin ninguna. Hay
 * unas pocas en el producto 1 y en el servicio 1 para que el bloque tenga algo que
 * enseñar (promedio, distribución, la etiqueta de compra verificada), y el resto de
 * productos y servicios sale sin reseñas, que es el caso real de hoy.
 */
export const REVIEWS_MOCK: ReviewModel[] = [
  {
    id: 1,
    target: 'product',
    targetId: 1,
    userId: 'demo-user-1',
    authorName: 'Cliente de ejemplo',
    rating: 5,
    comment: 'Llegó rápido y quedó perfecto. (Reseña de demostración)',
    isVerifiedPurchase: true,
    createdAt: new Date('2026-09-12T15:00:00Z'),
  },
  {
    id: 2,
    target: 'product',
    targetId: 1,
    userId: 'demo-user-2',
    authorName: 'Otra persona de ejemplo',
    rating: 4,
    comment: 'Buena calidad por el precio. (Reseña de demostración)',
    isVerifiedPurchase: true,
    createdAt: new Date('2026-09-20T15:00:00Z'),
  },
  {
    id: 3,
    target: 'product',
    targetId: 1,
    userId: 'demo-user-3',
    authorName: 'Tercera persona de ejemplo',
    rating: 3,
    comment: 'Cumple, aunque esperaba otro acabado. (Reseña de demostración)',
    isVerifiedPurchase: false,
    createdAt: new Date('2026-10-01T15:00:00Z'),
  },
  {
    id: 4,
    target: 'service',
    targetId: 1,
    userId: 'demo-user-1',
    authorName: 'Cliente de ejemplo',
    rating: 5,
    comment: 'Me instalaron todo en una hora. (Reseña de demostración)',
    isVerifiedPurchase: true,
    createdAt: new Date('2026-10-05T15:00:00Z'),
  },
];
