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
