import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PedidoAvisos } from './pedido-avisos';
import { AuthService } from '../../../../shared/services/auth.service';
import { PushService, PushState } from '../../../../shared/services/push.service';
import { ToastService } from '../../../../shared/services/toast.service';

describe('PedidoAvisos (avisos de un pedido de invitado)', () => {
  const ORDER = '11111111-1111-4111-8111-111111111111';
  const toast = { show: vi.fn() };
  const enableForOrder = vi.fn();
  const disableForOrder = vi.fn();
  const orderState = vi.fn();

  async function montar(initial: PushState, options: { logged?: boolean } = {}) {
    toast.show.mockClear();
    let state = initial;
    orderState.mockReset().mockImplementation(async () => state);
    enableForOrder.mockReset().mockImplementation(async () => {
      state = 'on';
      return { ok: true };
    });
    disableForOrder.mockReset().mockImplementation(async () => {
      state = 'off';
      return { ok: true };
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: PushService, useValue: { orderState, enableForOrder, disableForOrder } },
        { provide: AuthService, useValue: { user: signal(options.logged ? { id: 'u-1' } : null) } },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(PedidoAvisos);
    fixture.componentRef.setInput('orderId', ORDER);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const boton = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.pavisos__btn');

  it('lee el estado de ESTE pedido al abrirse', async () => {
    await montar('off');
    expect(orderState).toHaveBeenCalledWith(ORDER);
  });

  it('donde no se pueden activar no pinta nada', async () => {
    const { el } = await montar('unsupported');
    expect(el.querySelector('.pavisos')).toBeNull();
  });

  it('quien tiene sesión no ve nada: sus avisos están en el perfil', async () => {
    const { el } = await montar('off', { logged: true });
    expect(el.querySelector('.pavisos')).toBeNull();
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

    expect(enableForOrder).toHaveBeenCalledWith(ORDER);
    expect(toast.show).toHaveBeenCalledWith('Listo: te avisaremos aquí cuando tu pedido cambie.');
    expect(boton(el)?.textContent?.trim()).toBe('Desactivar');
  });

  it('desactivarlos llama al servicio con el pedido', async () => {
    const { fixture, el } = await montar('on');

    boton(el)!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(disableForOrder).toHaveBeenCalledWith(ORDER);
    expect(boton(el)?.textContent?.trim()).toBe('Activar avisos');
  });

  it('si no sale, muestra el motivo que dio el servicio', async () => {
    const { fixture, el } = await montar('off');
    enableForOrder.mockResolvedValue({ ok: false, message: 'Este pedido ya termino: no va a cambiar de estado.' });

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
