import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { toReview, toSocialComment, toSocialPost } from '../../core/supabase/mappers';
import { AiModerationRow } from '../../core/supabase/database.types';
import { AiModerationService, RISK_ORDER, toSuggestion } from './ai-moderation.service';

describe('AiModerationService (migración 0053)', () => {
  let service: AiModerationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AiModerationService);
  });

  it('en modo simulado no hay sugerencias ni contenido oculto', async () => {
    expect(await firstValueFrom(service.getForItems([1, 2]))).toEqual({});
    expect(await firstValueFrom(service.getHidden())).toEqual([]);
  });

  it('toSuggestion convierte la fila (confianza numérica, categorías y contexto de precio)', () => {
    const s = toSuggestion({
      target_type: 'hub_market_item', target_id: 9, risk: 'medio', categories: ['precio_sospechoso'], reasons: 'Precio muy bajo.',
      suggested: 'revisar', confidence: '0.80' as unknown as number, price_context: { median: 1000, outlier: true, direction: 'muy_bajo' },
    } as Pick<AiModerationRow, 'target_type' | 'target_id' | 'risk' | 'categories' | 'reasons' | 'suggested' | 'confidence' | 'price_context'>);

    expect(s.confidence).toBe(0.8);
    expect(s.priceContext?.direction).toBe('muy_bajo');
    expect(s.categories).toEqual(['precio_sospechoso']);
  });

  it('el riesgo alto va antes que el medio y el medio antes que el bajo', () => {
    expect(RISK_ORDER.alto).toBeLessThan(RISK_ORDER.medio);
    expect(RISK_ORDER.medio).toBeLessThan(RISK_ORDER.bajo);
  });
});

describe('contenido "en revisión" (migración 0053)', () => {
  it('una publicación, un comentario y una reseña ocultos por la IA llegan marcados', () => {
    const post = toSocialPost({ id: 1, author_id: 'u', author_name: 'A', author_club: null, text: 't', image_url: null, media: [], tags: [], likes: 0, comments: 0, created_at: '2026-11-03T00:00:00Z', hidden_by_ai: true });
    const comment = toSocialComment({ id: 1, post_id: 1, author_id: 'u', text: 't', created_at: '2026-11-03T00:00:00Z', hidden_by_ai: true });
    const review = toReview({ id: 1, target_type: 'product', target_id: 1, user_id: 'u', rating: 1, comment: 'c', is_verified_purchase: false, created_at: '2026-11-03T00:00:00Z', hidden_by_ai: true });

    expect([post.inReview, comment.inReview, review.inReview]).toEqual([true, true, true]);
  });

  it('lo normal no se marca', () => {
    const review = toReview({ id: 1, target_type: 'product', target_id: 1, user_id: 'u', rating: 5, comment: 'c', is_verified_purchase: true, created_at: '2026-11-03T00:00:00Z' });

    expect(review.inReview).toBe(false);
  });
});
