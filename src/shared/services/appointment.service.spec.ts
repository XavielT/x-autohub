import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AppointmentService } from './appointment.service';
import { AuthService } from './auth.service';
import { BookingInput } from '../models/service.model';
import { UserModel } from '../models/user.model';
import { localTime, slotInstant } from '../utils/service-time';

/**
 * Agendar por el camino simulado. El mock **espeja** `available_slots()` y
 * `book_appointment()` con los mismos mensajes: uno más permisivo que la base haría
 * que el flujo "funcione" en desarrollo y falle en producción.
 *
 * El reloj está fijo en un viernes 23 de octubre de 2026, 8:00 a. m. en Santo Domingo,
 * para que "mañana", "ya pasó" y "dentro de 24 horas" no dependan de cuándo corra la
 * prueba. El lunes siguiente es el 26.
 */
describe('AppointmentService (mock)', () => {
  const NOW = new Date('2026-10-23T12:00:00Z');
  const MONDAY = '2026-10-26';
  const SUNDAY = '2026-10-25';

  const user = signal<UserModel | null>(null);
  const USER: UserModel = {
    id: 'u-1', displayName: 'Quien sea', email: 'q@e.com', role: 'user', createdAt: '2026-08-15T00:00:00Z',
  };

  let service: AppointmentService;

  const input = (over: Partial<BookingInput> = {}): BookingInput => ({
    serviceId: 4,
    scheduledAt: slotInstant(MONDAY, '09:00'),
    contactName: 'Cliente',
    contactPhone: '809-555-0134',
    vehicleText: 'Toyota Corolla 2015',
    profileVehicleId: null,
    orderId: null,
    notes: '',
    ...over,
  });

  const errorOf = async (obs: Parameters<typeof firstValueFrom>[0]) => {
    try {
      await firstValueFrom(obs);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    user.set(null);
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user } }] });
    service = TestBed.inject(AppointmentService);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  describe('las horas libres', () => {
    it('un lunes tiene 9 franjas, de 8:00 a 16:00, con 2 cupos', async () => {
      const slots = await firstValueFrom(service.getSlots(4, MONDAY));

      expect(slots.map((s) => localTime(s.at))).toEqual(['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
      expect(slots.every((s) => s.remaining === 2)).toBe(true);
    });

    it('el domingo el taller no abre', async () => {
      expect(await firstValueFrom(service.getSlots(4, SUNDAY))).toEqual([]);
    });

    it('un día que ya pasó no tiene horas, y hoy solo las que faltan', async () => {
      expect(await firstValueFrom(service.getSlots(4, '2026-10-22'))).toEqual([]);

      // Hoy son las 8:00: la franja de las 8:00 ya no, la de las 9:00 sí.
      const today = await firstValueFrom(service.getSlots(4, '2026-10-23'));
      expect(localTime(today[0].at)).toBe('09:00');
    });

    it('un servicio que no existe no tiene horas', async () => {
      expect(await firstValueFrom(service.getSlots(99999, MONDAY))).toEqual([]);
    });
  });

  describe('agendar', () => {
    it('la cita nace por confirmar, con su número', async () => {
      const booked = await firstValueFrom(service.book(input()));

      expect(booked.status).toBe('requested');
      expect(booked.number).toBeGreaterThanOrEqual(2001);
      expect(+booked.scheduledAt).toBe(+slotInstant(MONDAY, '09:00'));
    });

    it('la franja pasa de 2 cupos a 1', async () => {
      await firstValueFrom(service.book(input()));

      const slots = await firstValueFrom(service.getSlots(4, MONDAY));
      expect(slots.find((s) => localTime(s.at) === '09:00')?.remaining).toBe(1);
    });

    it('con capacidad 2, una tercera persona no entra a la misma hora', async () => {
      await firstValueFrom(service.book(input({ contactPhone: '809-555-0001' })));
      await firstValueFrom(service.book(input({ contactPhone: '809-555-0002' })));

      expect(await errorOf(service.book(input({ contactPhone: '809-555-0003' })))).toBe(
        'Esa hora ya no esta disponible. Elige otra.',
      );
      const slots = await firstValueFrom(service.getSlots(4, MONDAY));
      expect(slots.map((s) => localTime(s.at))).not.toContain('09:00');
    });

    it('rechaza una hora que ya pasó, una que no es franja y un día cerrado', async () => {
      const unavailable = 'Esa hora ya no esta disponible. Elige otra.';

      expect(await errorOf(service.book(input({ scheduledAt: new Date('2026-10-22T14:00:00Z') })))).toBe(unavailable);
      expect(await errorOf(service.book(input({ scheduledAt: slotInstant(MONDAY, '09:30') })))).toBe(unavailable);
      expect(await errorOf(service.book(input({ scheduledAt: slotInstant(SUNDAY, '10:00') })))).toBe(unavailable);
    });

    it('rechaza un servicio que no existe', async () => {
      expect(await errorOf(service.book(input({ serviceId: 99999 })))).toBe('Esa hora ya no esta disponible. Elige otra.');
    });

    it('pide nombre y un teléfono válido, con los mensajes de la base', async () => {
      expect(await errorOf(service.book(input({ contactName: '  ' })))).toBe('Escribe tu nombre.');
      expect(await errorOf(service.book(input({ contactPhone: '12345' })))).toBe(
        'Escribe un telefono valido: lo usamos para confirmar tu cita.',
      );
    });

    it('un tope de 3 citas abiertas por teléfono, sin importar cómo lo escribieron', async () => {
      await firstValueFrom(service.book(input({ scheduledAt: slotInstant(MONDAY, '08:00') })));
      await firstValueFrom(service.book(input({ scheduledAt: slotInstant(MONDAY, '09:00'), contactPhone: '8095550134' })));
      await firstValueFrom(service.book(input({ scheduledAt: slotInstant(MONDAY, '10:00'), contactPhone: '(809) 555-0134' })));

      expect(
        await errorOf(service.book(input({ scheduledAt: slotInstant(MONDAY, '11:00'), contactPhone: '+1 809 555 0134' }))),
      ).toBe('Ya tienes 3 citas abiertas con este telefono. Escribenos por WhatsApp para cambiarlas.');
    });

    it('sobrevive a una recarga', async () => {
      const booked = await firstValueFrom(service.book(input()));
      user.set(USER);
      await firstValueFrom(service.book(input({ scheduledAt: slotInstant(MONDAY, '10:00'), contactPhone: '809-555-0009' })));

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user } }] });
      const otra = TestBed.inject(AppointmentService);

      const slots = await firstValueFrom(otra.getSlots(4, MONDAY));
      expect(slots.find((s) => localTime(s.at) === '09:00')?.remaining).toBe(1);
      expect(booked.id).toBeTruthy();
      const mine = await firstValueFrom(otra.getMyAppointments());
      // Y las fechas vuelven como fechas, no como texto.
      expect(mine[0].scheduledAt).toBeInstanceOf(Date);
    });
  });

  describe('mis citas', () => {
    it('sin sesión no hay citas, y una de invitado no aparece en la de nadie', async () => {
      await firstValueFrom(service.book(input())); // invitado
      expect(await firstValueFrom(service.getMyAppointments())).toEqual([]);

      user.set(USER);
      expect(await firstValueFrom(service.getMyAppointments())).toEqual([]);
    });

    it('con sesión veo las mías, de la más nueva a la más vieja, y no las de otro', async () => {
      user.set(USER);
      await firstValueFrom(service.book(input({ scheduledAt: slotInstant(MONDAY, '09:00') })));
      await firstValueFrom(service.book(input({ scheduledAt: slotInstant(MONDAY, '15:00') })));

      const mine = await firstValueFrom(service.getMyAppointments());
      expect(mine.map((a) => localTime(a.scheduledAt))).toEqual(['15:00', '09:00']);
      expect(mine[0].serviceTitle).toBe('Frenos');

      user.set({ ...USER, id: 'u-2' });
      expect(await firstValueFrom(service.getMyAppointments())).toEqual([]);
    });
  });

  describe('cancelar (la regla de 24 horas)', () => {
    it('con más de 24 horas se cancela, y la franja se libera', async () => {
      user.set(USER);
      const booked = await firstValueFrom(service.book(input()));

      await firstValueFrom(service.cancel(booked.id));

      const mine = await firstValueFrom(service.getMyAppointments());
      expect(mine[0].status).toBe('cancelled');
      expect(mine[0].statusNote).toBe('Cancelada por el cliente');
      const slots = await firstValueFrom(service.getSlots(4, MONDAY));
      expect(slots.find((s) => localTime(s.at) === '09:00')?.remaining).toBe(2);
    });

    it('con menos de 24 horas no, y dice por dónde', async () => {
      user.set(USER);
      // Hoy son las 8:00: la franja de las 9:00 de hoy está a una hora.
      const soon = await firstValueFrom(service.book(input({ scheduledAt: slotInstant('2026-10-23', '09:00') })));

      expect(await errorOf(service.cancel(soon.id))).toBe(
        'Solo se puede cancelar con mas de 24 horas de anticipacion. Escribenos por WhatsApp.',
      );
    });

    it('cancelar dos veces se rechaza', async () => {
      user.set(USER);
      const booked = await firstValueFrom(service.book(input()));
      await firstValueFrom(service.cancel(booked.id));

      expect(await errorOf(service.cancel(booked.id))).toBe('Esta cita ya no se puede cancelar.');
    });

    it('la de otra persona y la de un invitado "no existen"', async () => {
      const guest = await firstValueFrom(service.book(input()));
      user.set(USER);
      const mine = await firstValueFrom(service.book(input({ scheduledAt: slotInstant(MONDAY, '10:00'), contactPhone: '809-555-0009' })));

      expect(await errorOf(service.cancel(guest.id))).toBe('Esa cita no existe.');
      user.set({ ...USER, id: 'u-2' });
      expect(await errorOf(service.cancel(mine.id))).toBe('Esa cita no existe.');
    });

    it('sin sesión no se cancela nada', async () => {
      const booked = await firstValueFrom(service.book(input()));

      expect(await errorOf(service.cancel(booked.id))).toBe('Esa cita no existe.');
    });
  });
});
