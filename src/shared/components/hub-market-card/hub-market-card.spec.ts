import { TestBed } from '@angular/core/testing';

import { HubMarketCard } from './hub-market-card';
import { HUB_MARKET_ITEMS_MOCK } from '../../data/hub-market-item.mock';

describe('HubMarketCard', () => {
  function montar(index = 0) {
    const fixture = TestBed.createComponent(HubMarketCard);
    fixture.componentRef.setInput('item', HUB_MARKET_ITEMS_MOCK[index]);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lleva la etiqueta "De la comunidad", tal como se escribe', () => {
    const { el } = montar();
    const badge = el.querySelector('.hub-market-card__community app-info-badge');

    expect(badge?.textContent?.trim()).toBe('De la comunidad');
    // La etiqueta flota sobre la foto, no dentro del texto de la tarjeta.
    expect(el.querySelector('.hub-market-card__top .hub-market-card__community')).not.toBeNull();
  });

  it('la lleva cualquier tipo de publicacion: vehiculo, pieza o accesorio', () => {
    const categorias = new Set<string>();
    HUB_MARKET_ITEMS_MOCK.forEach((item, i) => {
      const { el } = montar(i);
      categorias.add(item.category);
      expect(el.querySelector('app-info-badge'), `${item.category} #${item.id}`).not.toBeNull();
    });

    expect(categorias.size).toBe(3);
  });

  it('no cambia nada mas: titulo, vendedor y precio siguen igual', () => {
    const { el } = montar();
    const item = HUB_MARKET_ITEMS_MOCK[0];

    expect(el.querySelector('.hub-market-card__name')?.textContent).toContain(item.title);
    expect(el.querySelector('.hub-market-card__user')?.textContent).toContain(item.sellerName);
    expect(el.querySelector('.hub-market-card__price')?.textContent).toContain('RD$');
  });
});
