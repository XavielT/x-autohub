import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { MisCitas } from './mis-citas';
import { AppointmentService } from '../../../../shared/services/appointment.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { AppointmentModel } from '../../../../shared/models/service.model';

describe('MisCitas (en el perfil)', () => {
  const HOUR = 3_600_000;
  const cita = (over: Partial<AppointmentModel> = {}): AppointmentModel => ({
    id: 'c1', number: 2001, serviceId: 4, serviceTitle: 'Frenos', serviceSlug: 'frenos',
    scheduledAt: new Date(Date.now() + 72 * HOUR), status: 'requested', vehicleText: 'Corolla 2015', statusNote: null, orderId: null,
    ...over,
  });

  const getMyAppointments = vi.fn();
  const cancel = vi.fn();
  const toast = { show: vi.fn() };

  function montar(list: AppointmentModel[]) {
    getMyAppointments.mockReturnValue(of(list));
    cancel.mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      providers: [
        { provide: AppointmentService, useValue: { getMyAppointments, cancel } },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(MisCitas);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    getMyAppointments.mockReset();
    cancel.mockReset();
    toast.show.mockReset();
  });

  it('sin citas invita a mirar los servicios', () => {
    expect(montar([]).el.textContent).toContain('Todavía no tienes citas');
  });

  it('lista cada cita con su número, servicio, estado, vehículo y la nota del equipo', () => {
    const { el } = montar([cita({ status: 'confirmed', statusNote: 'Te esperamos' })]);

    expect(el.querySelector('.citas__num')?.textContent).toBe('#2001');
    expect(el.querySelector('.citas__service')?.getAttribute('href')).toBe('/servicios/frenos');
    expect(el.querySelector('.citas__status')?.textContent?.trim()).toBe('Confirmada');
    expect(el.querySelector('.citas__note')?.textContent).toContain('Te esperamos');
    expect(el.textContent).toContain('Corolla 2015');
  });

  it('la sección se puede enlazar con #citas', () => {
    expect(montar([]).el.querySelector('#citas')).not.toBeNull();
  });

  it('ofrece cancelar solo con más de 24 horas', () => {
    const { el } = montar([
      cita({ id: 'lejos', scheduledAt: new Date(Date.now() + 72 * HOUR) }),
      cita({ id: 'cerca', number: 2002, scheduledAt: new Date(Date.now() + 5 * HOUR) }),
    ]);

    expect(el.querySelectorAll('.citas__cancel')).toHaveLength(1);
  });

  it('una cita hecha, cancelada o pasada no se puede cancelar', () => {
    const { el } = montar([
      cita({ id: 'a', status: 'done' }),
      cita({ id: 'b', status: 'cancelled' }),
      cita({ id: 'c', scheduledAt: new Date(Date.now() - 2 * HOUR) }),
    ]);

    expect(el.querySelectorAll('.citas__cancel')).toHaveLength(0);
  });

  it('cancelar pide un segundo toque, y recién ahí cancela y vuelve a leer', () => {
    const { c, fixture } = montar([cita()]);
    const a = c.list()[0];
    getMyAppointments.mockClear();

    c.cancel(a);
    fixture.detectChanges();
    expect(cancel).not.toHaveBeenCalled();
    expect(c.confirming()).toBe('c1');
    expect(fixture.nativeElement.querySelector('.citas__cancel').textContent).toContain('Toca otra vez');

    c.cancel(a);
    expect(cancel).toHaveBeenCalledWith('c1');
    expect(toast.show).toHaveBeenCalledWith('Cita #2001 cancelada.');
    expect(getMyAppointments).toHaveBeenCalledTimes(1);
  });

  it('si la base lo rechaza, avisa con su mensaje y vuelve a leer lo que hay', () => {
    const { c } = montar([cita()]);
    cancel.mockReturnValue(throwError(() => new Error('Solo se puede cancelar con mas de 24 horas de anticipacion. Escribenos por WhatsApp.')));
    getMyAppointments.mockClear();

    c.cancel(c.list()[0]);
    c.cancel(c.list()[0]);

    expect(toast.show).toHaveBeenCalledWith(
      'Solo se puede cancelar con mas de 24 horas de anticipacion. Escribenos por WhatsApp.',
      'error',
    );
    expect(getMyAppointments).toHaveBeenCalledTimes(1);
    expect(c.cancelling()).toBeNull();
  });

  it('si falla la lectura lo dice', () => {
    getMyAppointments.mockReturnValue(throwError(() => new Error('caido')));
    TestBed.configureTestingModule({
      providers: [
        { provide: AppointmentService, useValue: { getMyAppointments, cancel } },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(MisCitas);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('No pudimos leer tus citas');
  });
});
