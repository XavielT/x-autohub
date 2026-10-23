import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Reviews } from './reviews';
import { AuthService } from '../../services/auth.service';
import { ReviewService } from '../../services/review.service';
import { ToastService } from '../../services/toast.service';
import { ReviewStats, ReviewTarget } from '../../models/review.model';
import { UserModel } from '../../models/user.model';

describe('Reviews (el bloque de reseñas)', () => {
  const toast = { show: vi.fn() };
  const user = signal<UserModel | null>(null);
  const admin = signal(false);
  const auth = { user, isLoggedIn: computed(() => user() !== null), isAdmin: admin };

  const person = (id: string, displayName = 'Ana'): UserModel => ({
    id, displayName, email: `${id}@e.com`, role: 'user', createdAt: '2026-08-15T00:00:00Z',
  });

  beforeEach(() => {
    toast.show.mockReset();
    user.set(null);
    admin.set(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  async function montar(target: ReviewTarget, targetId: number) {
    const fixture = TestBed.createComponent(Reviews);
    fixture.componentRef.setInput('target', target);
    fixture.componentRef.setInput('targetId', targetId);
    const emitted: ReviewStats[] = [];
    fixture.componentInstance.statsChange.subscribe((s) => emitted.push(s));
    await settle(fixture);
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, emitted };
  }

  async function settle(fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

  describe('leer', () => {
    it('con reseñas: promedio, total y distribución 5→1', async () => {
      const { el } = await montar('product', 1);

      expect(el.querySelector('.rv__avg')?.textContent?.trim()).toBe('4.0');
      expect(el.querySelector('.rv__count')?.textContent?.trim()).toBe('3 reseñas');
      const rows = [...el.querySelectorAll('.rv__bar-row')].map(
        (r) => `${r.querySelector('.rv__bar-label')?.textContent?.trim()}=${r.querySelector('.rv__bar-count')?.textContent?.trim()}`,
      );
      expect(rows).toEqual(['5 ★=1', '4 ★=1', '3 ★=1', '2 ★=0', '1 ★=0']);
    });

    it('la lista pone primero las verificadas, con su etiqueta', async () => {
      const { el } = await montar('product', 1);

      const items = [...el.querySelectorAll('.rv__item')];
      expect(items).toHaveLength(3);
      expect(items.map((i) => !!i.querySelector('.rv__badge'))).toEqual([true, true, false]);
      expect(text(items[0] as HTMLElement)).toContain('Compra verificada');
    });

    it('sin reseñas: lo dice, sin promedio ni lista', async () => {
      const { el } = await montar('product', 999);

      expect(text(el)).toContain('Aún no hay reseñas');
      expect(el.querySelector('.rv__avg')).toBeNull();
      expect(el.querySelector('.rv__list')).toBeNull();
    });

    it('avisa las estadísticas a la ficha (para el JSON-LD)', async () => {
      const { emitted } = await montar('product', 1);

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({ total: 3, average: 4 });
    });

    it('una sola reseña dice "1 reseña", en singular', async () => {
      const { el } = await montar('service', 1);

      expect(el.querySelector('.rv__count')?.textContent?.trim()).toBe('1 reseña');
    });

    it('pagina: 10 por vez y "Ver más reseñas" con las que faltan', async () => {
      const reviews = TestBed.inject(ReviewService);
      for (let i = 0; i < 11; i++) {
        user.set(person(`u-${i}`));
        await firstValueFrom(reviews.create('product', 3, 5, `Comentario ${i}`));
      }
      user.set(null);

      const { fixture, c, el } = await montar('product', 3);
      expect(el.querySelectorAll('.rv__item')).toHaveLength(10);
      expect(text(el.querySelector('.rv__more') as HTMLElement)).toContain('Ver más reseñas (1)');

      c.loadMore();
      await settle(fixture);

      expect(el.querySelectorAll('.rv__item')).toHaveLength(11);
      expect(el.querySelector('.rv__more')).toBeNull();
    });
  });

  describe('escribir', () => {
    it('sin sesión se lee todo, pero escribir pide iniciar sesión (y vuelve a la misma página)', async () => {
      const { el } = await montar('product', 2);

      expect(el.querySelector('.rv__form')).toBeNull();
      const link = el.querySelector<HTMLAnchorElement>('.rv__write a');
      expect(link?.textContent).toContain('Inicia sesión');
      expect(link?.getAttribute('href')).toContain('/login?returnUrl=');
    });

    it('con sesión: explica cómo se consigue la etiqueta de compra verificada', async () => {
      user.set(person('u-9'));
      const { el } = await montar('product', 2);
      expect(text(el.querySelector('.rv__hint') as HTMLElement)).toContain('compra verificada');
      expect(text(el.querySelector('.rv__hint') as HTMLElement)).toContain('producto');

      const service = await montar('service', 2);
      expect(text(service.el.querySelector('.rv__hint') as HTMLElement)).toContain('cita');
    });

    it('sin elegir estrellas no publica, y lo dice', async () => {
      user.set(person('u-9'));
      const { fixture, c, el } = await montar('product', 2);

      c.submit();
      await settle(fixture);

      expect(el.querySelector('.rv__error')?.textContent).toContain('1 a 5 estrellas');
      expect(el.querySelector('.rv__item')).toBeNull();
    });

    it('el aviso de error se va al elegir estrellas o escribir', async () => {
      user.set(person('u-9'));
      const { fixture, c, el } = await montar('product', 2);

      c.submit();
      await settle(fixture);
      expect(el.querySelector('.rv__error')).not.toBeNull();

      c.setRating(4);
      await settle(fixture);
      expect(el.querySelector('.rv__error')).toBeNull();

      c.submit();
      c.formError.set('algo');
      c.setComment({ target: { value: 'hola' } } as unknown as Event);
      await settle(fixture);
      expect(el.querySelector('.rv__error')).toBeNull();
    });

    it('publica: la reseña aparece, el formulario se cierra y se avisa con un toast', async () => {
      user.set(person('u-9', 'Luis'));
      const { fixture, c, el } = await montar('product', 2);

      c.rating.set(4);
      c.comment.set('Muy buena pieza');
      c.submit();
      await settle(fixture);

      expect(el.querySelectorAll('.rv__item')).toHaveLength(1);
      expect(text(el.querySelector('.rv__item') as HTMLElement)).toContain('Luis');
      expect(text(el.querySelector('.rv__item') as HTMLElement)).toContain('Muy buena pieza');
      expect(toast.show).toHaveBeenCalledWith('¡Gracias! Tu reseña quedó publicada.');
      expect(el.querySelector('.rv__notice')).not.toBeNull();
      expect(el.querySelector('fieldset')?.disabled).toBe(true);
    });

    it('sin compra verificada igual se puede reseñar, pero sin la etiqueta', async () => {
      user.set(person('u-9'));
      const { fixture, c, el } = await montar('product', 2);

      c.rating.set(5);
      c.submit();
      await settle(fixture);

      expect(el.querySelector('.rv__item')).not.toBeNull();
      expect(el.querySelector('.rv__badge')).toBeNull();
    });

    it('quien ya reseñó ve el formulario cerrado con la explicación', async () => {
      user.set(person('demo-user-1'));
      const { el } = await montar('product', 1);

      expect(el.querySelector('fieldset')?.disabled).toBe(true);
      expect(text(el.querySelector('.rv__notice') as HTMLElement)).toContain('Solo se permite una por persona');
      expect(el.querySelector('.rv__hint')).toBeNull();
    });
  });

  describe('borrar', () => {
    it('un usuario solo ve "Borrar" en la suya', async () => {
      user.set(person('demo-user-1'));
      const { el } = await montar('product', 1);

      const buttons = [...el.querySelectorAll('.rv__delete')];
      expect(buttons).toHaveLength(1);
      expect(buttons[0].textContent?.trim()).toBe('Borrar mi reseña');
    });

    it('el primer toque pide confirmar; el segundo borra y reabre el formulario', async () => {
      user.set(person('demo-user-1'));
      const { fixture, el } = await montar('product', 1);
      const button = () => el.querySelector<HTMLButtonElement>('.rv__delete')!;

      button().click();
      await settle(fixture);
      expect(button().textContent).toContain('¿Seguro?');
      expect(el.querySelectorAll('.rv__item')).toHaveLength(3);

      button().click();
      await settle(fixture);

      expect(el.querySelectorAll('.rv__item')).toHaveLength(2);
      expect(toast.show).toHaveBeenCalledWith('Reseña borrada.');
      expect(el.querySelector('fieldset')?.disabled).toBe(false);
    });

    it('un admin ve "Borrar (moderación)" en todas', async () => {
      user.set(person('admin-1'));
      admin.set(true);
      const { el } = await montar('product', 1);

      const buttons = [...el.querySelectorAll('.rv__delete')];
      expect(buttons).toHaveLength(3);
      expect(buttons.every((b) => b.textContent?.trim() === 'Borrar (moderación)')).toBe(true);
    });

    it('sin sesión nadie ve el botón', async () => {
      const { el } = await montar('product', 1);

      expect(el.querySelector('.rv__delete')).toBeNull();
    });
  });

  it('al cambiar de producto vuelve a cargar las reseñas del nuevo', async () => {
    const { fixture, el } = await montar('product', 1);
    expect(el.querySelectorAll('.rv__item')).toHaveLength(3);

    fixture.componentRef.setInput('targetId', 999);
    await settle(fixture);

    expect(el.querySelectorAll('.rv__item')).toHaveLength(0);
    expect(text(el)).toContain('Aún no hay reseñas');
  });
});
