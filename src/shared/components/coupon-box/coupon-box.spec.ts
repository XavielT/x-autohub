import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { CouponBox } from './coupon-box';
import { AuthService } from '../../services/auth.service';
import { CouponValidation } from '../../models/coupon.model';

describe('CouponBox (el campo de cupón del checkout)', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user: signal(null) } }] });
  });

  afterEach(() => localStorage.clear());

  async function montar(inputs: { subtotal?: number; shipping?: number; email?: string } = {}) {
    const fixture = TestBed.createComponent(CouponBox);
    fixture.componentRef.setInput('subtotal', inputs.subtotal ?? 5000);
    fixture.componentRef.setInput('shipping', inputs.shipping ?? 450);
    fixture.componentRef.setInput('email', inputs.email ?? '');
    const emitted: (CouponValidation | null)[] = [];
    fixture.componentInstance.appliedChange.subscribe((v) => emitted.push(v));
    await settle(fixture);
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, emitted };
  }

  async function settle(fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const type = (el: HTMLElement, value: string) => {
    const input = el.querySelector<HTMLInputElement>('.cpn__input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('al principio solo muestra el campo, sin cupón ni errores', async () => {
    const { el } = await montar();

    expect(el.querySelector('.cpn__input')).not.toBeNull();
    expect(el.querySelector('.cpn__applied')).toBeNull();
    expect(el.querySelector('.cpn__error')).toBeNull();
  });

  it('aplicar un código válido enseña cuánto se ahorra y avisa al checkout', async () => {
    const { fixture, c, el, emitted } = await montar();

    c.code.set('bienvenido10');
    c.apply();
    await settle(fixture);

    expect(el.querySelector('.cpn__code')?.textContent).toBe('BIENVENIDO10');
    expect(el.querySelector('.cpn__saving')?.textContent).toContain('500');
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ code: 'BIENVENIDO10', discount: 500 });
    expect(el.querySelector('.cpn__input')).toBeNull();
  });

  it('un código que no existe dice el mensaje de la base y no avisa nada', async () => {
    const { fixture, c, el, emitted } = await montar();

    c.code.set('NOEXISTE');
    c.apply();
    await settle(fixture);

    expect(el.querySelector('.cpn__error')?.textContent).toContain('no existe o ya no está disponible');
    expect(emitted).toEqual([]);
    expect(el.querySelector('.cpn__applied')).toBeNull();
  });

  it('sin escribir nada pide el código, sin consultar', async () => {
    const { fixture, c, el } = await montar();

    c.apply();
    await settle(fixture);

    expect(el.querySelector('.cpn__error')?.textContent).toContain('Escribe el código');
  });

  it('el error se va al volver a escribir', async () => {
    const { fixture, c, el } = await montar();
    c.apply();
    await settle(fixture);
    expect(el.querySelector('.cpn__error')).not.toBeNull();

    type(el, 'BIEN');
    await settle(fixture);

    expect(el.querySelector('.cpn__error')).toBeNull();
  });

  it('Quitar vuelve al campo y avisa que ya no hay cupón', async () => {
    const { fixture, c, el, emitted } = await montar();
    c.code.set('BIENVENIDO10');
    c.apply();
    await settle(fixture);

    c.remove();
    await settle(fixture);

    expect(el.querySelector('.cpn__applied')).toBeNull();
    expect(el.querySelector<HTMLInputElement>('.cpn__input')?.value).toBe('');
    expect(emitted.at(-1)).toBeNull();
  });

  describe('con un cupón puesto, cambiar el carrito lo vuelve a probar', () => {
    it('si se actualiza el subtotal, el ahorro se recalcula', async () => {
      const { fixture, c, el, emitted } = await montar({ subtotal: 5000 });
      c.code.set('BIENVENIDO10');
      c.apply();
      await settle(fixture);

      fixture.componentRef.setInput('subtotal', 8000);
      await settle(fixture);

      expect(el.querySelector('.cpn__saving')?.textContent).toContain('800');
      expect(emitted.at(-1)).toMatchObject({ discount: 800 });
    });

    it('un envío gratis deja de valer al cambiar a retiro: se quita y se dice por qué', async () => {
      const { fixture, c, el, emitted } = await montar({ subtotal: 5000, shipping: 450 });
      c.code.set('ENVIOGRATIS');
      c.apply();
      await settle(fixture);
      expect(emitted.at(-1)).toMatchObject({ discount: 450 });

      fixture.componentRef.setInput('shipping', 0);
      await settle(fixture);

      expect(el.querySelector('.cpn__applied')).toBeNull();
      expect(el.querySelector('.cpn__error')?.textContent).toContain('Tu cupón ya no aplica');
      expect(emitted.at(-1)).toBeNull();
    });

    it('uno con compra mínima deja de valer si el subtotal baja', async () => {
      const { fixture, c, el, emitted } = await montar({ subtotal: 5000 });
      c.code.set('DESCUENTO500');
      c.apply();
      await settle(fixture);
      expect(emitted.at(-1)).toMatchObject({ discount: 500 });

      fixture.componentRef.setInput('subtotal', 1000);
      await settle(fixture);

      expect(el.querySelector('.cpn__error')?.textContent).toContain('compra de al menos RD$ 3,000');
      expect(emitted.at(-1)).toBeNull();
    });
  });
});
