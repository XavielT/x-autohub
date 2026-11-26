import { TestBed } from '@angular/core/testing';

import { Icon, IconName } from './icon';

describe('Icon', () => {
  function montar(name: IconName, size?: number) {
    const fixture = TestBed.createComponent(Icon);
    fixture.componentRef.setInput('name', name);
    if (size) fixture.componentRef.setInput('size', size);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('dibuja un svg decorativo con los trazos del icono', () => {
    const svg = montar('wrench').querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('toma el color del texto y el tamaño pedido', () => {
    const svg = montar('plus', 28).querySelector('svg')!;
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('width')).toBe('28');
  });

  it('cada trazo es un valor de path no vacío, incluso los de círculos y rectángulos', () => {
    for (const name of ['tag', 'boxes', 'users', 'eye', 'image'] as IconName[]) {
      const paths = [...montar(name).querySelectorAll('path')];
      expect(paths.every((p) => (p.getAttribute('d') ?? '').length > 4)).toBe(true);
    }
  });
});
