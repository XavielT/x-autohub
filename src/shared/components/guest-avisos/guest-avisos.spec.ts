import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GuestAvisos } from './guest-avisos';
import { AuthService } from '../../services/auth.service';
import { GuestPushKind, PushService, PushState } from '../../services/push.service';
import { ToastService } from '../../services/toast.service';

describe('GuestAvisos (avisos de un pedido o una cita de invitado)', () => {
  const ID = '11111111-1111-4111-8111-111111111111';
  const toast = { show: vi.fn() };
  const enableForGuest = vi.fn();
  const disableForGuest = vi.fn();
  const guestState = vi.fn();

  async function montar(initial: PushState, options: { logged?: boolean; kind?: GuestPushKind } = {}) {
    toast.show.mockClear();
    let state = initial;
    guestState.mockReset().mockImplementation(async () => state);
    enableForGuest.mockReset().mockImplementation(async () => {
      state = 'on';
      return { ok: true };
    });
    disableForGuest.mockReset().mockImplementation(async () => {
      state = 'off';
      return { ok: true };
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: PushService, useValue: { guestState, enableForGuest, disableForGuest } },
        { provide: AuthService, useValue: { user: signal(options.logged ? { id: 'u-1' } : null) } },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(GuestAvisos);
    fixture.componentRef.setInput('kind', options.kind ?? 'order');
    fixture.componentRef.setInput('targetId', ID);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const boton = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.gavisos__btn');

  it('lee el estado de ESTE pedido al abrirse', async () => {
    await montar('off');
    expect(guestState).toHaveBeenCalledWith({ kind: 'order', id: ID });
  });

  it('y el de esta cita, si es una cita', async () => {
    await montar('off', { kind: 'appointment' });
    expect(guestState).toHaveBeenCalledWith({ kind: 'appointment', id: ID });
  });

  it('donde no se pueden activar no pinta nada', async () => {
    const { el } = await montar('unsupported');
    expect(el.querySelector('.gavisos')).toBeNull();
  });

  it('quien tiene sesión no ve nada: sus avisos están en el perfil', async () => {
    const { el } = await montar('off', { logged: true });
    expect(el.querySelector('.gavisos')).toBeNull();
  });

  it('en un pedido habla de pedido, y en una cita habla de cita', async () => {
    const pedido = await montar('off');
    expect(pedido.el.querySelector('.gavisos__title')?.textContent).toContain('mi pedido');
    expect(pedido.el.textContent).toContain('salga tu pedido');

    TestBed.resetTestingModule();
    const cita = await montar('off', { kind: 'appointment' });
    expect(cita.el.querySelector('.gavisos__title')?.textContent).toContain('mi cita');
    expect(cita.el.textContent).toContain('quede lista');
    expect(cita.el.textContent).not.toContain('pedido');
  });

  it('apagado: ofrece activarlos, sin pedir cuenta', async () => {
    const { el } = await montar('off');
    expect(boton(el)?.textContent?.trim()).toBe('Activar avisos');
    expect(el.textContent).toContain('No necesitas cuenta');
  });

  it('activarlos llama al servicio con el pedido, avisa y cambia el botón', async () => {
    const { fixture, el } = await montar('off');

    boton(el)!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(enableForGuest).toHaveBeenCalledWith({ kind: 'order', id: ID });
    expect(toast.show).toHaveBeenCalledWith('Listo: te avisaremos aquí cuando tu pedido cambie.');
    expect(boton(el)?.textContent?.trim()).toBe('Desactivar');
  });

  it('activarlos en una cita llama al servicio con la cita y lo dice como cita', async () => {
    const { fixture, el } = await montar('off', { kind: 'appointment' });

    boton(el)!.click();
    await fixture.whenStable();

    expect(enableForGuest).toHaveBeenCalledWith({ kind: 'appointment', id: ID });
    expect(toast.show).toHaveBeenCalledWith('Listo: te avisaremos aquí cuando tu cita cambie.');
  });

  it('desactivarlos llama al servicio con el pedido', async () => {
    const { fixture, el } = await montar('on');

    boton(el)!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(disableForGuest).toHaveBeenCalledWith({ kind: 'order', id: ID });
    expect(toast.show).toHaveBeenCalledWith('Avisos desactivados para este pedido.');
    expect(boton(el)?.textContent?.trim()).toBe('Activar avisos');
  });

  it('si no sale, muestra el motivo que dio el servicio', async () => {
    const { fixture, el } = await montar('off');
    enableForGuest.mockResolvedValue({ ok: false, message: 'Este pedido ya termino: no va a cambiar de estado.' });

    boton(el)!.click();
    await fixture.whenStable();

    expect(toast.show).toHaveBeenCalledWith('Este pedido ya termino: no va a cambiar de estado.', 'error');
  });

  it('bloqueado: lo explica y no ofrece botón', async () => {
    const { el } = await montar('blocked');
    expect(el.textContent).toContain('Bloqueaste');
    expect(boton(el)).toBeNull();
  });

  it('iPhone sin instalar: explica que falta instalar la app', async () => {
    const { el } = await montar('needs-install');
    expect(el.textContent).toContain('Agregar a pantalla de inicio');
    expect(boton(el)).toBeNull();
  });
});
