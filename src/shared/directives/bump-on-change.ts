import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/**
 * Hace "latir" el elemento cada vez que cambia el valor (el número del carrito, por ejemplo).
 * La primera lectura no anima: solo los cambios. Sin movimiento si el sistema pide reducirlo
 * o si el navegador no tiene `Element.animate` (jsdom).
 */
@Directive({ selector: '[xahBump]' })
export class BumpOnChange {
  readonly value = input<unknown>(undefined, { alias: 'xahBump' });
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private first = true;

  constructor() {
    effect(() => {
      this.value();
      if (this.first) {
        this.first = false;
        return;
      }
      const node = this.el.nativeElement;
      if (typeof node.animate !== 'function') return;
      if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      node.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.3)', offset: 0.4 }, { transform: 'scale(1)' }],
        { duration: 360, easing: 'ease-out' },
      );
    });
  }
}
