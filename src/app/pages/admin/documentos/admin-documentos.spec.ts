import { TestBed } from '@angular/core/testing';

import { AdminDocumentos } from './admin-documentos';
import { ToastService } from '../../../../shared/services/toast.service';

describe('AdminDocumentos (/admin/documentos)', () => {
  const toast = { show: vi.fn() };
  const input = (value: string, checked = false) => ({ target: { value, checked } }) as unknown as Event;

  beforeEach(() => {
    localStorage.clear();
    toast.show.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: ToastService, useValue: toast }] });
  });

  afterEach(() => localStorage.clear());

  async function montar() {
    const fixture = TestBed.createComponent(AdminDocumentos);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('arranca con la lista vacía y ofrece crear el primero', async () => {
    const { el } = await montar();
    expect(el.textContent).toContain('Todavía no hay documentos');
  });

  it('elegir una plantilla abre el editor con sus condiciones y vigencia ya puestas', async () => {
    const { c } = await montar();
    c.startNew();
    c.pickTemplate('electrica');

    expect(c.view()).toBe('edit');
    expect(c.draft()?.template).toBe('electrica');
    expect(c.draft()?.terms).toContain('30 días');
    expect(c.draft()?.validUntil).not.toBeNull();
  });

  it('la plantilla de venta de piezas no pide vehículo', async () => {
    const { fixture, c, el } = await montar();
    c.startNew();
    c.pickTemplate('venta');
    fixture.detectChanges();

    expect(el.textContent).not.toContain('Marca, modelo y año');
  });

  it('un concepto frecuente agrega la línea sin precio, y una línea vacía se reutiliza', async () => {
    const { c } = await montar();
    c.pickTemplate('mantenimiento');
    c.addLine('servicio', 'Cambio de aceite y filtro');

    const items = c.draft()!.items;
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe('Cambio de aceite y filtro');
    expect(items[0].unitPrice).toBe(0);
  });

  it('guarda, muestra el código y la siguiente vez actualiza el mismo documento', async () => {
    const { fixture, c } = await montar();
    c.pickTemplate('mecanica');
    c.setText('customerName', input('Juan Pérez'));
    c.setText('customerPhone', input('809 555 0134'));
    c.setLineDescription(c.draft()!.items[0].uid, input('Cambio de pastillas'));
    c.setLineNumber(c.draft()!.items[0].uid, 'unitPrice', input('2500'));

    c.save();
    await fixture.whenStable();

    expect(c.saved()?.code).toBe('COT-0001');
    expect(c.totals()?.total).toBe(2500);
    expect(c.whatsappLink()).toContain('wa.me/18095550134');

    c.setText('customerName', input('Juan P.'));
    c.save();
    await fixture.whenStable();
    expect(c.documents()).toHaveLength(1);
  });

  it('sin cliente no guarda y lo dice', async () => {
    const { fixture, c } = await montar();
    c.pickTemplate('general');
    c.save();
    await fixture.whenStable();

    expect(c.saved()).toBeNull();
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('cliente'), 'error');
  });

  it('una misma factura mezcla áreas: chequeo, A/C y una pieza mecánica', async () => {
    const { c } = await montar();
    c.pickTemplate('general');
    c.addLine('servicio', 'Chequeo general del vehículo');

    c.setSuggestArea('electrica');
    expect(c.activeArea().label).toBe('Eléctrica y A/C');
    c.addLine('servicio', 'Recarga de gas del aire acondicionado');

    c.addLine('repuesto', 'Bomba de agua', 4500);

    const items = c.draft()!.items;
    expect(items.map((i) => i.description)).toEqual([
      'Chequeo general del vehículo',
      'Recarga de gas del aire acondicionado',
      'Bomba de agua',
    ]);
    expect(c.totals()?.total).toBe(4500);
  });

  it('el área abierta arranca en la de la plantilla y cambia al tocar otra', async () => {
    const { c } = await montar();
    c.pickTemplate('mantenimiento');
    expect(c.activeArea().id).toBe('mantenimiento');
    c.setSuggestArea('mecanica');
    expect(c.activeArea().id).toBe('mecanica');
  });
});
