import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { Agendar, appointmentWhatsAppMessage } from './agendar';
import { AppointmentService } from '../../../shared/services/appointment.service';
import { AuthService } from '../../../shared/services/auth.service';
import { OrderService } from '../../../shared/services/order.service';
import { ServiceCatalogService } from '../../../shared/services/service-catalog.service';
import { SiteSettingsService } from '../../../shared/services/site-settings.service';
import { ToastService } from '../../../shared/services/toast.service';
import { VehiclePickerService } from '../../../shared/services/vehicle-picker.service';
import { VehicleService } from '../../../shared/services/vehicle.service';
import { AVAILABILITY_MOCK, SERVICES_MOCK } from '../../../shared/data/service.mock';
import { Slot } from '../../../shared/models/service.model';
import { slotInstant } from '../../../shared/utils/service-time';

describe('Agendar (/servicios/agendar)', () => {
  // Viernes 23 de octubre de 2026, 8:00 a. m. en Santo Domingo.
  const NOW = new Date('2026-10-23T12:00:00Z');
  const MONDAY = '2026-10-26';

  const getSlots = vi.fn();
  const book = vi.fn();
  const toast = { show: vi.fn() };
  const picker = { open: vi.fn() };
  const slotsOf = (...times: [string, number][]): Slot[] => times.map(([t, remaining]) => ({ at: slotInstant(MONDAY, t), remaining }));

  function montar(options: {
    query?: Record<string, string>;
    user?: { displayName: string; phone?: string } | null;
    picked?: string | null;
    selected?: { makeId: number; modelId: number; year: number } | null;
    garage?: { id: number; makeId: number; modelId: number; year: number }[];
    order?: unknown;
  } = {}) {
    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(options.query ?? {})) } },
        { provide: ServiceCatalogService, useValue: { getServices: () => of(SERVICES_MOCK), getAvailability: () => of(AVAILABILITY_MOCK) } },
        { provide: AppointmentService, useValue: { getSlots, book } },
        { provide: OrderService, useValue: { getOrder: () => of(options.order ?? null) } },
        { provide: SiteSettingsService, useValue: { getPickupAddress: () => of({ address: 'Av. Principal 1', hours: '', isExample: false }) } },
        { provide: AuthService, useValue: { user: signal(options.user ?? null) } },
        {
          provide: VehicleService,
          useValue: {
            selectedLabel: signal(options.picked ?? null),
            selected: signal(options.selected ?? null),
            garage: signal(options.garage ?? []),
          },
        },
        { provide: VehiclePickerService, useValue: picker },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(Agendar);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  /** Llega al paso 3 con el lunes a las 9:00 elegido. */
  function hastaDatos(options: Parameters<typeof montar>[0] = {}) {
    const m = montar({ query: { service: '4' }, ...options });
    m.c.pickDay(MONDAY);
    m.c.pickSlot({ at: slotInstant(MONDAY, '09:00'), remaining: 2 });
    m.c.next();
    m.fixture.detectChanges();
    return m;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    getSlots.mockReset();
    book.mockReset();
    toast.show.mockReset();
    picker.open.mockReset();
    getSlots.mockReturnValue(of(slotsOf(['08:00', 2], ['09:00', 1], ['10:00', 2])));
    book.mockReturnValue(of({ id: 'cita-1', number: 2001, serviceId: 4, scheduledAt: slotInstant(MONDAY, '09:00'), status: 'requested' }));
  });

  afterEach(() => vi.useRealTimers());

  describe('paso 1: el servicio', () => {
    it('sin servicio en la dirección arranca en el paso 1 y exige elegir uno', () => {
      const { c } = montar();

      expect(c.step()).toBe(1);
      c.next();
      expect(c.step()).toBe(1);
      expect(toast.show).toHaveBeenCalledWith('Elige el servicio que necesitas.', 'error');
    });

    it('con ?service= viene elegido y salta al día y la hora', () => {
      const { c } = montar({ query: { service: '4' } });

      expect(c.service()?.title).toBe('Frenos');
      expect(c.step()).toBe(2);
    });

    it('un servicio que no existe en la dirección se ignora', () => {
      const { c } = montar({ query: { service: '999' } });

      expect(c.service()).toBeNull();
      expect(c.step()).toBe(1);
    });

    it('si viene de un pedido, lo muestra', () => {
      const { el } = montar({
        query: { service: '4', order: 'o-1' },
        order: { id: 'o-1', orderNumber: 1042, items: [{ name: 'Disco', unitPrice: 1, quantity: 1 }] },
      });

      expect(el.querySelector('.agd__order')?.textContent).toContain('#1042');
    });
  });

  describe('paso 2: el calendario', () => {
    it('los días pasados están deshabilitados y hoy no', () => {
      const { el } = montar({ query: { service: '4' } });

      const buttons = [...el.querySelectorAll<HTMLButtonElement>('.agd__day')];
      const dayBtn = (n: number) => buttons.find((b) => b.textContent?.trim() === String(n))!;
      expect(dayBtn(22).disabled).toBe(true);
      expect(dayBtn(23).disabled).toBe(false);
      expect(dayBtn(24).disabled).toBe(false);
    });

    it('un día en que el taller no abre (el domingo) no se ofrece', () => {
      const { el } = montar({ query: { service: '4' } });

      const buttons = [...el.querySelectorAll<HTMLButtonElement>('.agd__day')];
      const dayBtn = (n: number) => buttons.find((b) => b.textContent?.trim() === String(n))!;
      expect(dayBtn(25).disabled).toBe(true); // domingo
      expect(dayBtn(24).disabled).toBe(false); // sábado
      expect(dayBtn(26).disabled).toBe(false); // lunes
    });

    it('no se puede ir a un mes que ya pasó', () => {
      const { c } = montar({ query: { service: '4' } });

      expect(c.canGoPrev()).toBe(false);
      expect(c.canGoNext()).toBe(true);
      c.shiftMonthBy(-1);
      expect(c.viewMonth()).toBe(10);
      c.shiftMonthBy(1);
      expect(c.viewMonth()).toBe(11);
    });

    it('al elegir un día pide las horas de ese día y las muestra como botones', () => {
      const { fixture, c, el } = montar({ query: { service: '4' } });

      c.pickDay(MONDAY);
      fixture.detectChanges();

      expect(getSlots).toHaveBeenCalledWith(4, MONDAY);
      const times = [...el.querySelectorAll('.agd__slot')].map((b) => b.textContent?.replace(/\s+/g, ' ').trim());
      expect(times).toHaveLength(3);
      expect(times[1]).toContain('queda 1');
      expect(times[0]).not.toContain('queda');
    });

    it('un día sin horas lo dice', () => {
      getSlots.mockReturnValue(of([]));
      const { fixture, c, el } = montar({ query: { service: '4' } });

      c.pickDay(MONDAY);
      fixture.detectChanges();

      expect(el.textContent).toContain('No hay horas libres ese día');
    });

    it('si falla la lectura de horas lo dice', () => {
      getSlots.mockReturnValue(throwError(() => new Error('caido')));
      const { fixture, c, el } = montar({ query: { service: '4' } });

      c.pickDay(MONDAY);
      fixture.detectChanges();

      expect(el.querySelector('[role="alert"]')?.textContent).toContain('No pudimos leer las horas');
    });

    it('sin elegir hora no avanza', () => {
      const { c } = montar({ query: { service: '4' } });
      c.pickDay(MONDAY);

      c.next();

      expect(c.step()).toBe(2);
      expect(toast.show).toHaveBeenCalledWith('Elige el día y la hora.', 'error');
    });

    it('cambiar de día borra la hora elegida', () => {
      const { c } = montar({ query: { service: '4' } });
      c.pickDay(MONDAY);
      c.pickSlot({ at: slotInstant(MONDAY, '09:00'), remaining: 1 });

      c.pickDay('2026-10-27');

      expect(c.selectedSlot()).toBeNull();
    });
  });

  describe('paso 3: los datos', () => {
    it('pide nombre, teléfono y vehículo, y los nombra', () => {
      const { c } = hastaDatos();

      c.confirm();

      expect(book).not.toHaveBeenCalled();
      expect(toast.show).toHaveBeenCalledWith('Te falta completar: Nombre, Teléfono, Vehículo.', 'error');
    });

    it('un teléfono que no es dominicano no pasa', () => {
      const { c } = hastaDatos();
      c.contactName.set('Cliente');
      c.vehicle.set('Corolla 2015');
      c.contactPhone.set('12345');

      c.confirm();

      expect(book).not.toHaveBeenCalled();
      expect(c.invalid('phone')).toBe(true);
    });

    it('quien tiene sesión llega con nombre y teléfono ya puestos', () => {
      const { c } = hastaDatos({ user: { displayName: 'Ana Pérez', phone: '809-555-0134' } });

      expect(c.contactName()).toBe('Ana Pérez');
      expect(c.contactPhone()).toBe('809-555-0134');
    });

    it('con un vehículo elegido en "Mi vehículo" lo ofrece escrito', () => {
      expect(hastaDatos({ picked: 'Toyota Corolla 2015' }).c.vehicle()).toBe('Toyota Corolla 2015');
    });

    it('confirma con lo que se eligió: servicio, hora y teléfono en su forma canónica', () => {
      const { c } = hastaDatos();
      c.contactName.set(' Cliente ');
      c.contactPhone.set('809-555-0134');
      c.vehicle.set('Corolla 2015');
      c.notes.set('Ruido al frenar');

      c.confirm();

      expect(book).toHaveBeenCalledTimes(1);
      expect(book.mock.calls[0][0]).toEqual({
        serviceId: 4,
        scheduledAt: slotInstant(MONDAY, '09:00'),
        contactName: 'Cliente',
        contactPhone: '8095550134',
        vehicleText: 'Corolla 2015',
        profileVehicleId: null,
        orderId: null,
        notes: 'Ruido al frenar',
      });
    });

    it('si el texto sigue siendo el del vehículo elegido, la cita lo liga con el del garaje', () => {
      const { c } = hastaDatos({
        picked: 'Toyota Corolla 2015',
        selected: { makeId: 1, modelId: 2, year: 2015 },
        garage: [{ id: 77, makeId: 1, modelId: 2, year: 2015 }],
      });
      c.contactName.set('Cliente');
      c.contactPhone.set('809-555-0134');

      c.confirm();
      expect(book.mock.calls[0][0].profileVehicleId).toBe(77);
    });

    it('si cambió el texto del vehículo, ya no se liga al garaje', () => {
      const { c } = hastaDatos({
        picked: 'Toyota Corolla 2015',
        selected: { makeId: 1, modelId: 2, year: 2015 },
        garage: [{ id: 77, makeId: 1, modelId: 2, year: 2015 }],
      });
      c.contactName.set('Cliente');
      c.contactPhone.set('809-555-0134');
      c.vehicle.set('Honda Civic 2018');

      c.confirm();
      expect(book.mock.calls[0][0].profileVehicleId).toBeNull();
    });

    it('si viene de un pedido, la cita lleva su id', () => {
      const { c } = hastaDatos({ query: { service: '4', order: 'o-1' } });
      c.contactName.set('Cliente');
      c.contactPhone.set('809-555-0134');
      c.vehicle.set('Corolla');

      c.confirm();
      expect(book.mock.calls[0][0].orderId).toBe('o-1');
    });

    it('si la hora se llenó mientras se llenaba el formulario, vuelve a las horas y las recarga', () => {
      book.mockReturnValue(throwError(() => new Error('Esa hora ya no está disponible. Elige otra.')));
      const { c } = hastaDatos();
      c.contactName.set('Cliente');
      c.contactPhone.set('809-555-0134');
      c.vehicle.set('Corolla');
      getSlots.mockClear();

      c.confirm();

      expect(toast.show).toHaveBeenCalledWith('Esa hora ya no está disponible. Elige otra.', 'error');
      expect(c.step()).toBe(2);
      expect(c.selectedSlot()).toBeNull();
      expect(getSlots).toHaveBeenCalledWith(4, MONDAY);
      expect(c.isBooking()).toBe(false);
    });

    it('otro error se avisa sin sacar a la persona del paso 3', () => {
      book.mockReturnValue(throwError(() => new Error('Ya tienes 3 citas abiertas con este teléfono. Escríbenos por WhatsApp para cambiarlas.')));
      const { c } = hastaDatos();
      c.contactName.set('Cliente');
      c.contactPhone.set('809-555-0134');
      c.vehicle.set('Corolla');

      c.confirm();

      expect(c.step()).toBe(3);
      expect(toast.show.mock.calls.at(-1)?.[0]).toMatch(/3 citas abiertas/);
    });
  });

  describe('confirmación', () => {
    function confirmada() {
      const m = hastaDatos({ user: { displayName: 'Ana', phone: '809-555-0134' } });
      m.c.vehicle.set('Corolla 2015');
      m.c.confirm();
      m.fixture.detectChanges();
      return m;
    }

    it('muestra el número de cita y que está por confirmar', () => {
      const { el } = confirmada();

      expect(el.querySelector('.agd__title')?.textContent).toContain('#2001');
      expect(el.querySelector('.agd__notice')?.textContent).toContain('Por confirmar');
    });

    it('"Avisar por WhatsApp" lleva el número, el servicio y la hora', () => {
      const { c } = confirmada();

      const link = decodeURIComponent(c.whatsappLink());
      expect(link).toContain('wa.me/18099539782');
      expect(link).toContain('cita #2001');
      expect(link).toContain('Servicio: Frenos');
      expect(link).toContain('Vehículo: Corolla 2015');
    });

    it('"Agregar a mi calendario" genera un .ics válido con la hora correcta, en el cliente', async () => {
      const { c } = confirmada();
      const blobs: Blob[] = [];
      vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => (blobs.push(b as Blob), 'blob:x'));
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

      c.addToCalendar();

      expect(click).toHaveBeenCalledTimes(1);
      // jsdom no trae `Blob.text()`: se lee con FileReader.
      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(blobs[0]);
      });
      expect(text).toContain('BEGIN:VCALENDAR');
      expect(text).toContain('DTSTART:20261026T130000Z'); // 9:00 de Santo Domingo
      expect(text).toContain('DTEND:20261026T143000Z'); // + los 90 minutos de Frenos
      expect(text).toContain('SUMMARY:Cita en X AutoHub: Frenos');
      expect(text).toContain('LOCATION:Av. Principal 1');
      expect(text).toContain('UID:cita-1@xautohubrd.com');
    });

    it('quien tiene sesión ve el enlace a "Mis citas"; un invitado, el aviso de guardar el número', () => {
      expect(confirmada().el.querySelector('a[href="/perfil#citas"]')).not.toBeNull();
      TestBed.resetTestingModule();

      const guest = montar({ query: { service: '4' } });
      guest.c.pickDay(MONDAY);
      guest.c.pickSlot({ at: slotInstant(MONDAY, '09:00'), remaining: 2 });
      guest.c.next();
      guest.c.contactName.set('Invitado');
      guest.c.contactPhone.set('809-555-0134');
      guest.c.vehicle.set('Civic');
      guest.c.confirm();
      guest.fixture.detectChanges();

      expect(guest.el.querySelector('a[href="/perfil#citas"]')).toBeNull();
      expect(guest.el.textContent).toContain('Guarda el número de tu cita');
    });

    it('"Agendar otra cita" vuelve al principio', () => {
      const { c } = confirmada();

      c.reset();

      expect(c.booked()).toBeNull();
      expect(c.step()).toBe(1);
      expect(c.selectedSlot()).toBeNull();
    });
  });

  it('el mensaje de WhatsApp de una cita', () => {
    expect(appointmentWhatsAppMessage(2001, 'Frenos', 'lunes, 26 de octubre, 9:00 a. m.', ' Corolla ')).toBe(
      ['Hola X AutoHub, acabo de agendar la cita #2001.', 'Servicio: Frenos', 'Cuándo: lunes, 26 de octubre, 9:00 a. m.', 'Vehículo: Corolla'].join('\n'),
    );
  });

  it('solo se vuelve a un paso ya recorrido', () => {
    const { c } = hastaDatos();

    c.jumpTo(3);
    expect(c.step()).toBe(3);
    c.jumpTo(1);
    expect(c.step()).toBe(1);
    c.jumpTo(3);
    expect(c.step()).toBe(1);
  });
});
