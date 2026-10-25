import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AccessoryDetails } from './accessory-details';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';

const ACCESORIO: HubMarketItemModel = {
  id: 202,
  title: 'Juego de aros 17"',
  description: 'Casi nuevos.',
  images: ['assets/imgs/aros-a.webp', 'assets/imgs/aros-b.webp'],
  price: 24000,
  location: 'Santiago',
  sellerName: 'Luis P.',
  contactPhone: '8095550199',
  category: 'accesorios',
};

describe('AccessoryDetails', () => {
  function montar(item: HubMarketItemModel | null = ACCESORIO) {
    TestBed.configureTestingModule({
      providers: [{ provide: HubMarketService, useValue: { getById: vi.fn(() => of(item ?? undefined)) } }],
    });
    const fixture = TestBed.createComponent(AccessoryDetails);
    return { fixture, pantalla: fixture.nativeElement as HTMLElement };
  }

  it('should create', () => {
    expect(montar().fixture.componentInstance).toBeTruthy();
  });

  it('muestra la ficha completa con la galeria compartida y el precio en RD$', async () => {
    const { fixture, pantalla } = montar();
    await fixture.whenStable();

    expect(pantalla.querySelector('h1')?.textContent).toContain('Juego de aros 17"');
    expect(pantalla.querySelector('app-image-gallery')).not.toBeNull();
    expect(pantalla.textContent).toContain('RD$ 24,000');
    expect(pantalla.textContent).toContain('Luis P.');
    expect(pantalla.querySelector('a.whatsapp-btn')).not.toBeNull();
    expect(pantalla.querySelector('app-publication-notice')).toBeNull();
  });

  it('una publicacion vendida avisa y quita WhatsApp, pero la ficha sigue abierta', async () => {
    const { fixture, pantalla } = montar({ ...ACCESORIO, soldAt: '2026-10-01T00:00:00Z' });
    await fixture.whenStable();

    expect(pantalla.querySelector('app-publication-notice')?.textContent).toContain('ya se vendió');
    expect(pantalla.querySelector('h1')?.textContent).toContain('Juego de aros 17"');
    expect(pantalla.querySelector('a.whatsapp-btn')).toBeNull();
  });

  it('un id que no existe dice que no se encontro el articulo', async () => {
    const { fixture, pantalla } = montar(null);
    await fixture.whenStable();

    expect(pantalla.textContent).toContain('Articulo no encontrado');
    expect(pantalla.querySelector('h1')).toBeNull();
  });
});
