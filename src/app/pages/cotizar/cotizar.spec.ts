import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { Cotizar, MAX_PHOTOS } from './cotizar';
import { ServiceCatalogService } from '../../../shared/services/service-catalog.service';
import { QuoteService } from '../../../shared/services/quote.service';
import { VehicleService } from '../../../shared/services/vehicle.service';
import { VehiclePickerService } from '../../../shared/services/vehicle-picker.service';
import { ToastService } from '../../../shared/services/toast.service';
import { AuthService } from '../../../shared/services/auth.service';
import { SERVICES_MOCK } from '../../../shared/data/service.mock';

describe('Cotizar (/servicios/cotizar)', () => {
  const toast = { show: vi.fn() };
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  const picker = { open: vi.fn() };
  const create = vi.fn();

  function montar(options: { service?: string; picked?: string | null; user?: { phone?: string; displayName?: string } | null } = {}) {
    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(options.service ? { service: options.service } : {})) } },
        { provide: ServiceCatalogService, useValue: { getServices: () => of(SERVICES_MOCK) } },
        { provide: VehicleService, useValue: { selectedLabel: signal(options.picked ?? null), selected: signal(null), garage: signal([]) } },
        { provide: VehiclePickerService, useValue: picker },
        { provide: AuthService, useValue: { user: signal(options.user ?? null) } },
        { provide: ToastService, useValue: toast },
        { provide: QuoteService, useValue: { create } },
      ],
    });
    const fixture = TestBed.createComponent(Cotizar);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  function llenar(c: Cotizar, extra: { phone?: string; details?: string; name?: string } = {}) {
    c.name.set(extra.name ?? 'Maria Perez');
    c.details.set(extra.details ?? 'Ruido al frenar');
    c.phone.set(extra.phone ?? '809-555-0134');
  }

  beforeEach(() => {
    toast.show.mockReset();
    open.mockClear();
    picker.open.mockReset();
    create.mockReset();
    create.mockReturnValue(of({ id: 'q1', code: 'XAH-C-0007' }));
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

  it('quien tiene sesión no vuelve a escribir su nombre ni su teléfono', () => {
    const { c } = montar({ user: { phone: '809-555-0134', displayName: 'Ana' } });

    expect(c.phone()).toBe('809-555-0134');
    expect(c.name()).toBe('Ana');
  });

  it('el mensaje se arma en vivo, con lo que escribe', () => {
    const { c } = montar();

    c.vehicle.set('Honda Civic 2018');
    c.details.set('Se prende la luz del motor');

    expect(c.message()).toContain('Vehículo: Honda Civic 2018');
    expect(c.message()).toContain('Qué necesito: Se prende la luz del motor');
  });

  it('sin nombre, sin qué necesita o sin un teléfono válido no se guarda nada', () => {
    const { c } = montar();

    c.send();
    expect(toast.show).toHaveBeenLastCalledWith('Escribe tu nombre.', 'error');

    c.name.set('Maria');
    c.send();
    expect(toast.show).toHaveBeenLastCalledWith('Cuéntanos qué le pasa a tu vehículo o qué necesitas.', 'error');

    c.details.set('Ruido al frenar');
    c.phone.set('12345');
    c.send();
    expect(toast.show).toHaveBeenLastCalledWith('Revisa el teléfono: tiene que ser un número dominicano.', 'error');
    expect(create).not.toHaveBeenCalled();
  });

  it('el teléfono ahora es obligatorio', () => {
    const { c } = montar();
    llenar(c, { phone: '' });

    c.send();

    expect(create).not.toHaveBeenCalled();
  });

  it('con todo en orden guarda la solicitud (con el servicio, las fotos y el honeypot) y muestra el código', () => {
    const { fixture, c, el } = montar({ service: 'frenos' });
    llenar(c);
    c.vehicle.set('Corolla 2015');

    c.send();
    fixture.detectChanges();

    expect(create).toHaveBeenCalledTimes(1);
    const sent = create.mock.calls[0][0];
    expect(sent).toMatchObject({ name: 'Maria Perez', phone: '809-555-0134', description: 'Ruido al frenar', vehicleText: 'Corolla 2015', website: '' });
    expect(sent.serviceId).toBe(SERVICES_MOCK.find((s) => s.slug === 'frenos')?.id);
    expect(c.sent()?.code).toBe('XAH-C-0007');
    expect(el.querySelector('[data-test="code"]')?.textContent).toContain('XAH-C-0007');
  });

  it('un honeypot lleno viaja tal cual (la base decide: no guarda nada)', () => {
    const { c } = montar();
    llenar(c);
    c.website.set('http://spam.example');

    c.send();

    expect(create.mock.calls[0][0].website).toBe('http://spam.example');
  });

  it('no abre WhatsApp solo: se abre con el botón, con el código en el mensaje, en otra pestaña y sin opener', () => {
    const { c } = montar({ service: 'frenos' });
    llenar(c);
    c.send();
    expect(open).not.toHaveBeenCalled();

    c.openWhatsApp();

    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, features] = open.mock.calls[0] as [string, string, string];
    expect(url).toContain('wa.me/18099539782');
    expect(decodeURIComponent(url)).toContain('Solicitud: XAH-C-0007');
    expect(decodeURIComponent(url)).toContain('quiero cotizar: Frenos.');
    expect(target).toBe('_blank');
    expect(features).toContain('noopener');
  });

  it('si no se pudo guardar lo dice y se queda en el formulario (no pierde lo escrito)', () => {
    create.mockReturnValue(throwError(() => new Error('Ya recibimos varias solicitudes de este número. Te contestamos pronto.')));
    const { c } = montar();
    llenar(c);

    c.send();

    expect(c.sent()).toBeNull();
    expect(c.details()).toBe('Ruido al frenar');
    expect(c.isSending()).toBe(false);
    expect(toast.show).toHaveBeenCalledWith('Ya recibimos varias solicitudes de este número. Te contestamos pronto.', 'error');
  });

  it('lo de frenos, dirección o combustible muestra la nota fija y sobria, al escribirlo y en la confirmación', () => {
    const { fixture, c, el } = montar();
    c.details.set('Los frenos hacen ruido');
    fixture.detectChanges();
    expect(el.querySelector('[data-test="safety"]')?.textContent).toContain('no manejes el vehículo');

    llenar(c, { details: 'Los frenos hacen ruido' });
    c.send();
    fixture.detectChanges();
    expect(el.querySelector('[data-test="safety"]')?.textContent).toContain('Si sientes que no es seguro');
  });

  it('un cambio de aceite no muestra la nota', () => {
    const { fixture, c, el } = montar();
    c.details.set('Quiero cambiar el aceite');
    fixture.detectChanges();

    expect(el.querySelector('[data-test="safety"]')).toBeNull();
  });

  it('las fotos se acumulan hasta el máximo y se pueden quitar', () => {
    const { c } = montar();
    const input = document.createElement('input');
    const files = Array.from({ length: 5 }, (_, i) => new File(['x'], `f${i}.jpg`, { type: 'image/jpeg' }));
    Object.defineProperty(input, 'files', { value: files, configurable: true });

    c.onPhotos({ target: input } as unknown as Event);

    expect(c.photos().length).toBe(MAX_PHOTOS);
    expect(toast.show).toHaveBeenCalledWith(`Máximo ${MAX_PHOTOS} fotos.`, 'error');

    c.removePhoto(0);
    expect(c.photos().length).toBe(MAX_PHOTOS - 1);
  });

  it('ya no dice que no se guarda nada ni que las fotos no se suben', () => {
    const { el } = montar();

    expect(el.textContent).not.toContain('No guardamos lo que escribes');
    expect(el.textContent).not.toContain('Las fotos no se suben aquí');
    expect(el.textContent).toContain('se suben de verdad');
  });

  it('puede abrir el selector de vehículo', () => {
    montar().c.pickVehicle();

    expect(picker.open).toHaveBeenCalled();
  });
});
