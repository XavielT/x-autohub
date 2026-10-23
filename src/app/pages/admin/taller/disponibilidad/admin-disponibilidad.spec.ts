import { TestBed } from '@angular/core/testing';

import { AdminDisponibilidad, dayDrafts } from './admin-disponibilidad';
import { ToastService } from '../../../../../shared/services/toast.service';
import { AVAILABILITY_MOCK } from '../../../../../shared/data/service.mock';

describe('AdminDisponibilidad', () => {
  const toast = { show: vi.fn() };

  async function montar() {
    TestBed.configureTestingModule({ providers: [{ provide: ToastService, useValue: toast }] });
    const fixture = TestBed.createComponent(AdminDisponibilidad);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  const event = (value: string, checked = false) => ({ target: { value, checked } }) as unknown as Event;

  beforeEach(() => toast.show.mockReset());

  it('la semana va de lunes a domingo, con el domingo cerrado', async () => {
    const { c } = await montar();

    expect(c.days().map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(c.days().map((d) => d.open)).toEqual([true, true, true, true, true, true, false]);
    expect(c.openDays()).toBe(6);
  });

  it('avisa que el horario es de ejemplo mientras no se guarde el propio', async () => {
    const { el } = await montar();

    expect(el.querySelector('.tl__warn')?.textContent).toContain('ejemplo');
  });

  it('guardar la semana deja de avisar: ya no es de ejemplo', async () => {
    const { c, fixture, el } = await montar();

    c.saveWeek();
    fixture.detectChanges();

    expect(toast.show).toHaveBeenCalledWith('Horario guardado. Las citas nuevas ya lo usan.');
    expect(c.isExample()).toBe(false);
    expect(el.querySelector('.tl__warn')).toBeNull();
  });

  it('cambiar un día lo refleja, y cerrarlo lo quita de la semana guardada', async () => {
    const { c } = await montar();

    c.setOpen(1, event('', false));
    c.saveWeek();

    expect(c.days().find((d) => d.weekday === 1)!.open).toBe(false);
    expect(c.openDays()).toBe(5);
  });

  it('un taller que cierra antes de abrir no se guarda', async () => {
    const { c } = await montar();

    c.setTime(1, 'opensAt', event('17:00'));
    c.setTime(1, 'closesAt', event('08:00'));
    c.saveWeek();

    expect(toast.show).toHaveBeenCalledWith('El taller tiene que cerrar después de abrir.', 'error');
  });

  it('avisa si se cierran todos los días', async () => {
    const { c, fixture, el } = await montar();

    for (const d of c.days()) c.patchDay(d.weekday, { open: false });
    fixture.detectChanges();

    expect(el.textContent).toContain('no se podrá agendar ninguna cita');
  });

  describe('cierres', () => {
    it('se agrega un cierre con su motivo y aparece en la lista', async () => {
      const { c, fixture, el } = await montar();

      c.setClose('closeFromDate', event('2026-12-25'));
      c.setClose('closeFromTime', event('00:00'));
      c.setClose('closeToDate', event('2026-12-25'));
      c.setClose('closeToTime', event('23:59'));
      c.setClose('closeReason', event('Navidad'));
      c.addBlackout();
      fixture.detectChanges();

      expect(c.blackouts()).toHaveLength(1);
      expect(el.textContent).toContain('Navidad');
      expect(toast.show).toHaveBeenCalledWith('Cierre agregado. Esas horas ya no se ofrecen.');
    });

    it('un cierre que termina antes de empezar se rechaza', async () => {
      const { c } = await montar();

      c.setClose('closeFromDate', event('2026-12-26'));
      c.setClose('closeToDate', event('2026-12-25'));
      c.addBlackout();

      expect(toast.show).toHaveBeenCalledWith('El cierre tiene que terminar después de empezar.', 'error');
      expect(c.blackouts()).toHaveLength(0);
    });

    it('se quita', async () => {
      const { c } = await montar();
      c.setClose('closeFromDate', event('2026-12-25'));
      c.setClose('closeToDate', event('2026-12-26'));
      c.addBlackout();

      c.removeBlackout(c.blackouts()[0]);

      expect(c.blackouts()).toHaveLength(0);
    });
  });
});

describe('dayDrafts', () => {
  it('un día con regla viene abierto con sus horas; sin regla, cerrado con valores sensatos', () => {
    const days = dayDrafts(AVAILABILITY_MOCK);

    expect(days.find((d) => d.weekday === 6)).toMatchObject({ open: true, opensAt: '08:00', closesAt: '13:00', ruleId: 6 });
    expect(days.find((d) => d.weekday === 0)).toMatchObject({ open: false, ruleId: null, opensAt: '08:00', closesAt: '17:00' });
  });

  it('con dos tramos el mismo día toma el primero', () => {
    const days = dayDrafts([
      { id: 1, weekday: 1, opensAt: '08:00', closesAt: '12:00', slotMinutes: 60, capacity: 1, isExample: false },
      { id: 2, weekday: 1, opensAt: '14:00', closesAt: '18:00', slotMinutes: 60, capacity: 1, isExample: false },
    ]);

    expect(days.find((d) => d.weekday === 1)!.closesAt).toBe('12:00');
  });
});
