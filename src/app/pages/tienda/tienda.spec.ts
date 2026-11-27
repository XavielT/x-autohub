import { TestBed } from '@angular/core/testing';

import { Tienda } from './tienda';

describe('Tienda', () => {
  it('Escape cierra la hoja de filtros del teléfono', async () => {
    const fixture = TestBed.createComponent(Tienda);
    fixture.detectChanges();
    await fixture.whenStable();
    const c = fixture.componentInstance;

    c.openFilters();
    expect(c.filtersOpen()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(c.filtersOpen()).toBe(false);
  });

  it('pone su canónica y su título propios', async () => {
    const fixture = TestBed.createComponent(Tienda);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://xautohubrd.com/tienda');
    expect(document.title).toContain('Tienda');
  });
});
