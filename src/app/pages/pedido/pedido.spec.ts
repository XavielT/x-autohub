import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';

import { Pedido } from './pedido';
import { OrderService } from '../../../shared/services/order.service';
import { SiteSettingsService } from '../../../shared/services/site-settings.service';
import { ToastService } from '../../../shared/services/toast.service';
import { BankAccount, OrderView } from '../../../shared/models/order.model';

const VISTA: OrderView = {
  id: 'o-1',
  orderNumber: 1042,
  status: 'awaiting_payment',
  fulfillment: 'shipping',
  paymentMethodId: 'transfer',
  wantsInstallation: false,
  subtotal: 12050,
  shippingPrice: 450,
  total: 12500,
  createdAt: new Date('2026-10-23T14:00:00Z'),
  hasProof: false,
  whatsappOpenedAt: null,
  paymentConfirmedAt: null,
  installationServiceId: null,
  items: [
    { name: 'Disco ventilado', unitPrice: 6000, quantity: 2 },
    { name: 'Filtro de aire', unitPrice: 50, quantity: 1 },
  ],
  history: [{ fromStatus: null, toStatus: 'awaiting_payment', note: null, createdAt: new Date('2026-10-23T14:00:00Z') }],
};

const CUENTA: BankAccount = { bank: 'Banco Popular', holder: 'X AutoHub SRL', number: '789012345', type: 'Corriente', isExample: false };

