import { TestBed } from '@angular/core/testing';

import { ImageGallery } from './image-gallery';

describe('ImageGallery: texto alterno por foto (migración 0057)', () => {
  function montar(altMap: Record<string, string>) {
    const fixture = TestBed.createComponent(ImageGallery);
    fixture.componentRef.setInput('images', ['a.jpg', 'b.jpg']);
    fixture.componentRef.setInput('alt', 'Pastillas Brembo');
    fixture.componentRef.setInput('altMap', altMap);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('una foto con texto alterno propio lo usa', () => {
    const { el } = montar({ 'a.jpg': 'Frente de las pastillas' });

    expect(el.querySelector('.gal__img')?.getAttribute('alt')).toBe('Frente de las pastillas');
  });

  it('una foto sin texto propio usa el nombre del producto', () => {
    const { c, fixture, el } = montar({ 'a.jpg': 'Frente de las pastillas' });
    c.select(1);
    fixture.detectChanges();

    expect(el.querySelector('.gal__img')?.getAttribute('alt')).toBe('Pastillas Brembo');
  });

  it('sin mapa, todo como antes', () => {
    expect(montar({}).el.querySelector('.gal__img')?.getAttribute('alt')).toBe('Pastillas Brembo');
  });
});
