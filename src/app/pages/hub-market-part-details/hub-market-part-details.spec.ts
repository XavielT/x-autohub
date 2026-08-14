import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { HubMarketPartDetails } from './hub-market-part-details';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';

const PIEZA: HubMarketItemModel = {
  id: 201,
  title: 'Discos Brembo GTR',
  description: 'Set de discos ventilados.',
  images: ['assets/imgs/hub-parts/disco-brembo-gtr-2.jpg'],
  price: 600,
  location: 'Santo Domingo',
  sellerName: 'Racing Parts RD',
  contactPhone: '8295550187',
  category: 'piezas',
};

describe('HubMarketPartDetails', () => {
  function montar(part: HubMarketItemModel | undefined = PIEZA) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: HubMarketService,
          useValue: {
            getById: vi.fn(() => of(part)),
            getByCategory: vi.fn(() => of([])),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(HubMarketPartDetails);
    return { fixture, componente: fixture.componentInstance };
  }

  it('should create', () => {
    const { componente } = montar();
    expect(componente).toBeTruthy();
  });

  it('contacta por WhatsApp con el numero del vendedor', async () => {
    const { fixture, componente } = montar();
    await fixture.whenStable();

    expect(componente.waLink()).toBe(
      'https://wa.me/18295550187?text=' +
        encodeURIComponent('Hola! Vi tu publicacion "Discos Brembo GTR" en X AutoHub y me interesa.'),
    );

    const enlace = (fixture.nativeElement as HTMLElement).querySelector('a.whatsapp-btn');
    expect(enlace!.getAttribute('href')).toBe(componente.waLink());
  });

  it('ya no queda ningun mailto: el de antes abria el correo sin destinatario', async () => {
    const { fixture } = montar();
    await fixture.whenStable();

    const enlaces = (fixture.nativeElement as HTMLElement).querySelectorAll('a[href^="mailto:"]');
    expect(enlaces.length).toBe(0);
  });

  it('sin telefono no hay boton, pero el resto de la pagina sigue en pie', async () => {
    const { fixture } = montar({ ...PIEZA, contactPhone: undefined });
    await fixture.whenStable();

    const raiz = fixture.nativeElement as HTMLElement;
    expect(raiz.querySelector('a.whatsapp-btn')).toBeNull();
    expect(raiz.textContent).toContain('Racing Parts RD');
    expect(raiz.querySelector('.hub-market-part-details__market-btn')).not.toBeNull();
  });
});
