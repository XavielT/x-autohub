import { TestBed } from '@angular/core/testing';

import { AdminPedidos } from './admin-pedidos';
import { ToastService } from '../../../../shared/services/toast.service';

/**
 * El panel de pedidos, contra el `AdminService` simulado (que hace cumplir el
 * mismo orden que `set_order_status()` en Postgres). Lo que fijan: que solo se
 * ofrezcan los pasos válidos, que una transición prohibida no pase, y que cancelar
 * pida una segunda confirmación.
 *
 * El mock trae cuatro pedidos: #1004 por transferencia con comprobante, #1003
 * pagado por envío, #1002 de retiro preparándose y #1001 por WhatsApp sin pagar.
 */
describe('AdminPedidos', () => {
  const toast = { show: vi.fn() };

  async function montar() {
    TestBed.configureTestingModule({ providers: [{ provide: ToastService, useValue: toast }] });
    const fixture = TestBed.createComponent(AdminPedidos);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  const order = (c: AdminPedidos, n: number) => c.orders().find((o) => o.orderNumber === n)!;

  beforeEach(() => toast.show.mockReset());

  it('lista los pedidos con su número y cuenta los que esperan pago y tienen comprobante', async () => {
    const { c, el } = await montar();

    expect(c.orders().length).toBe(4);
    expect(c.awaitingCount()).toBe(2);
    expect(c.withProofCount()).toBe(1);
    expect(el.querySelector('.adm-ord__lead')?.textContent).toContain('1 con comprobante por revisar');
    expect([...el.querySelectorAll('.adm-ord__ref')].map((e) => e.textContent)).toContain('#1004');
  });

  it('el pedido con comprobante pendiente se destaca', async () => {
    const { el } = await montar();

    expect(el.querySelectorAll('.adm-ord__item--attention').length).toBe(1);
  });

  it('filtra por estado y cada filtro cuenta cuántos hay', async () => {
    const { c, fixture, el } = await montar();

    c.setFilter('awaiting_payment');
    fixture.detectChanges();

    expect(c.filtered().map((o) => o.orderNumber).sort()).toEqual([1001, 1004]);
    expect([...el.querySelectorAll('.adm-ord__chip')].map((b) => b.textContent?.trim())).toContain('Esperando pago 2');
  });

  describe('qué botones se ofrecen', () => {
    it('esperando pago: confirmar el pago o cancelar, y nada de enviar', async () => {
      const { c } = await montar();

      expect(c.actionsFor(order(c, 1004)).map((a) => a.to)).toEqual(['paid', 'cancelled']);
    });

    it('un retiro preparándose ofrece "Listo para retirar", no "enviado"', async () => {
      const { c } = await montar();

      expect(c.actionsFor(order(c, 1002)).map((a) => a.to)).toEqual(['ready_for_pickup', 'cancelled']);
    });

    it('un envío pagado ofrece empezar a preparar', async () => {
      const { c } = await montar();

      expect(c.actionsFor(order(c, 1003)).map((a) => a.label)).toEqual(['Empezar a preparar', 'Cancelar el pedido']);
    });

    it('solo cancelar es destructivo', async () => {
      const { c } = await montar();

      expect(c.actionsFor(order(c, 1004)).map((a) => a.destructive)).toEqual([false, true]);
    });
  });

  describe('cambiar el estado', () => {
    it('confirmar el pago pasa el pedido a pagado y anota la nota en el historial', async () => {
      const { c } = await montar();
      const o = order(c, 1004);
      c.notes.set({ [o.id]: 'Transferencia verificada' });

      c.act(o, c.actionsFor(o)[0]);

      const after = order(c, 1004);
      expect(after.status).toBe('paid');
      expect(after.paymentConfirmedAt).toBeInstanceOf(Date);
      expect(after.history.at(-1)?.note).toBe('Transferencia verificada');
      expect(toast.show).toHaveBeenCalledWith('Pedido #1004: pagado.');
    });

    it('la nota se limpia después de usarla', async () => {
      const { c } = await montar();
      const o = order(c, 1004);
      c.notes.set({ [o.id]: 'algo' });

      c.act(o, c.actionsFor(o)[0]);

      expect(c.noteOf(o.id)).toBe('');
    });

    it('un paso que el pedido no puede dar se rechaza y avisa', async () => {
      const { c } = await montar();
      const o = order(c, 1004); // esperando pago

      c.act(o, { to: 'shipped', label: 'Marcar como enviado', destructive: false });

      expect(order(c, 1004).status).toBe('awaiting_payment');
      expect(toast.show).toHaveBeenCalledWith('Un pedido awaiting_payment no puede pasar a shipped.', 'error');
    });

    it('cancelar pide un segundo toque antes de hacerlo', async () => {
      const { c } = await montar();
      const o = order(c, 1004);
      const cancel = c.actionsFor(o).find((a) => a.destructive)!;

      c.act(o, cancel);
      expect(order(c, 1004).status).toBe('awaiting_payment');
      expect(c.confirmCancelId()).toBe(o.id);

      c.act(o, cancel);
      expect(order(c, 1004).status).toBe('cancelled');
      expect(c.confirmCancelId()).toBeNull();
    });

    it('un pedido entregado o cancelado ya no ofrece nada', async () => {
      const { c } = await montar();
      const o = order(c, 1004);
      const cancel = c.actionsFor(o).find((a) => a.destructive)!;
      c.act(o, cancel);
      c.act(o, cancel);

      expect(c.actionsFor(order(c, 1004))).toEqual([]);
    });
  });

  describe('comprobante', () => {
    it('lo pide por enlace firmado, y reconoce si es una imagen', async () => {
      const { c } = await montar();
      const o = order(c, 1004);

      expect(c.isImageProof(o.proofPath!)).toBe(true);
      expect(c.isImageProof(order(c, 1003).proofPath!)).toBe(false); // PDF

      c.viewProof(o);

      expect(c.proofUrls()[o.id]).toBeTruthy();
      expect(c.loadingProofId()).toBeNull();
    });

    it('un pedido sin comprobante no pide nada', async () => {
      const { c } = await montar();
      const o = order(c, 1001);

      c.viewProof(o);

      expect(c.proofUrls()[o.id]).toBeUndefined();
    });
  });

  it('arma el enlace de WhatsApp al cliente con su número de pedido', async () => {
    const { c } = await montar();

    const link = c.customerWhatsApp(order(c, 1004))!;

    expect(link).toContain('wa.me/18095550003');
    expect(decodeURIComponent(link)).toContain('#1004');
  });
});
