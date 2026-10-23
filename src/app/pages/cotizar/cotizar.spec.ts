import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { Cotizar, MAX_PHOTOS } from './cotizar';
import { ServiceCatalogService } from '../../../shared/services/service-catalog.service';
import { VehicleService } from '../../../shared/services/vehicle.service';
import { VehiclePickerService } from '../../../shared/services/vehicle-picker.service';
import { ToastService } from '../../../shared/services/toast.service';
import { AuthService } from '../../../shared/services/auth.service';
import { SERVICES_MOCK } from '../../../shared/data/service.mock';

describe('Cotizar (/servicios/cotizar)', () => {
  const toast = { show: vi.fn() };
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  const picker = { open: vi.fn() };

  function montar(options: { service?: string; picked?: string | null; user?: { phone?: string } | null } = {}) {
    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(options.service ? { service: options.service } : {})) } },
        { provide: ServiceCatalogService, useValue: { getServices: () => of(SERVICES_MOCK) } },
        { provide: VehicleService, useValue: { selectedLabel: signal(options.picked ?? null) } },
        { provide: VehiclePickerService, useValue: picker },
        { provide: AuthService, useValue: { user: signal(options.user ?? null) } },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(Cotizar);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    toast.show.mockReset();
    open.mockClear();
    picker.open.mockReset();
  });

  it('el servicio de la dirección (?service=) viene elegido', () => {
    const { c } = montar({ service: 'frenos' });

    expect(c.service()?.title).toBe('Frenos');
    expect(c.message()).toContain('quiero cotizar: Frenos.');
  });

  it('con un vehículo ya elegido en "Mi vehículo" lo ofrece como punto de partida', () => {
    expect(montar({ picked: 'Toyota Corolla 2015' }).c.vehicle()).toBe('Toyota Corolla 2015');
  });

  it('no pisa lo que la persona ya escribió', () => {
    const { c } = montar();
    c.vehicle.set('Mi propio carro');

    expect(c.vehicle()).toBe('Mi propio carro');
  });

  it('quien tiene sesión no vuelve a escribir su teléfono', () => {
    expect(montar({ user: { phone: '809-555-0134' } }).c.phone()).toBe('809-555-0134');
  });

  it('el mensaje se arma en vivo, con lo que escribe', () => {
    const { fixture, c, el } = montar();

    c.vehicle.set('Honda Civic 2018');
    c.details.set('Se prende la luz del motor');
    fixture.detectChanges();

    expect(el.querySelector('.cot__preview pre')?.textContent).toContain('Vehículo: Honda Civic 2018');
    expect(el.querySelector('.cot__preview pre')?.textContent).toContain('Qué necesito: Se prende la luz del motor');
  });

  it('sin decir qué necesita no abre WhatsApp', () => {
    const { c } = montar();

    c.send();

    expect(open).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('Cuéntanos qué le pasa a tu vehículo o qué necesitas.', 'error');
  });

  it('un teléfono que no es dominicano no pasa, pero vacío sí (es opcional)', () => {
    const { c } = montar();
    c.details.set('Algo');

    c.phone.set('12345');
    c.send();
    expect(open).not.toHaveBeenCalled();

    c.phone.set('');
    c.send();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('con todo en orden abre WhatsApp con el mensaje armado, en otra pestaña y sin opener', () => {
    const { c } = montar({ service: 'frenos' });
    c.vehicle.set('Corolla 2015');
    c.details.set('Ruido al frenar');
    c.phone.set('809-555-0134');

    c.send();

    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, features] = open.mock.calls[0] as [string, string, string];
    expect(url).toContain('wa.me/18099539782');
    expect(decodeURIComponent(url)).toContain('quiero cotizar: Frenos.');
    expect(decodeURIComponent(url)).toContain('Mi teléfono: 809-555-0134');
    expect(target).toBe('_blank');
    expect(features).toContain('noopener');
  });

  it('las fotos no se suben: solo se cuentan, con un máximo, y el formulario lo dice', () => {
    const { fixture, c, el } = montar();
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [{}, {}, {}, {}, {}], configurable: true });

    c.onPhotos({ target: input } as unknown as Event);
    fixture.detectChanges();

    expect(c.photoCount()).toBe(MAX_PHOTOS);
    expect(toast.show).toHaveBeenCalledWith(`Máximo ${MAX_PHOTOS} fotos. Mándalas por WhatsApp.`, 'error');
    expect(c.message()).toContain('Te mando 3 fotos');
    expect(el.querySelector('#cot-photos-note')?.textContent).toContain('Las fotos no se suben aquí');
  });

  it('dice que no guarda nada', () => {
    expect(montar().el.textContent).toContain('No guardamos lo que escribes aquí');
  });

  it('puede abrir el selector de vehículo', () => {
    montar().c.pickVehicle();

    expect(picker.open).toHaveBeenCalled();
  });
});
