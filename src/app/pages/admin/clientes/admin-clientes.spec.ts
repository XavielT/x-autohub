import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AdminClientes } from './admin-clientes';
import { BusinessCustomerService } from '../../../../shared/services/business-customer.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { BusinessDocumentService } from '../../../../shared/services/business-document.service';
import { draftFromTemplate } from '../../../../shared/utils/document-templates';

describe('AdminClientes (/admin/clientes)', () => {
  const toast = { show: vi.fn() };
  const input = (value: string) => ({ target: { value } }) as unknown as Event;

  beforeEach(() => {
    localStorage.clear();
    toast.show.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: ToastService, useValue: toast }, provideRouter([])],
    });
  });

  afterEach(() => localStorage.clear());

  async function montar(seed = true) {
    if (seed) {
      const service = TestBed.inject(BusinessCustomerService);
      await firstValueFrom(
        service.save({ id: null, name: 'José Pérez', phone: '809-555-0134', email: 'jose@ejemplo.com', rnc: '131-12345-6', address: '', notes: '', vehicles: [{ text: 'Corolla', plate: 'B999', mileage: '', vin: '' }] }),
      );
      await firstValueFrom(
        service.save({ id: null, name: 'Ana Lora', phone: '829-111-2222', email: 'ana@lora.do', rnc: '', address: '', notes: '', vehicles: [] }),
      );
    }
    const fixture = TestBed.createComponent(AdminClientes);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('lista a los clientes guardados', async () => {
    const { el } = await montar();
    expect(el.textContent).toContain('José Pérez');
    expect(el.textContent).toContain('Ana Lora');
  });

  it('sin clientes dice cómo empezar', async () => {
    const { el } = await montar(false);
    expect(el.textContent).toContain('Todavía no hay clientes');
  });

  it('busca por nombre, por RNC, por teléfono y por correo', async () => {
    const { c } = await montar();
    const names = () => c.shown().map((x) => x.name);

    c.setQuery(input('lora'));
    expect(names()).toEqual(['Ana Lora']);

    c.setQuery(input('131-12345'));
    expect(names()).toEqual(['José Pérez']);

    c.setQuery(input('5550134'));
    expect(names()).toEqual(['José Pérez']);

    c.setQuery(input('ana@lora'));
    expect(names()).toEqual(['Ana Lora']);

    c.setQuery(input('zzz'));
    expect(names()).toEqual([]);

    c.clearQuery();
    expect(names()).toHaveLength(2);
  });

  it('dice cuántos coinciden y avisa cuando ninguno', async () => {
    const { fixture, c, el } = await montar();
    c.setQuery(input('jose'));
    fixture.detectChanges();
    expect(el.textContent).toContain('1 de 2');

    c.setQuery(input('nadie'));
    fixture.detectChanges();
    expect(el.textContent).toContain('Ningún cliente coincide');
  });

  it('crea un cliente nuevo con sus vehículos', async () => {
    const { fixture, c } = await montar(false);
    c.startNew();
    c.setText('name', input('Marta Díaz'));
    c.setText('rnc', input('001-9999999-1'));
    c.addVehicle();
    c.setVehicle(0, 'text', input('Honda Civic 2019'));
    c.setVehicle(0, 'plate', input('H123'));
    c.save();
    await fixture.whenStable();

    expect(c.draft()).toBeNull();
    expect(c.customers()).toHaveLength(1);
    expect(c.customers()[0].vehicles[0]).toMatchObject({ text: 'Honda Civic 2019', plate: 'H123' });
  });

  it('el vehículo se elige del catálogo (marca, modelo, año) y se guarda con sus ids', async () => {
    const { fixture, c } = await montar(false);
    c.startNew();
    c.setText('name', input('Marta Díaz'));
    c.addVehicle();
    c.setVehiclePick(0, { text: 'Toyota Corolla 2018', makeId: 1, modelId: 3, modelText: '', year: 2018 });
    c.setVehicle(0, 'plate', input('H123'));
    c.save();
    await fixture.whenStable();

    expect(c.customers()[0].vehicles[0]).toMatchObject({
      text: 'Toyota Corolla 2018',
      plate: 'H123',
      makeId: 1,
      modelId: 3,
      year: 2018,
    });

    // Al volver a editarlo, el selector arranca con lo elegido.
    c.edit(c.customers()[0]);
    expect(c.draft()!.vehicles[0]).toMatchObject({ makeId: 1, modelId: 3, year: 2018 });
  });

  it('un vehículo escrito a mano no guarda ids vacíos', async () => {
    const { fixture, c } = await montar(false);
    c.startNew();
    c.setText('name', input('Pedro'));
    c.addVehicle();
    c.setVehiclePick(0, { text: 'Camión Hino 2010', makeId: null, modelId: null, modelText: '', year: null });
    c.save();
    await fixture.whenStable();

    const v = c.customers()[0].vehicles[0];
    expect(v.text).toBe('Camión Hino 2010');
    expect('makeId' in v).toBe(false);
  });

  it('quitar un vehículo no mezcla los demás: cada fila conserva su id y sus datos', async () => {
    const { fixture, c, el } = await montar(false);
    c.startNew();
    c.addVehicle();
    c.addVehicle();
    c.addVehicle();
    c.setVehiclePick(0, { text: 'Primero', makeId: null, modelId: null, modelText: '', year: null });
    c.setVehiclePick(1, { text: 'Segundo', makeId: null, modelId: null, modelText: '', year: null });
    c.setVehiclePick(2, { text: 'Tercero', makeId: null, modelId: null, modelText: '', year: null });
    fixture.detectChanges();
    const uids = c.draft()!.vehicles.map((v) => v.uid);
    expect(new Set(uids).size).toBe(3);

    // Cada fila arranca con SU vehículo (los selectores se crean con el valor de su fila).
    c.removeVehicle(0);
    fixture.detectChanges();

    expect(c.draft()!.vehicles.map((v) => v.text)).toEqual(['Segundo', 'Tercero']);
    expect(c.draft()!.vehicles.map((v) => v.uid)).toEqual([uids[1], uids[2]]);
    // Y en pantalla: los dos selectores que quedan son los de esas filas, no los de las anteriores.
    const ids = Array.from(el.querySelectorAll('.cl__vehicle app-vehicle-pick input[id$="-make"]')).map((i) => i.id);
    expect(ids).toEqual([`cv${uids[1]}-make`, `cv${uids[2]}-make`]);
  });

  it('editar un cliente le da a cada vehículo su id, y el id no se guarda', async () => {
    const { fixture, c } = await montar(false);
    c.startNew();
    c.setText('name', input('Marta'));
    c.addVehicle();
    c.setVehiclePick(0, { text: 'Kia Rio 2020', makeId: null, modelId: null, modelText: '', year: null });
    c.save();
    await fixture.whenStable();

    expect('uid' in c.customers()[0].vehicles[0]).toBe(false);
    c.edit(c.customers()[0]);
    expect(c.draft()!.vehicles[0].uid).toBeTruthy();
  });

  it('sin nombre no guarda y lo dice', async () => {
    const { fixture, c } = await montar(false);
    c.startNew();
    c.save();
    await fixture.whenStable();
    expect(c.customers()).toHaveLength(0);
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('nombre'), 'error');
  });

  it('edita a un cliente: los cambios quedan guardados', async () => {
    const { fixture, c } = await montar();
    const jose = c.customers().find((x) => x.name === 'José Pérez')!;
    c.edit(jose);
    c.setText('phone', input('849 000 0000'));
    c.removeVehicle(0);
    c.save();
    await fixture.whenStable();

    const after = c.customers().find((x) => x.id === jose.id)!;
    expect(after.phone).toBe('849 000 0000');
    expect(after.vehicles).toEqual([]);
    expect(c.customers()).toHaveLength(2);
  });

  it('borrar pide una segunda pulsación', async () => {
    const { fixture, c } = await montar();
    const ana = c.customers().find((x) => x.name === 'Ana Lora')!;

    c.askDelete(ana);
    expect(c.pendingDelete()).toBe(ana.id);
    expect(c.customers()).toHaveLength(2);

    c.askDelete(ana);
    await fixture.whenStable();
    expect(c.customers().map((x) => x.name)).toEqual(['José Pérez']);
  });

  it('ofrece WhatsApp solo a quien tiene teléfono', async () => {
    const { c } = await montar();
    const jose = c.customers().find((x) => x.name === 'José Pérez')!;
    expect(c.whatsappLink(jose)).toContain('wa.me/18095550134');
    expect(c.whatsappLink({ ...jose, phone: '' })).toBe('');
  });

  describe('documentos de cada cliente', () => {
    /** Guarda un documento de un cliente; `over` ajusta lo que cada caso necesite. */
    async function documento(customerId: string, name: string, kind: 'cotizacion' | 'factura', over: Record<string, unknown> = {}, price = 1000) {
      const docs = TestBed.inject(BusinessDocumentService);
      const d = { ...draftFromTemplate('mecanica', kind, '2026-11-26'), customerName: name, customerId, ...over };
      d.items[0].description = 'Trabajo';
      d.items[0].unitPrice = price;
      return firstValueFrom(docs.save(d));
    }

    async function clienteConDocumentos(cantidad = 2) {
      const customers = TestBed.inject(BusinessCustomerService);
      const c = await firstValueFrom(customers.save({ id: null, name: 'Constructora SD', phone: '809-975-7642', email: '', rnc: '', address: '', notes: '', vehicles: [] }));
      const creados = [];
      for (let i = 0; i < cantidad; i++) creados.push(await documento(c.id, c.name, 'cotizacion', {}, 1000 * (i + 1)));
      return { cliente: c, creados };
    }

    async function montarCon(cantidad: number) {
      const seed = await clienteConDocumentos(cantidad);
      const env = await montar(false);
      return { ...env, ...seed };
    }

    it('el filtro "con saldo por cobrar" deja solo a quien debe, el que más debe primero', async () => {
      const customers = TestBed.inject(BusinessCustomerService);
      const deudor = await firstValueFrom(customers.save({ id: null, name: 'Deudor Grande', phone: '', email: '', rnc: '', address: '', notes: '', vehicles: [] }));
      const chico = await firstValueFrom(customers.save({ id: null, name: 'Deudor Chico', phone: '', email: '', rnc: '', address: '', notes: '', vehicles: [] }));
      await firstValueFrom(customers.save({ id: null, name: 'Al Dia', phone: '', email: '', rnc: '', address: '', notes: '', vehicles: [] }));
      await documento(chico.id, chico.name, 'factura', { status: 'emitida' }, 500);
      await documento(deudor.id, deudor.name, 'factura', { status: 'emitida' }, 3000);

      const { fixture, c, el } = await montar(false);
      expect(c.owing()).toEqual({ count: 2, total: 3500 });

      c.toggleOwing();
      fixture.detectChanges();
      expect(c.shown().map((x) => x.name)).toEqual(['Deudor Grande', 'Deudor Chico']);
      expect(el.textContent).toContain('Con saldo por cobrar (2');

      c.clearQuery();
      expect(c.onlyOwing()).toBe(false);
      expect(c.shown()).toHaveLength(3);
    });

    it('un cliente sin documentos lo dice', async () => {
      const { el } = await montar();
      expect(el.textContent).toContain('Todavía no tiene');
    });

    it('lista los documentos de cada cliente con su código, tipo, fecha, estado y total', async () => {
      const { el } = await montarCon(2);
      const rows = Array.from(el.querySelectorAll('.cl__doc'));
      expect(rows).toHaveLength(2);
      const text = rows.map((r) => r.textContent!.replace(/\s+/g, ' '));
      expect(text.join(' ')).toContain('COT-0001');
      expect(text.join(' ')).toContain('COT-0002');
      expect(text.join(' ')).toContain('26/11/2026');
      expect(text.join(' ')).toContain('Borrador');
      expect(text.join(' ')).toContain('RD$ 2,000.00');
    });

    it('cada documento es un enlace que lo abre en Documentos', async () => {
      const { el, creados } = await montarCon(1);
      const link = el.querySelector('a.cl__doc') as HTMLAnchorElement;
      expect(link.getAttribute('href')).toContain('/admin/documentos');
      expect(link.getAttribute('href')).toContain(`abrir=${creados[0].id}`);
      expect(link.getAttribute('aria-label')).toBe('Abrir Cotización COT-0001');
    });

    it('hay un enlace para abrir todos los documentos del cliente filtrados', async () => {
      const { el, cliente } = await montarCon(1);
      const all = Array.from(el.querySelectorAll('a')).find((a) => a.textContent!.includes('Abrir en Documentos')) as HTMLAnchorElement;
      expect(all.getAttribute('href')).toContain(`filtrar=${cliente.id}`);
    });

    it('muestra los 3 más recientes y despliega el resto con "Ver los N documentos"', async () => {
      const { fixture, c, el } = await montarCon(5);
      expect(el.querySelectorAll('.cl__doc')).toHaveLength(3);
      expect(el.textContent).toContain('Ver los 5 documentos');

      c.toggleAllDocs(c.customers()[0]);
      fixture.detectChanges();
      expect(el.querySelectorAll('.cl__doc')).toHaveLength(5);
      expect(el.textContent).toContain('Ver menos');

      c.toggleAllDocs(c.customers()[0]);
      fixture.detectChanges();
      expect(el.querySelectorAll('.cl__doc')).toHaveLength(3);
    });

    it('resume cuántos documentos tiene, cuánto se le facturó y cuánto debe', async () => {
      const customers = TestBed.inject(BusinessCustomerService);
      const cliente = await firstValueFrom(customers.save({ id: null, name: 'Constructora SD', phone: '', email: '', rnc: '', address: '', notes: '', vehicles: [] }));
      await documento(cliente.id, cliente.name, 'cotizacion', {}, 500);
      await documento(cliente.id, cliente.name, 'factura', { status: 'emitida', payments: [{ id: 'a', date: '2026-11-26', amount: 1000, method: 'efectivo', note: '' }] }, 4000);
      await documento(cliente.id, cliente.name, 'factura', { status: 'pagada', payments: [{ id: 'b', date: '2026-11-26', amount: 2000, method: 'efectivo', note: '' }] }, 2000);
      await documento(cliente.id, cliente.name, 'factura', { status: 'borrador' }, 9000);
      const { c, el } = await montar(false);

      expect(c.statsOf(c.customers()[0])).toEqual({ count: 4, quotes: 1, invoices: 3, billed: 6000, owed: 3000 });
      expect(el.textContent).toContain('Facturado RD$ 6,000.00');
      expect(el.textContent).toContain('Por cobrar RD$ 3,000.00');
    });

    it('una cotización que ya tiene factura se ve "Facturada"; la factura, con su propio estado', async () => {
      const customers = TestBed.inject(BusinessCustomerService);
      const cliente = await firstValueFrom(customers.save({ id: null, name: 'Constructora SD', phone: '', email: '', rnc: '', address: '', notes: '', vehicles: [] }));
      const cot = await documento(cliente.id, cliente.name, 'cotizacion', { status: 'aceptada' });
      const fac = await documento(cliente.id, cliente.name, 'factura', { sourceId: cot.id, status: 'emitida' });
      const { c } = await montar(false);

      expect(c.statusLabelOf(cot)).toBe('Facturada');
      expect(c.statusLabelOf(fac)).toBe('Emitida');
    });

    it('si la factura se anula, la cotización deja de verse Facturada', async () => {
      const customers = TestBed.inject(BusinessCustomerService);
      const cliente = await firstValueFrom(customers.save({ id: null, name: 'Constructora SD', phone: '', email: '', rnc: '', address: '', notes: '', vehicles: [] }));
      const cot = await documento(cliente.id, cliente.name, 'cotizacion', { status: 'aceptada' });
      await documento(cliente.id, cliente.name, 'factura', { sourceId: cot.id, status: 'anulada' });
      const { c } = await montar(false);

      expect(c.statusLabelOf(cot)).toBe('Aceptada');
    });
  });
});
