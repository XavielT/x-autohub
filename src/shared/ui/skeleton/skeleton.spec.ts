import { TestBed } from '@angular/core/testing';
import { Skeleton, SkeletonVariant } from './skeleton';

describe('Skeleton', () => {
  function montar(variant: SkeletonVariant, count = 1) {
    const fixture = TestBed.createComponent(Skeleton);
    fixture.componentRef.setInput('variant', variant);
    fixture.componentRef.setInput('count', count);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('cada variante pinta su silueta', () => {
    const clases: Record<SkeletonVariant, string> = {
      'product-card': '.sk__img--square',
      'vehicle-card': '.sk__cols',
      'service-card': '.sk__btn',
      row: '.sk__thumb',
      detail: '.sk__img--tall',
      'profile-header': '.sk__avatar',
      post: '.sk__dot',
    };
    for (const [variant, selector] of Object.entries(clases)) {
      expect(montar(variant as SkeletonVariant).querySelector(selector), variant).not.toBeNull();
    }
  });

  it('count repite la forma', () => {
    expect(montar('vehicle-card', 6).querySelectorAll('.sk__card').length).toBe(6);
  });

  it('avisa a los lectores de pantalla y marca el host como estado ocupado', () => {
    const el = montar('row');
    expect(el.querySelector('.sk__sr')?.textContent).toBe('Cargando…');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-busy')).toBe('true');
  });

  it('el contenido visual queda oculto para el lector de pantalla', () => {
    expect(montar('product-card').querySelector('.sk__card')?.getAttribute('aria-hidden')).toBe('true');
  });
});
