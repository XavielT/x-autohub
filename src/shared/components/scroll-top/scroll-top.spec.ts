import { TestBed } from '@angular/core/testing';

import { ScrollTop } from './scroll-top';

describe('ScrollTop', () => {
  it('no se ve arriba y aparece al bajar mucho', async () => {
    const fixture = TestBed.createComponent(ScrollTop);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.scroll-top')).toBeNull();

    Object.defineProperty(window, 'scrollY', { value: 3000, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(el.querySelector('.scroll-top')).not.toBeNull();

    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(el.querySelector('.scroll-top')).toBeNull();
  });
});
