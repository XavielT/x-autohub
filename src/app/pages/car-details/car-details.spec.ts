import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { CarDetails } from './car-details';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';

const VEHICULO: HubMarketItemModel = {
  id: 101,
  title: 'Toyota Supra MK4',
  description: 'Restaurada y lista.',
  images: ['assets/imgs/supra-white.webp'],
  price: 130000,
  location: 'Santo Domingo',
  sellerName: 'Juan M.',
  contactPhone: '8095550134',
  category: 'vehiculos',
  vehicleSpecs: { year: 1994, mileage: 180000 },
};

describe('CarDetails', () => {
  function montar(car: HubMarketItemModel | undefined = VEHICULO) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: HubMarketService,
          useValue: {
            getById: vi.fn(() => of(car)),
            getByCategory: vi.fn(() => of([])),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(CarDetails);
    return { fixture, componente: fixture.componentInstance };
  }

  /** El botón de WhatsApp, o null si no está en la pantalla. */
  function boton(fixture: { nativeElement: unknown }): HTMLAnchorElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('a.whatsapp-btn');
  }

  it('should create', () => {
    const { componente } = montar();
    expect(componente).toBeTruthy();
  });

  it('muestra el boton de WhatsApp cuando la publicacion trae telefono', async () => {
    const { fixture } = montar();
    await fixture.whenStable();

    const enlace = boton(fixture);
    expect(enlace).not.toBeNull();
    expect(enlace!.textContent).toContain('Contactar por WhatsApp');
    // Abre fuera de la app, y `noopener` para que la pestaña nueva no herede
    // una referencia a esta.
    expect(enlace!.getAttribute('target')).toBe('_blank');
    expect(enlace!.getAttribute('rel')).toBe('noopener');
  });

  it('arma el enlace con el numero en E.164 y el titulo en el mensaje', async () => {
    const { fixture, componente } = montar();
    await fixture.whenStable();

    expect(componente.waLink()).toBe(
      'https://wa.me/18095550134?text=' +
        encodeURIComponent('Hola! Vi tu publicacion "Toyota Supra MK4" en X AutoHub y me interesa.'),
    );
    expect(boton(fixture)!.getAttribute('href')).toBe(componente.waLink());
  });

  it('sin telefono no hay boton, y el vendedor se sigue viendo', async () => {
    const { fixture, componente } = montar({ ...VEHICULO, contactPhone: undefined });
    await fixture.whenStable();

    expect(componente.waLink()).toBe('');
    expect(boton(fixture)).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Juan M.');
  });
});
