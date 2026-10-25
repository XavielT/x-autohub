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


/** El contenido de una etiqueta <meta> del documento, o null si no está. */
function meta(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute('content') ?? null;
}

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

  it('pone el titulo, la descripcion y la vista previa de la publicacion', async () => {
    const { fixture } = montar();
    await fixture.whenStable();

    expect(document.title).toBe('Toyota Supra MK4 | Hub Market — X AutoHub');
    expect(meta('meta[property="og:url"]')).toBe('https://xautohubrd.com/car-details/101');
    expect(meta('meta[property="og:image"]')).toBe('https://xautohubrd.com/assets/imgs/supra-white.webp');
    expect(meta('meta[name="description"]')).toContain('RD$ 130,000');
  });

  it('una publicacion de prueba no se anuncia', async () => {
    const { fixture } = montar({ ...VEHICULO, isTest: true });
    await fixture.whenStable();

    expect(document.title).toBe('Publicación no encontrada | X AutoHub');
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

  it('una publicacion vendida avisa que se vendio, sin WhatsApp ni JSON-LD, y la ficha sigue abierta', async () => {
    const { fixture } = montar({ ...VEHICULO, soldAt: '2026-10-01T00:00:00Z' });
    await fixture.whenStable();

    const pantalla = fixture.nativeElement as HTMLElement;
    expect(pantalla.querySelector('app-publication-notice')?.textContent).toContain('ya se vendió');
    expect(pantalla.textContent).toContain('Toyota Supra MK4');
    expect(boton(fixture)).toBeNull();
    expect(document.head.querySelector('script[data-ld="listing"]')).toBeNull();
  });

  it('una publicacion vendida o vencida no se indexa; una a la venta si', async () => {
    const vendida = montar({ ...VEHICULO, soldAt: '2026-10-01T00:00:00Z' });
    await vendida.fixture.whenStable();
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    vendida.fixture.destroy();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();

    TestBed.resetTestingModule();
    const viva = montar();
    await viva.fixture.whenStable();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('una publicacion vencida avisa que venció', async () => {
    const { fixture } = montar({ ...VEHICULO, expiresAt: '2020-01-01T00:00:00Z' });
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('app-publication-notice')?.textContent).toContain('venció');
  });

  it('una publicacion a la venta no lleva aviso', async () => {
    const { fixture } = montar();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('app-publication-notice')).toBeNull();
  });

  it('sin telefono no hay boton, y el vendedor se sigue viendo', async () => {
    const { fixture, componente } = montar({ ...VEHICULO, contactPhone: undefined });
    await fixture.whenStable();

    expect(componente.waLink()).toBe('');
    expect(boton(fixture)).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Juan M.');
  });
});