describe('Pedido', () => {
  const getOrder = vi.fn();
  const uploadProof = vi.fn();
  const markWhatsAppOpened = vi.fn();
  const toast = { show: vi.fn() };

  function montar(options: { order?: OrderView | null; accounts?: BankAccount[]; id?: string } = {}) {
    getOrder.mockReturnValue(of(options.order === undefined ? VISTA : options.order));
    uploadProof.mockReturnValue(of(undefined));
    markWhatsAppOpened.mockReturnValue(of(undefined));

    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: options.id ?? 'o-1' })) } },
        { provide: OrderService, useValue: { getOrder, uploadProof, markWhatsAppOpened } },
        {
          provide: SiteSettingsService,
          useValue: {
            getBankAccounts: () => of(options.accounts ?? []),
            getPickupAddress: () => of({ address: 'Av. Principal 1', hours: 'L-V 8 a 5', isExample: false }),
          },
        },
        { provide: ToastService, useValue: toast },
      ],
    });

    const fixture = TestBed.createComponent(Pedido);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  const view = (over: Partial<OrderView>): OrderView => ({ ...VISTA, ...over });
  const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

  beforeEach(() => {
    getOrder.mockReset();
    uploadProof.mockReset();
    markWhatsAppOpened.mockReset();
    toast.show.mockReset();
  });

  it('muestra el número, el estado y lo que calculó el servicio', () => {
    const { el } = montar();

    expect(el.querySelector('.ped__num')?.textContent).toBe('#1042');
    expect(el.querySelector('.ped__status')?.textContent).toContain('Esperando pago');
    expect(text(el)).toMatch(/Subtotal\s*RD\$ 12,050/);
    expect(text(el)).toMatch(/Envío\s*RD\$ 450/);
    expect(text(el)).toMatch(/Total\s*RD\$ 12,500/);
  });

  it('pone el título de la pestaña con el número, y pide que no se indexe', () => {
    montar();

    expect(TestBed.inject(Title).getTitle()).toBe('Pedido #1042 | X AutoHub');
    expect(TestBed.inject(Meta).getTag("name='robots'")?.content).toBe('noindex');
  });

  it('un id que no existe dice que no lo encontró', () => {
    const { el } = montar({ order: null });

    expect(el.textContent).toContain('No encontramos este pedido');
  });

  it('si falla la lectura ofrece reintentar, sin perder el pedido', () => {
    getOrder.mockReturnValue(throwError(() => new Error('caido')));
    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'o-1' })) } },
        { provide: OrderService, useValue: { getOrder } },
        { provide: SiteSettingsService, useValue: { getBankAccounts: () => of([]), getPickupAddress: () => of(null) } },
      ],
    });
    const fixture = TestBed.createComponent(Pedido);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No pudimos cargar tu pedido');
  });

  describe('línea de tiempo', () => {
    const steps = (el: HTMLElement) =>
      [...el.querySelectorAll('.ped__step')].map((s) => `${s.getAttribute('data-state')}:${s.querySelector('.ped__step-label')?.textContent}`);

    it('esperando pago: el primer paso en curso', () => {
      const { el } = montar();

      expect(steps(el)).toEqual([
        'current:Esperando tu pago',
        'upcoming:Pago confirmado',
        'upcoming:Preparando tu pedido',
        'upcoming:Enviado',
        'upcoming:Entregado',
      ]);
    });

    it('pagado: el primero hecho y el segundo en curso', () => {
      const { el } = montar({ order: view({ status: 'paid' }) });

      expect(steps(el).slice(0, 2)).toEqual(['done:Esperando tu pago', 'current:Pago confirmado']);
    });

    it('un retiro termina en "Listo para retirar"', () => {
      const { el } = montar({ order: view({ status: 'ready_for_pickup', fulfillment: 'pickup' }) });

      expect(steps(el)).toContain('current:Listo para retirar');
      expect(steps(el).join()).not.toContain('Enviado');
    });

    it('entregado: todo hecho', () => {
      const { el } = montar({ order: view({ status: 'delivered' }) });

      expect(steps(el).every((s) => s.startsWith('done:'))).toBe(true);
    });

    it('cancelado: lo que recorrió y "Cancelado", sin pasos fantasma', () => {
      const { el } = montar({
        order: view({
          status: 'cancelled',
          history: [
            { fromStatus: null, toStatus: 'awaiting_payment', note: null, createdAt: new Date() },
            { fromStatus: 'awaiting_payment', toStatus: 'cancelled', note: 'No llegó el pago', createdAt: new Date() },
          ],
        }),
      });

      expect(steps(el)).toEqual(['done:Esperando tu pago', 'cancelled:Cancelado']);
      expect(el.textContent).toContain('No llegó el pago');
    });
  });

  describe('transferencia', () => {
    it('muestra el monto exacto y las cuentas reales, con su botón de copiar', () => {
      const { el } = montar({ accounts: [CUENTA] });

      expect(text(el)).toMatch(/Transfiere exactamente RD\$ 12,500/);
      expect(el.querySelector('.ped__acc-number')?.textContent).toBe('789012345');
      expect(el.querySelector('.ped__copy')).not.toBeNull();
    });

    it('sin cuentas reales no inventa ninguna: manda por los datos a WhatsApp', () => {
      const { el } = montar({ accounts: [] });

      expect(el.querySelector('.ped__account')).toBeNull();
      expect(el.textContent).toContain('Te enviamos los datos de la cuenta por WhatsApp');
    });

    it('ofrece subir el comprobante; ya subido, lo dice y deja subir otro', () => {
      const sin = montar();
      expect(sin.el.querySelector('label.ped__btn')?.textContent).toContain('Subir comprobante');
      TestBed.resetTestingModule();

      const con = montar({ order: view({ hasProof: true }) });
      expect(con.el.querySelector('.ped__ok')?.textContent).toContain('Recibimos tu comprobante');
      expect(con.el.querySelector('label.ped__btn')?.textContent).toContain('Subir otro comprobante');
    });

    it('subir un archivo lo manda con el id del pedido y vuelve a leer el estado', () => {
      const { fixture, c } = montar();
      const file = new File([new Uint8Array(10)], 'transferencia.png', { type: 'image/png' });
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file] });
      getOrder.mockClear();

      c.onProofSelected({ target: input } as unknown as Event);
      fixture.detectChanges();

      expect(uploadProof).toHaveBeenCalledWith('o-1', file);
      expect(toast.show).toHaveBeenCalledWith('Recibimos tu comprobante. Lo revisamos y confirmamos tu pago.');
      expect(getOrder).toHaveBeenCalledTimes(1);
      expect(c.isUploading()).toBe(false);
    });

    it('mientras sube, el botón queda deshabilitado y dice que está subiendo', () => {
      const { fixture, c, el } = montar();
      uploadProof.mockReturnValue(new (class { subscribe() { return { unsubscribe() {} }; } })());
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.png', { type: 'image/png' })] });

      c.onProofSelected({ target: input } as unknown as Event);
      fixture.detectChanges();

      expect(c.isUploading()).toBe(true);
      expect(el.querySelector('label.ped__btn')?.textContent).toContain('Subiendo');
      expect(el.querySelector<HTMLInputElement>('input[type=file]')?.disabled).toBe(true);
      expect(el.querySelector('[role=progressbar]')).not.toBeNull();
    });

    it('si el archivo no sirve, lo dice y deja volver a intentar', () => {
      const { fixture, c, el } = montar();
      uploadProof.mockReturnValue(throwError(() => new Error('El comprobante debe pesar menos de 10 MB.')));
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.png', { type: 'image/png' })] });

      c.onProofSelected({ target: input } as unknown as Event);
      fixture.detectChanges();

      expect(el.querySelector('.ped__error')?.textContent).toContain('menos de 10 MB');
      expect(c.isUploading()).toBe(false);
    });

    it('pagado: ya no pide comprobante, confirma el pago', () => {
      const { el } = montar({ order: view({ status: 'paid', hasProof: true }) });

      expect(el.querySelector('input[type=file]')).toBeNull();
      expect(el.textContent).toContain('Pago confirmado');
    });
  });

  describe('WhatsApp', () => {
    const whatsapp = view({ paymentMethodId: 'whatsapp' });

    it('el botón abre WhatsApp con el pedido ya escrito', () => {
      const { c, el } = montar({ order: whatsapp });

      const link = [...el.querySelectorAll<HTMLAnchorElement>('a.ped__btn')].find((a) => a.textContent?.includes('Abrir WhatsApp'));
      expect(link?.href).toContain('wa.me/18099539782');
      expect(decodeURIComponent(link!.href)).toContain('#1042');
      expect(c.whatsappLink()).toBe(link!.href);
    });

    it('tocarlo deja constancia en el pedido', () => {
      const { c } = montar({ order: whatsapp });

      c.onWhatsAppClick();

      expect(markWhatsAppOpened).toHaveBeenCalledWith('o-1');
    });

    it('no ofrece subir comprobante: es otro camino de pago', () => {
      const { el } = montar({ order: whatsapp });

      expect(el.querySelector('input[type=file]')).toBeNull();
    });

    it('si ya lo abrió, lo dice', () => {
      const { el } = montar({ order: view({ paymentMethodId: 'whatsapp', whatsappOpenedAt: new Date('2026-10-23T14:05:00Z') }) });

      expect(el.textContent).toContain('Abriste WhatsApp el');
    });
  });

  describe('instalación y retiro', () => {
    it('si pidió instalación, lo dice y lleva a /servicios con el servicio y el pedido', () => {
      const { el } = montar({ order: view({ wantsInstallation: true, installationServiceId: 7 }) });

      expect(el.textContent).toContain('Agenda la instalación');
      const link = [...el.querySelectorAll<HTMLAnchorElement>('a')].find((a) => a.textContent?.includes('Ver servicios'));
      expect(link?.getAttribute('href')).toBe('/servicios?service=7&order=o-1');
    });

    it('no ofrece instalación si no la pidió, ni en un pedido cancelado', () => {
      expect(montar().el.textContent).not.toContain('Agenda la instalación');
      TestBed.resetTestingModule();
      expect(montar({ order: view({ wantsInstallation: true, status: 'cancelled' }) }).el.textContent).not.toContain('Agenda la instalación');
    });

    it('un retiro muestra dónde retirar', () => {
      const { el } = montar({ order: view({ fulfillment: 'pickup' }) });

      expect(el.textContent).toContain('Retiro en el taller');
      expect(el.textContent).toContain('Av. Principal 1');
    });
  });
});
