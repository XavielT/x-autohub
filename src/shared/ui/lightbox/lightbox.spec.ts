import { TestBed } from '@angular/core/testing';
import { Lightbox } from './lightbox';

describe('Lightbox', () => {
  function montar(open = true, index = 0) {
    const fixture = TestBed.createComponent(Lightbox);
    fixture.componentRef.setInput('images', ['a.jpg', 'b.jpg', 'c.jpg']);
    fixture.componentRef.setInput('open', open);
    fixture.componentRef.setInput('index', index);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }
  const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));

  it('cerrado no pinta nada', () => {
    expect(montar(false).el.querySelector('.lb')).toBeNull();
  });

  it('abierto muestra la foto y el contador "2 / 3"', () => {
    const { el } = montar(true, 1);
    expect(el.querySelector('.lb__img')?.getAttribute('src')).toBe('b.jpg');
    expect(el.querySelector('.lb__count')?.textContent?.trim()).toBe('2 / 3');
  });

  it('las flechas del teclado recorren las fotos y dan la vuelta', () => {
    const { fixture, c } = montar(true, 0);
    key('ArrowLeft');
    expect(c.index()).toBe(2);
    key('ArrowRight');
    key('ArrowRight');
    fixture.detectChanges();
    expect(c.index()).toBe(1);
  });

  it('Escape, la x y tocar fuera cierran', () => {
    const { fixture, c, el } = montar();
    key('Escape');
    expect(c.open()).toBe(false);

    c.open.set(true);
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.lb__close')!.click();
    expect(c.open()).toBe(false);

    c.open.set(true);
    fixture.detectChanges();
    el.querySelector<HTMLElement>('.lb')!.click();
    expect(c.open()).toBe(false);
  });

  it('tocar la imagen no cierra', () => {
    const { c, el } = montar();
    el.querySelector<HTMLElement>('.lb__img')!.click();
    expect(c.open()).toBe(true);
  });

  it('deslizar a la izquierda avanza, a la derecha retrocede, y un toque corto no hace nada', () => {
    const { c } = montar(true, 1);
    const swipe = (from: number, to: number) => {
      c.onPointerDown({ clientX: from } as PointerEvent);
      c.onPointerUp({ clientX: to } as PointerEvent);
    };
    swipe(200, 100);
    expect(c.index()).toBe(2);
    swipe(100, 200);
    expect(c.index()).toBe(1);
    swipe(100, 120);
    expect(c.index()).toBe(1);
  });

  it('con una sola foto no hay flechas ni contador', () => {
    const fixture = TestBed.createComponent(Lightbox);
    fixture.componentRef.setInput('images', ['solo.jpg']);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.lb__nav')).toBeNull();
    expect(el.querySelector('.lb__count')).toBeNull();
  });

  it('las teclas no hacen nada con el visor cerrado', () => {
    const { c } = montar(false, 0);
    key('ArrowRight');
    expect(c.index()).toBe(0);
  });
});
