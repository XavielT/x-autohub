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

  it('lleva la etiqueta "De la comunidad" sobre la imagen', () => {
    const { el } = montar();
    expect(el.querySelector('.vcard__media .vcard__badge')?.textContent?.trim()).toBe('De la comunidad');
  });

  it('la lleva cualquier tipo de publicación: vehículo, pieza o accesorio', () => {
    const categorias = new Set<string>();
    HUB_MARKET_ITEMS_MOCK.forEach((item, i) => {
      const { el } = montar(i);
      categorias.add(item.category);
      expect(el.querySelector('.vcard__badge'), `${item.category} #${item.id}`).not.toBeNull();
    });

    expect(categorias.size).toBe(3);
  });

  it('título, vendedor y precio salen en la tarjeta', () => {
    const { el } = montar();
    const item = HUB_MARKET_ITEMS_MOCK[0];

    expect(el.querySelector('.vcard__name')?.textContent).toContain(
      item.vehicleSpecs?.brand ?? item.title,
    );
    expect(el.querySelector('.vcard__meta')?.textContent).toContain(item.sellerName);
    expect(el.querySelector('.vcard__price')?.textContent).toContain('RD$');
  });

  it('una pieza o accesorio usa la variante cuadrada y sin especificaciones', () => {
    const i = HUB_MARKET_ITEMS_MOCK.findIndex((x) => x.category !== 'vehiculos');
    const { el } = montar(i);

    expect(el.querySelector('.vcard--square')).not.toBeNull();
    expect(el.querySelector('.vcard__specs')).toBeNull();
  });

  it('un vehículo enlaza a /car-details y una pieza a su ficha', () => {
    const v = HUB_MARKET_ITEMS_MOCK.findIndex((x) => x.category === 'vehiculos');
    const p = HUB_MARKET_ITEMS_MOCK.findIndex((x) => x.category === 'piezas');
    expect(montar(v).el.querySelector('a')?.getAttribute('href')).toContain('/car-details/');
    expect(montar(p).el.querySelector('a')?.getAttribute('href')).toContain('/hub-market-part-details/');
  });
});
