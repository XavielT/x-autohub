import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Avisos } from './avisos';
import { PushService, PushState } from '../../../../shared/services/push.service';
import { ToastService } from '../../../../shared/services/toast.service';

describe('Avisos (activar los avisos push)', () => {
  const toast = { show: vi.fn() };
  const enable = vi.fn();
  const disable = vi.fn();
  const refresh = vi.fn();

  function montar(initial: PushState) {
    toast.show.mockClear();
    const state = signal<PushState>(initial);
    refresh.mockReset().mockResolvedValue(undefined);
    enable.mockReset().mockImplementation(async () => {
      state.set('on');
      return { ok: true };
    });
    disable.mockReset().mockImplementation(async () => {
      state.set('off');
      return { ok: true };
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: PushService, useValue: { state, refresh, enable, disable } },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(Avisos);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lee el estado real del dispositivo al abrirse', () => {
    montar('off');
    expect(refresh).toHaveBeenCalled();
  });

  it('donde no se pueden activar no pinta nada', () => {
    const { el } = montar('unsupported');
    expect(el.querySelector('.avisos')).toBeNull();
  });

  it('apagado: ofrece "Activar avisos"', () => {
    const { el } = montar('off');
    expect(el.querySelector('.avisos__btn')?.textContent?.trim()).toBe('Activar avisos');
    expect(el.querySelector('.avisos__btn')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('activarlos llama al servicio y lo confirma', async () => {
    const { fixture, el } = montar('off');

    el.querySelector<HTMLButtonElement>('.avisos__btn')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(enable).toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('Listo: te avisaremos aquí.');
    expect(el.querySelector('.avisos__btn')?.textContent?.trim()).toBe('Desactivar');
  });

  it('desactivarlos los quita del dispositivo', async () => {
    const { fixture, el } = montar('on');

    el.querySelector<HTMLButtonElement>('.avisos__btn')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(disable).toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('Avisos desactivados en este dispositivo.');
    expect(el.querySelector('.avisos__btn')?.textContent?.trim()).toBe('Activar avisos');
  });

  it('si no se pudo, muestra el motivo y no cambia de estado', async () => {
    const { fixture, el } = montar('off');
    enable.mockResolvedValue({ ok: false, message: 'No pudimos activar los avisos. Intenta de nuevo.' });

    el.querySelector<HTMLButtonElement>('.avisos__btn')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(toast.show).toHaveBeenCalledWith('No pudimos activar los avisos. Intenta de nuevo.', 'error');
    expect(el.querySelector('.avisos__btn')?.textContent?.trim()).toBe('Activar avisos');
  });

  it('bloqueado: explica cómo desbloquear y no ofrece botón', () => {
    const { el } = montar('blocked');
    expect(el.querySelector('.avisos__desc')?.textContent).toContain('configuración');
    expect(el.querySelector('.avisos__btn')).toBeNull();
  });

  it('en iPhone sin instalar: explica que hay que instalar la app y no ofrece botón', () => {
    const { el } = montar('needs-install');
    expect(el.querySelector('.avisos__desc')?.textContent).toContain('pantalla de inicio');
    expect(el.querySelector('.avisos__btn')).toBeNull();
  });
});
