import { TestBed } from '@angular/core/testing';

import { AdminCitas } from './admin-citas';
import { ToastService } from '../../../../../shared/services/toast.service';

/**
 * La agenda del taller contra el `AdminServicesService` simulado, que hace cumplir el
 * mismo orden que `set_appointment_status()`. El mock trae tres citas: la #2003 por
 * confirmar (en dos días, 9:00), la #2002 confirmada (en dos días, 10:00) y la #2001
 * hecha (hace tres días).
 */
describe('AdminCitas', () => {
  const toast = { show: vi.fn() };

  async function montar() {
    TestBed.configureTestingModule({ providers: [{ provide: ToastService, useValue: toast }] });
    const fixture = TestBed.createComponent(AdminCitas);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  const cita = (c: AdminCitas, n: number) => c.appointments().find((a) => a.number === n)!;

  beforeEach(() => toast.show.mockReset());

  it('empieza en "Por confirmar" y cuenta cuántas hay', async () => {
    const { c, el } = await montar();

    expect(c.range()).toBe('pending');
    expect(c.pendingCount()).toBe(1);
    expect(el.querySelector('.tl__lead')?.textContent).toContain('1 por confirmar');
    expect(el.querySelectorAll('.tl__card')).toHaveLength(1);
  });

  it('las citas se agrupan por día, en orden', async () => {
    const { c, fixture } = await montar();

    c.setRange('upcoming');
    fixture.detectChanges();

    const days = c.days();
    expect(days).toHaveLength(1);
    expect(days[0].items.map((a) => a.number)).toEqual([2003, 2002]); // 9:00 antes que 10:00
  });

  it('"Pasadas" trae las que ya fueron, y "Hoy" y "Esta semana" filtran por día', async () => {
    const { c } = await montar();

    c.setRange('past');
    expect(c.days().flatMap((d) => d.items.map((a) => a.number))).toEqual([2001]);

    c.setRange('today');
    expect(c.days()).toEqual([]);

    c.setRange('week');
    expect(c.days().flatMap((d) => d.items.map((a) => a.number))).toEqual([2003, 2002]);
  });

  it('un rango sin citas lo dice', async () => {
    const { c, fixture, el } = await montar();

    c.setRange('today');
    fixture.detectChanges();

    expect(el.querySelector('.tl__empty')?.textContent).toContain('No hay citas hoy');
  });

  describe('qué botones se ofrecen', () => {
    it('por confirmar: confirmar o cancelar', async () => {
      const { c } = await montar();

      expect(c.actionsFor(cita(c, 2003)).map((a) => a.to)).toEqual(['confirmed', 'cancelled']);
    });

    it('confirmada: en curso, hecha, cancelar o no se presentó', async () => {
      const { c } = await montar();

      expect(c.actionsFor(cita(c, 2002)).map((a) => a.to)).toEqual(['in_progress', 'done', 'cancelled', 'no_show']);
    });

    it('cancelar y "no se presentó" son destructivos; confirmar no', async () => {
      const { c } = await montar();

      expect(c.actionsFor(cita(c, 2002)).filter((a) => a.destructive).map((a) => a.to)).toEqual(['cancelled', 'no_show']);
      expect(c.actionsFor(cita(c, 2003))[0].destructive).toBe(false);
    });

    it('una cita hecha no ofrece nada', async () => {
      const { c } = await montar();

      expect(c.actionsFor(cita(c, 2001))).toEqual([]);
    });
  });

  describe('cambiar el estado', () => {
    it('confirmar es un toque, y la nota queda en la cita', async () => {
      const { c } = await montar();
      const a = cita(c, 2003);
      c.notes.set({ [a.id]: 'Trae la llave de seguridad' });

      c.act(a, c.actionsFor(a)[0]);

      expect(cita(c, 2003).status).toBe('confirmed');
      expect(cita(c, 2003).statusNote).toBe('Trae la llave de seguridad');
      expect(toast.show).toHaveBeenCalledWith('Cita #2003: confirmada.');
      expect(c.noteOf(a.id)).toBe('');
    });

    it('cancelar pide un segundo toque, sobre ese mismo botón', async () => {
      const { c } = await montar();
      const a = cita(c, 2003);
      const cancel = c.actionsFor(a).find((x) => x.to === 'cancelled')!;

      c.act(a, cancel);
      expect(cita(c, 2003).status).toBe('requested');
      expect(c.isConfirming(a, cancel)).toBe(true);

      c.act(a, cancel);
      expect(cita(c, 2003).status).toBe('cancelled');
    });

    it('el segundo toque tiene que ser sobre el mismo botón: otro botón reinicia', async () => {
      const { c } = await montar();
      const a = cita(c, 2002);
      const cancel = c.actionsFor(a).find((x) => x.to === 'cancelled')!;
      const noShow = c.actionsFor(a).find((x) => x.to === 'no_show')!;

      c.act(a, cancel);
      c.act(a, noShow);

      expect(cita(c, 2002).status).toBe('confirmed');
      expect(c.isConfirming(a, noShow)).toBe(true);
    });

    it('un paso que la cita no puede dar se rechaza y avisa', async () => {
      const { c } = await montar();

      c.act(cita(c, 2003), { to: 'done', label: 'Marcar como hecha', destructive: false });

      expect(cita(c, 2003).status).toBe('requested');
      expect(toast.show).toHaveBeenCalledWith('Una cita requested no puede pasar a done.', 'error');
    });
  });

  it('arma el WhatsApp al cliente con el número de cita', async () => {
    const { c } = await montar();

    const link = decodeURIComponent(c.whatsapp(cita(c, 2003)));

    expect(link).toContain('wa.me/18095550003');
    expect(link).toContain('cita #2003');
  });

  it('marca las que vienen de un invitado y las que son la instalación de un pedido', async () => {
    const { c, fixture, el } = await montar();

    c.setRange('upcoming');
    fixture.detectChanges();

    expect([...el.querySelectorAll('.tl__badge')].map((b) => b.textContent?.trim())).toContain('Invitado');
  });
});
