import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AutoHubDetails } from './auto-hub-details';
import { AutoHubService } from '../../../shared/services/auto-hub.service';
import { AutoHubModel } from '../../../shared/models/auto-hub.model';

const VEHICULO: AutoHubModel = {
  id: 1,
  brand: 'Toyota',
  model: 'Corolla',
  year: 2020,
  price: 1350000,
  color: 'Blanco',
  mileage: 45000,
  chasisType: 'sedan',
  doors: 4,
  traction: 'fwd',
  fuel: 'gasoline',
  cylinders: 4,
  images: ['assets/imgs/auto-hub/corolla.jpg'],
  description: 'Vehiculo verificado por el equipo.',
  location: 'Santo Domingo',
  // Como está guardado de verdad en el mock y en el seed: solo dígitos.
  contact: '8099539782',
};


/** El contenido de una etiqueta <meta> del documento, o null si no está. */
function meta(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute('content') ?? null;
}

describe('AutoHubDetails', () => {
  function montar(auto: AutoHubModel | undefined = VEHICULO) {
    TestBed.configureTestingModule({
      providers: [{ provide: AutoHubService, useValue: { getById: vi.fn(() => of(auto)) } }],
    });

    const fixture = TestBed.createComponent(AutoHubDetails);
    return { fixture, componente: fixture.componentInstance };
  }

  it('should create', () => {
    const { componente } = montar();
    expect(componente).toBeTruthy();
  });

  it('muestra el telefono con formato, no los diez digitos pegados', async () => {
    const { fixture, componente } = montar();
    await fixture.whenStable();

    expect(componente.contactDisplay()).toBe('809-953-9782');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('809-953-9782');
  });

  it('pone el titulo, la descripcion y la vista previa del vehiculo', async () => {
    const { fixture } = montar();
    await fixture.whenStable();

    expect(document.title).toBe('Toyota Corolla 2020 | Auto Hub — X AutoHub');
    expect(meta('meta[property="og:url"]')).toBe('https://xautohubrd.com/auto-hub-details/1');
    expect(meta('meta[property="og:image"]')).toBe('https://xautohubrd.com/assets/imgs/auto-hub/corolla.jpg');
    expect(meta('meta[name="description"]')).toContain('45,000 KM');
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://xautohubrd.com/auto-hub-details/1',
    );
  });

  it('declara el vehiculo como Car en JSON-LD, y lo quita al salir', async () => {
    const { fixture } = montar();
    await fixture.whenStable();

    const ld = JSON.parse(document.head.querySelector('script[data-ld="listing"]')!.textContent!);
    expect(ld['@type']).toBe('Car');
    expect(ld.url).toBe('https://xautohubrd.com/auto-hub-details/1');

    fixture.destroy();
    expect(document.head.querySelector('script[data-ld="listing"]')).toBeNull();
  });

  it('un vehiculo de prueba no se anuncia: la pagina queda como "no encontrado"', async () => {
    const { fixture } = montar({ ...VEHICULO, isTest: true });
    await fixture.whenStable();

    expect(document.head.querySelector('script[data-ld="listing"]')).toBeNull();
    expect(document.title).toBe('Vehículo no encontrado | X AutoHub');
    expect(document.title).not.toContain('Toyota');
  });

  it('un vehiculo que no existe dice que no se encontro, y apunta al listado', async () => {
    const { fixture } = montar(null as unknown as AutoHubModel);
    await fixture.whenStable();

    expect(document.title).toBe('Vehículo no encontrado | X AutoHub');
    expect(meta('meta[property="og:url"]')).toBe('https://xautohubrd.com/auto-hub');
  });

  it('al salir de la ficha vuelve a las etiquetas del sitio', async () => {
    const { fixture } = montar();
    await fixture.whenStable();

    fixture.destroy();

    expect(document.title).toBe('X AutoHub — Todo lo que tu carro necesita');
  });

  it('el boton de WhatsApp nombra la marca y el modelo', async () => {
    const { fixture, componente } = montar();
    await fixture.whenStable();

    expect(componente.waLink()).toBe(
      'https://wa.me/18099539782?text=' +
        encodeURIComponent('Hola! Vi el Toyota Corolla en X AutoHub y me interesa.'),
    );

    const enlace = (fixture.nativeElement as HTMLElement).querySelector('a.whatsapp-btn');
    expect(enlace).not.toBeNull();
    expect(enlace!.getAttribute('href')).toBe(componente.waLink());
    expect(enlace!.getAttribute('rel')).toBe('noopener');
  });
});
