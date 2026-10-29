import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ReviewService, statsOf, validateReview } from './review.service';
import { AuthService } from './auth.service';
import { ReviewModel } from '../models/review.model';
import { UserModel } from '../models/user.model';

/**
 * Las reseñas por el camino simulado. Espeja las reglas de la base (una por persona y
 * objetivo, de 1 a 5, borra el autor o un admin) pero **no puede verificar compras**.
 */
describe('ReviewService (mock)', () => {
  const user = signal<UserModel | null>(null);
  const admin = signal(false);
  const USER: UserModel = { id: 'u-1', displayName: 'Ana', email: 'a@e.com', role: 'user', createdAt: '2026-08-15T00:00:00Z' };

  let service: ReviewService;

  beforeEach(() => {
    user.set(null);
    admin.set(false);
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user, isAdmin: admin } }] });
    service = TestBed.inject(ReviewService);
  });

  const errorOf = async (obs: Parameters<typeof firstValueFrom>[0]) => {
    try {
      await firstValueFrom(obs);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  describe('leer', () => {
    it('las estadísticas de un producto con reseñas: total, promedio y distribución', async () => {
      const stats = await firstValueFrom(service.getStats('product', 1));

      expect(stats.total).toBe(3);
      expect(stats.average).toBe(4); // (5 + 4 + 3) / 3
      expect(stats.distribution).toEqual({ 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 });
    });

    it('un producto sin reseñas da ceros, no un error', async () => {
      expect(await firstValueFrom(service.getStats('product', 999))).toEqual({
        total: 0,
        average: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      });
    });

    it('un producto y un servicio con el mismo id no se mezclan', async () => {
      const product = await firstValueFrom(service.getReviews('product', 1));
      const svc = await firstValueFrom(service.getReviews('service', 1));

      expect(product.every((r) => r.target === 'product')).toBe(true);
      expect(svc.every((r) => r.target === 'service')).toBe(true);
      expect(svc).toHaveLength(1);
    });

    it('las de compra verificada van primero, y dentro de cada grupo las más nuevas', async () => {
      const list = await firstValueFrom(service.getReviews('product', 1));

      expect(list.map((r) => r.id)).toEqual([2, 1, 3]); // 2 y 1 verificadas (más nueva primero), luego la 3
    });

    it('página con offset y límite', async () => {
      const first = await firstValueFrom(service.getReviews('product', 1, 0, 2));
      const rest = await firstValueFrom(service.getReviews('product', 1, 2, 2));

      expect(first.map((r) => r.id)).toEqual([2, 1]);
      expect(rest.map((r) => r.id)).toEqual([3]);
    });

    it('sin sesión no hay "mi reseña"', async () => {
      expect(await firstValueFrom(service.getMine('product', 1))).toBeNull();
    });
  });

  describe('escribir', () => {
    it('sin sesión no se escribe', async () => {
      expect(await errorOf(service.create('product', 2, 5, 'Bien'))).toBe('Inicia sesión para escribir una reseña.');
    });

    it('con sesión: queda a nombre del usuario, sin espacios sobrantes y SIN la etiqueta de compra verificada', async () => {
      user.set(USER);

      const review = await firstValueFrom(service.create('product', 2, 5, '  Excelente  '));

      expect(review).toMatchObject({ target: 'product', targetId: 2, userId: 'u-1', authorName: 'Ana', rating: 5, comment: 'Excelente' });
      // El modo simulado no ve pedidos: no puede verificar nada.
      expect(review.isVerifiedPurchase).toBe(false);
      expect((await firstValueFrom(service.getStats('product', 2))).total).toBe(1);
      expect((await firstValueFrom(service.getMine('product', 2)))?.id).toBe(review.id);
    });

    it('una sola reseña por persona y objetivo', async () => {
      user.set(USER);
      await firstValueFrom(service.create('product', 2, 5, 'Una'));

      expect(await errorOf(service.create('product', 2, 1, 'Otra'))).toContain('Ya escribiste una reseña');
      // Pero otro objetivo sí.
      expect((await firstValueFrom(service.create('service', 2, 4, ''))).targetId).toBe(2);
    });

    it('rechaza una calificación fuera de 1 a 5 y un comentario de más de 1000 caracteres', async () => {
      user.set(USER);

      expect(await errorOf(service.create('product', 2, 0, ''))).toBe('Elige de 1 a 5 estrellas.');
      expect(await errorOf(service.create('product', 2, 6, ''))).toBe('Elige de 1 a 5 estrellas.');
      expect(await errorOf(service.create('product', 2, 3.5, ''))).toBe('Elige de 1 a 5 estrellas.');
      expect(await errorOf(service.create('product', 2, 5, 'x'.repeat(1001)))).toContain('1000');
    });

    it('un comentario vacío es válido', async () => {
      user.set(USER);

      expect((await firstValueFrom(service.create('product', 2, 4, '   '))).comment).toBe('');
    });
  });

  describe('borrar', () => {
    async function writeOne(): Promise<ReviewModel> {
      user.set(USER);
      return firstValueFrom(service.create('product', 2, 5, 'Mía'));
    }

    it('el autor borra la suya', async () => {
      const mine = await writeOne();

      await firstValueFrom(service.remove(mine.id));

      expect((await firstValueFrom(service.getStats('product', 2))).total).toBe(0);
      expect(await firstValueFrom(service.getMine('product', 2))).toBeNull();
    });

    it('otro usuario no borra la ajena', async () => {
      const mine = await writeOne();
      user.set({ ...USER, id: 'u-2' });

      expect(await errorOf(service.remove(mine.id))).toBe('No tienes permiso para hacer esto.');
      expect((await firstValueFrom(service.getStats('product', 2))).total).toBe(1);
    });

    it('un admin borra cualquiera (moderación)', async () => {
      const mine = await writeOne();
      user.set({ ...USER, id: 'admin-1' });
      admin.set(true);

      await firstValueFrom(service.remove(mine.id));

      expect((await firstValueFrom(service.getStats('product', 2))).total).toBe(0);
    });

    it('sin sesión no se borra nada', async () => {
      expect(await errorOf(service.remove(1))).toBe('No tienes permiso para hacer esto.');
    });

    it('al borrar la propia, se puede escribir otra', async () => {
      const mine = await writeOne();
      await firstValueFrom(service.remove(mine.id));

      expect((await firstValueFrom(service.create('product', 2, 3, 'Otra'))).rating).toBe(3);
    });
  });

  describe('validateReview y statsOf', () => {
    it('validateReview acepta 1..5 con comentario corto', () => {
      expect(validateReview(1, '')).toBeNull();
      expect(validateReview(5, 'x'.repeat(1000))).toBeNull();
    });

    it('statsOf redondea el promedio a un decimal', () => {
      const r = (rating: number): ReviewModel => ({ id: 1, target: 'product', targetId: 1, userId: 'u', authorName: 'a', rating, comment: '', isVerifiedPurchase: false, createdAt: new Date() });

      expect(statsOf([r(5), r(4), r(4)]).average).toBe(4.3);
      expect(statsOf([]).total).toBe(0);
    });
  });
});
