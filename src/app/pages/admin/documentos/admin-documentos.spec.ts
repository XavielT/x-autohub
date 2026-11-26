import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

import { AdminDocumentos } from './admin-documentos';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../../shared/services/toast.service';
import { BusinessDocumentService } from '../../../../shared/services/business-document.service';
import { draftFromTemplate } from '../../../../shared/utils/document-templates';

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

  it('arma secciones a su manera: crear, renombrar, mover líneas y quitar', async () => {
    const { c } = await montar();
    c.pickTemplate('general');
    expect(c.sectionTitles()).toEqual(['Chequeo', 'Trabajos', 'Repuestos']);

    c.addSection('Aire acondicionado');
    expect(c.target()).toBe('Aire acondicionado');
    c.addLine('servicio', 'Recarga de gas', 3000);

    // Una línea pasa de sección y las líneas siguen el orden de las secciones.
    c.addSection('Repuestos');
    c.addLine('repuesto', 'Bomba de agua', 4500);
    const bomba = c.draft()!.items.find((i) => i.description === 'Bomba de agua')!;
    c.setLineSection(bomba.uid, input('Aire acondicionado'));
    expect(c.grouped().find((g) => g.title === 'Aire acondicionado')?.lines).toHaveLength(2);

    c.renameSectionTo('Aire acondicionado', input('A/C'));
    expect(c.sectionTitles()).toContain('A/C');
    expect(c.draft()!.items.every((i) => i.section !== 'Aire acondicionado')).toBe(true);

    c.moveSectionBy('A/C', -1);
    const titles = c.sectionTitles();
    expect(titles.indexOf('A/C')).toBeLessThan(titles.indexOf('Repuestos'));
  });

  it('quitar una sección con líneas pide una segunda pulsación', async () => {
    const { c } = await montar();
    c.pickTemplate('mecanica');
    c.addLine('mano_de_obra', 'Cambio de pastillas', 1000);

    c.askRemoveSection('Mano de obra');
    expect(c.pendingRemove()).toBe('Mano de obra');
    expect(c.sectionTitles()).toContain('Mano de obra');

    c.askRemoveSection('Mano de obra');
    expect(c.sectionTitles()).not.toContain('Mano de obra');
    expect(c.draft()!.items.some((i) => i.section === 'Mano de obra')).toBe(false);
  });

  it('una sección vacía se quita sin pedir confirmación', async () => {
    const { c } = await montar();
    c.pickTemplate('mecanica');
    c.askRemoveSection('Repuestos');
    expect(c.sectionTitles()).toEqual(['Mano de obra']);
  });

  it('los subtotales por sección suman el total', async () => {
    const { c } = await montar();
    c.pickTemplate('general');
    c.addLine('servicio', 'Chequeo general del vehículo', 800);
    c.setTarget(input('Repuestos'));
    c.addLine('repuesto', 'Filtro', 1200);

    const subs = Object.fromEntries(c.grouped().map((g) => [g.title, g.subtotal]));
    expect(subs['Chequeo']).toBe(800);
    expect(subs['Repuestos']).toBe(1200);
    expect(c.totals()?.total).toBe(2000);
  });

  it('el papel muestra cada sección con su título y subtotal', async () => {
    const { fixture, c, el } = await montar();
    c.pickTemplate('general');
    c.addLine('servicio', 'Chequeo general del vehículo', 800);
    c.setTarget(input('Repuestos'));
    c.addLine('repuesto', 'Filtro', 1200);
    fixture.detectChanges();

    const paper = el.querySelector('.doc-sheet')!.textContent!;
    expect(paper).toContain('Chequeo');
    expect(paper).toContain('Repuestos');
    expect(paper).toContain('Subtotal · Chequeo');
  });

  it('la revisión pre-compra pide chasis y dictamen, y el dictamen sale en el papel', async () => {
    const { fixture, c, el } = await montar();
    c.startNew();
    c.pickTemplate('precompra');
    fixture.detectChanges();
    expect(el.textContent).toContain('Dictamen de la revisión');

    c.setVehicle('vin', input('JTDBR32E720012345'));
    c.setVerdict(input('aprobado'));
    fixture.detectChanges();

    const paper = el.querySelector('.doc-sheet')!.textContent!;
    expect(paper).toContain('Visto bueno');
    expect(paper).toContain('JTDBR32E720012345');
  });

  it('un cliente ya guardado se sugiere en el siguiente documento y rellena sus datos y su vehículo', async () => {
    const { fixture, c } = await montar();

    // Primer documento: se escriben todos los datos una sola vez.
    c.pickTemplate('mecanica');
    c.setText('customerName', input('Juan Pérez'));
    c.setText('customerPhone', input('809 555 0134'));
    c.setText('customerEmail', input('juan@ejemplo.com'));
    c.setText('customerRnc', input('001-1234567-8'));
    c.setVehicle('text', input('Volkswagen Jetta 2012'));
    c.setVehicle('plate', input('A123456'));
    c.setLineDescription(c.draft()!.items[0].uid, input('Cambio de pastillas'));
    c.save();
    await fixture.whenStable();
    c.backToList();

    // Documento nuevo: basta con escribir parte del nombre.
    c.startNew();
    c.pickTemplate('electrica');
    c.onCustomerFocus();
    c.setText('customerName', input('jua'));
    expect(c.customerMatches().map((m) => m.name)).toEqual(['Juan Pérez']);

    c.useCustomer(c.customerMatches()[0]);
    const d = c.draft()!;
    expect([d.customerName, d.customerPhone, d.customerEmail, d.customerRnc]).toEqual([
      'Juan Pérez',
      '809 555 0134',
      'juan@ejemplo.com',
      '001-1234567-8',
    ]);
    expect(d.vehicle.text).toBe('Volkswagen Jetta 2012');
    expect(d.vehicle.plate).toBe('A123456');
    // Ya elegido, no se vuelve a sugerir a sí mismo.
    expect(c.customerMatches()).toEqual([]);
  });

  it('al guardar, el cliente queda en la tabla y el documento vinculado a él; el siguiente se sugiere por RNC o correo', async () => {
    const { fixture, c } = await montar();
    c.pickTemplate('mecanica');
    c.setText('customerName', input('Marta Díaz'));
    c.setText('customerEmail', input('marta@ejemplo.com'));
    c.setText('customerRnc', input('001-9999999-1'));
    c.setLineDescription(c.draft()!.items[0].uid, input('Revisión'));
    c.save();
    await fixture.whenStable();

    expect(c.customers()).toHaveLength(1);
    expect(c.saved()?.customerId).toBe(c.customers()[0].id);

    // Otro documento: se la encuentra escribiendo su RNC o su correo.
    c.backToList();
    c.pickTemplate('general');
    c.onCustomerFocus();
    c.setText('customerName', input('99999'));
    expect(c.customerMatches().map((m) => m.name)).toEqual(['Marta Díaz']);
    c.setText('customerName', input('marta@'));
    expect(c.customerMatches().map((m) => m.name)).toEqual(['Marta Díaz']);
  });

  it('guardar dos documentos del mismo cliente no lo duplica en la tabla', async () => {
    const { fixture, c } = await montar();
    for (const name of ['Pedro Gil', 'pedro  GIL']) {
      c.backToList();
      c.pickTemplate('mecanica');
      c.setText('customerName', input(name));
      c.setLineDescription(c.draft()!.items[0].uid, input('Revisión'));
      c.save();
      await fixture.whenStable();
    }
    expect(c.customers()).toHaveLength(1);
    expect(c.documents()).toHaveLength(2);
  });

  it('cambiar el nombre a mano suelta al cliente elegido y no pisa un vehículo ya escrito', async () => {
    const { fixture, c } = await montar();
    c.pickTemplate('mecanica');
    c.setText('customerName', input('Ana Lora'));
    c.setVehicle('text', input('Kia Rio'));
    c.setLineDescription(c.draft()!.items[0].uid, input('Revisión'));
    c.save();
    await fixture.whenStable();
    c.backToList();

    c.pickTemplate('mecanica');
    c.setVehicle('text', input('Honda Civic'));
    c.useCustomer(c.customers()[0]);
    expect(c.draft()!.vehicle.text).toBe('Honda Civic');
    expect(c.pickedCustomer()).not.toBeNull();

    c.setText('customerName', input('Otra persona'));
    expect(c.pickedCustomer()).toBeNull();
  });

  it('una línea a determinar no suma, sale como "A determinar" en el papel y avisa en el total', async () => {
    const { fixture, c, el } = await montar();
    c.pickTemplate('mecanica');
    c.setLineDescription(c.draft()!.items[0].uid, input('Cambio de pastillas'));
    c.setLineNumber(c.draft()!.items[0].uid, 'unitPrice', input('2500'));

    c.addTbdLine('repuesto');
    const tbd = c.draft()!.items.find((i) => i.tbd)!;
    expect(tbd.description).toBe('Pieza a determinar');
    expect(tbd.unitPrice).toBe(0);

    expect(c.totals()?.total).toBe(2500);
    expect(c.totals()?.pending).toBe(1);

    fixture.detectChanges();
    const paper = el.querySelector('.doc-sheet')!.textContent!;
    expect(paper).toContain('A determinar');
    expect(paper).toContain('No incluye 1 concepto a determinar');
  });

  it('marcar una línea como a determinar le quita el precio, y desmarcarla la deja editable', async () => {
    const { c } = await montar();
    c.pickTemplate('mecanica');
    const uid = c.draft()!.items[0].uid;
    c.setLineDescription(uid, input('Reparación de caja'));
    c.setLineNumber(uid, 'unitPrice', input('8000'));

    c.setLineTbd(uid, input('', true));
    expect(c.draft()!.items[0]).toMatchObject({ tbd: true, unitPrice: 0 });

    c.setLineTbd(uid, input('', false));
    c.setLineNumber(uid, 'unitPrice', input('7500'));
    expect(c.draft()!.items[0]).toMatchObject({ tbd: false, unitPrice: 7500 });
    expect(c.totals()?.pending).toBe(0);
  });

  it('el vehículo del documento se elige del catálogo y el papel lo muestra', async () => {
    const { fixture, c, el } = await montar();
    c.pickTemplate('mecanica');
    c.pickVehicle({ text: 'Toyota Corolla 2018', makeId: 1, modelId: 3, modelText: '', year: 2018 });
    fixture.detectChanges();

    expect(c.draft()!.vehicle).toMatchObject({ text: 'Toyota Corolla 2018', makeId: 1, modelId: 3, year: 2018 });
    expect(el.querySelector('.doc-sheet')!.textContent).toContain('Toyota Corolla 2018');
    expect(el.querySelector('app-vehicle-pick')).not.toBeNull();
  });

  it('al elegir un cliente con vehículo, el selector del documento arranca con ese vehículo', async () => {
    const { fixture, c } = await montar();
    c.pickTemplate('mecanica');
    c.setText('customerName', input('Juan Pérez'));
    c.pickVehicle({ text: 'Toyota Corolla 2018', makeId: 1, modelId: 3, modelText: '', year: 2018 });
    c.setVehicle('plate', input('B999'));
    c.setLineDescription(c.draft()!.items[0].uid, input('Revisión'));
    c.save();
    await fixture.whenStable();
    c.backToList();

    c.pickTemplate('electrica');
    const antes = c.vehicleKey();
    c.useCustomer(c.customers()[0]);
    expect(c.draft()!.vehicle).toMatchObject({ text: 'Toyota Corolla 2018', plate: 'B999', makeId: 1, year: 2018 });
    expect(c.vehicleKey()).toBeGreaterThan(antes);
  });

  it('el chequeo no pide dictamen', async () => {
    const { fixture, c, el } = await montar();
    c.pickTemplate('chequeo');
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Dictamen de la revisión');
    expect(c.sectionTitles()).toEqual(['Chequeo']);
  });

  it('el área abierta arranca en la de la plantilla y cambia al tocar otra', async () => {
    const { c } = await montar();
    c.pickTemplate('mantenimiento');
    expect(c.activeArea().id).toBe('mantenimiento');
    c.setSuggestArea('mecanica');
    expect(c.activeArea().id).toBe('mecanica');
  });

  describe('de la cotización a la factura', () => {
    /** Una cotización guardada de un cliente, con una línea con precio y otra a determinar. */
    async function cotizacionGuardada(env: Awaited<ReturnType<typeof montar>>, status: 'borrador' | 'aceptada' = 'borrador') {
      const { fixture, c } = env;
      c.pickTemplate('mecanica');
      c.setText('customerName', input('Juan Pérez'));
      c.setText('customerPhone', input('809 555 0134'));
      c.setLineDescription(c.draft()!.items[0].uid, input('Cambio de pastillas'));
      c.setLineNumber(c.draft()!.items[0].uid, 'unitPrice', input('2500'));
      c.addTbdLine('repuesto');
      c.setStatus(input(status));
      c.save();
      await fixture.whenStable();
      return c.saved()!;
    }

    it('al marcar una cotización como aceptada, el sistema sugiere crear su factura', async () => {
      const env = await montar();
      const quote = await cotizacionGuardada(env);
      env.c.backToList();

      expect(env.c.suggestInvoice()).toBeNull();
      env.c.changeStatus(env.c.documents()[0], input('aceptada'));
      expect(env.c.suggestInvoice()?.code).toBe(quote.code);
      expect(env.c.suggestInvoice()?.status).toBe('aceptada');
    });

    it('también la sugiere al guardar una cotización que ya está aceptada', async () => {
      const env = await montar();
      const quote = await cotizacionGuardada(env, 'aceptada');
      expect(env.c.suggestInvoice()?.id).toBe(quote.id);
    });

    it('no sugiere con otros estados, ni para una factura', async () => {
      const env = await montar();
      await cotizacionGuardada(env);
      env.c.backToList();
      env.c.changeStatus(env.c.documents()[0], input('enviada'));
      expect(env.c.suggestInvoice()).toBeNull();
    });

    it('crear la factura copia cliente, secciones y líneas, y la deja como borrador ligada a la cotización', async () => {
      const env = await montar();
      const quote = await cotizacionGuardada(env, 'aceptada');

      env.c.toInvoice(env.c.suggestInvoice()!);
      const d = env.c.draft()!;
      expect(env.c.view()).toBe('edit');
      expect(env.c.suggestInvoice()).toBeNull();
      expect(d).toMatchObject({ id: null, kind: 'factura', status: 'borrador', sourceId: quote.id, customerName: 'Juan Pérez', customerId: quote.customerId, paid: 0, validUntil: new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10) });
      expect(d.items.map((i) => i.description)).toEqual(['Cambio de pastillas', 'Pieza a determinar']);
      expect(d.items[1].tbd).toBe(true);
      expect(env.c.saved()).toBeNull();
    });

    it('al guardar la factura, la cotización y la factura se muestran enlazadas', async () => {
      const env = await montar();
      const quote = await cotizacionGuardada(env, 'aceptada');
      env.c.toInvoice(quote);
      env.c.setLineNumber(env.c.draft()!.items[1].uid, 'unitPrice', input('1800'));
      env.c.setLineTbd(env.c.draft()!.items[1].uid, { target: { checked: false } } as unknown as Event);
      env.c.setLineNumber(env.c.draft()!.items[1].uid, 'unitPrice', input('1800'));
      env.c.save();
      await env.fixture.whenStable();

      const invoice = env.c.saved()!;
      expect(invoice.code).toBe('FAC-0001');
      expect(invoice.sourceId).toBe(quote.id);
      expect(env.c.invoiceOf(quote)?.id).toBe(invoice.id);
      expect(env.c.quoteOf(invoice)?.id).toBe(quote.id);
      expect(env.c.sourceQuote()?.id).toBe(quote.id);
    });

    it('una cotización que ya tiene factura no se factura dos veces: abre la que existe', async () => {
      const env = await montar();
      const quote = await cotizacionGuardada(env, 'aceptada');
      env.c.toInvoice(quote);
      env.c.setLineTbd(env.c.draft()!.items[1].uid, { target: { checked: false } } as unknown as Event);
      env.c.save();
      await env.fixture.whenStable();
      const invoice = env.c.saved()!;
      env.c.backToList();

      // Ya no se sugiere, y "Crear factura" lleva a la factura existente.
      env.c.changeStatus(env.c.documents().find((d) => d.kind === 'cotizacion')!, input('aceptada'));
      expect(env.c.suggestInvoice()).toBeNull();
      env.c.toInvoice(quote);
      expect(env.c.draft()!.id).toBe(invoice.id);
      expect(env.c.draft()!.kind).toBe('factura');
      expect(env.c.documents().filter((d) => d.kind === 'factura')).toHaveLength(1);
    });

    it('una factura emitida con conceptos a determinar no se guarda y dice por qué', async () => {
      const env = await montar();
      const quote = await cotizacionGuardada(env, 'aceptada');
      env.c.toInvoice(quote);
      env.c.setStatus(input('emitida'));
      env.c.save();
      await env.fixture.whenStable();

      expect(env.c.saved()).toBeNull();
      expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('a determinar'), 'error');
    });

    /** Facturada una cotización: crea su factura (con la pieza a determinar ya con precio) y la guarda. */
    async function facturar(env: Awaited<ReturnType<typeof montar>>, quote: Awaited<ReturnType<typeof cotizacionGuardada>>) {
      env.c.toInvoice(quote);
      env.c.setLineTbd(env.c.draft()!.items[1].uid, { target: { checked: false } } as unknown as Event);
      env.c.setLineNumber(env.c.draft()!.items[1].uid, 'unitPrice', input('1800'));
      env.c.save();
      await env.fixture.whenStable();
      return env.c.saved()!;
    }

    const tarjeta = (env: Awaited<ReturnType<typeof montar>>, code: string) =>
      Array.from(env.el.querySelectorAll('.tl__list > li')).find((li) => li.querySelector('.dc__code')?.textContent?.trim() === code) as HTMLElement;

    it('una cotización con factura se ve "Facturada" en la lista, sin selector de estado', async () => {
      const env = await montar();
      const quote = await cotizacionGuardada(env, 'aceptada');
      await facturar(env, quote);
      env.c.backToList();
      env.fixture.detectChanges();

      expect(env.c.isInvoiced(quote)).toBe(true);
      const card = tarjeta(env, quote.code);
      expect(card.querySelector('.dc__billed')?.textContent).toContain('Facturada');
      expect(card.querySelector('select')).toBeNull();
    });

    it('la factura nunca se ve como "Facturada": ese estado es de la cotización', async () => {
      const env = await montar();
      const quote = await cotizacionGuardada(env, 'aceptada');
      const invoice = await facturar(env, quote);
      env.c.backToList();
      env.fixture.detectChanges();

      expect(env.c.isInvoiced(invoice)).toBe(false);
      expect(tarjeta(env, invoice.code).querySelector('.dc__billed')).toBeNull();
      expect(tarjeta(env, invoice.code).querySelector('select')).not.toBeNull();
    });

    it('si la factura se anula, la cotización vuelve sola a su estado anterior', async () => {
      const env = await montar();
      const quote = await cotizacionGuardada(env, 'aceptada');
      const invoice = await facturar(env, quote);
      env.c.backToList();

      env.c.changeStatus(env.c.documents().find((d) => d.id === invoice.id)!, input('anulada'));
      env.fixture.detectChanges();

      expect(env.c.isInvoiced(quote)).toBe(false);
      const card = tarjeta(env, quote.code);
      expect(card.querySelector('.dc__billed')).toBeNull();
      expect((card.querySelector('select') as HTMLSelectElement).value).toBe('aceptada');
    });

    it('en el editor, una cotización facturada muestra "Facturada · FAC-0001" en lugar del selector de estado', async () => {
      const env = await montar();
      const quote = await cotizacionGuardada(env, 'aceptada');
      const invoice = await facturar(env, quote);
      env.c.backToList();
      env.c.open(env.c.documents().find((d) => d.id === quote.id)!);
      env.fixture.detectChanges();

      expect(env.c.invoiceOfEditing()?.id).toBe(invoice.id);
      expect(env.el.querySelector('.dc__billed--field')?.textContent).toContain(`Facturada · ${invoice.code}`);
      expect(env.el.querySelector('select[name="status"]')).toBeNull();
    });

    it('el filtro "Por facturar" muestra solo las cotizaciones aceptadas que aún no tienen factura', async () => {
      const env = await montar();
      await cotizacionGuardada(env, 'borrador');
      env.c.backToList();
      const aceptada = await (async () => {
        env.c.pickTemplate('mecanica');
        env.c.setText('customerName', input('Ana Lora'));
        env.c.setLineDescription(env.c.draft()!.items[0].uid, input('Revisión'));
        env.c.setLineNumber(env.c.draft()!.items[0].uid, 'unitPrice', input('900'));
        env.c.setStatus(input('aceptada'));
        env.c.save();
        await env.fixture.whenStable();
        return env.c.saved()!;
      })();
      const facturada = await (async () => {
        env.c.backToList();
        env.c.pickTemplate('mecanica');
        env.c.setText('customerName', input('Pedro Gil'));
        env.c.setLineDescription(env.c.draft()!.items[0].uid, input('Frenos'));
        env.c.setLineNumber(env.c.draft()!.items[0].uid, 'unitPrice', input('700'));
        env.c.setStatus(input('aceptada'));
        env.c.save();
        await env.fixture.whenStable();
        const q = env.c.saved()!;
        env.c.toInvoice(q);
        env.c.save();
        await env.fixture.whenStable();
        return q;
      })();
      env.c.backToList();
      env.fixture.detectChanges();

      expect(env.c.toInvoiceCount()).toBe(1);
      env.c.setFilter('porFacturar');
      expect(env.c.visible().map((d) => d.id)).toEqual([aceptada.id]);
      expect(env.c.visible().some((d) => d.id === facturada.id)).toBe(false);
      env.fixture.detectChanges();
      expect(env.el.textContent).toContain('Por facturar (1)');
    });

    it('descartar el aviso lo quita sin crear nada', async () => {
      const env = await montar();
      await cotizacionGuardada(env, 'aceptada');
      env.c.dismissSuggestion();
      expect(env.c.suggestInvoice()).toBeNull();
      expect(env.c.documents().filter((d) => d.kind === 'factura')).toHaveLength(0);
    });
  });

  describe('cobros de una factura', () => {
    /** Una factura de 5,000 ya emitida y guardada. */
    async function facturaEmitida(env: Awaited<ReturnType<typeof montar>>, status: 'borrador' | 'emitida' = 'emitida') {
      const { fixture, c } = env;
      c.startNew();
      c.setPickKind('factura');
      c.pickTemplate('venta');
      c.setText('customerName', input('Juan Pérez'));
      c.setText('customerPhone', input('809 555 0134'));
      c.setLineDescription(c.draft()!.items[0].uid, input('Disco de freno'));
      c.setLineNumber(c.draft()!.items[0].uid, 'unitPrice', input('5000'));
      c.setStatus(input(status));
      c.save();
      await fixture.whenStable();
      return c.saved()!;
    }

    function abonar(c: Awaited<ReturnType<typeof montar>>['c'], monto: string, fecha = '2026-11-26', metodo = 'transferencia', nota = '') {
      c.setPayDate(input(fecha));
      c.setPayAmount(input(monto));
      c.setPayMethod(input(metodo));
      c.setPayNote(input(nota));
      c.addPayment();
    }

    it('un borrador no se cobra: primero se emite', async () => {
      const env = await montar();
      await facturaEmitida(env, 'borrador');
      expect(env.c.canPay()).toBe(false);
      abonar(env.c, '1000');
      expect(env.c.draft()!.payments).toEqual([]);
    });

    it('un abono parcial se guarda con su fecha y deja el saldo pendiente', async () => {
      const env = await montar();
      await facturaEmitida(env);
      expect(env.c.canPay()).toBe(true);

      abonar(env.c, '2000', '2026-11-10', 'efectivo', 'adelanto');
      await env.fixture.whenStable();

      const saved = env.c.documents()[0];
      expect(saved.payments).toHaveLength(1);
      expect(saved.payments[0]).toMatchObject({ date: '2026-11-10', amount: 2000, method: 'efectivo', note: 'adelanto' });
      expect(saved.paid).toBe(2000);
      expect(saved.status).toBe('emitida');
      expect(env.c.owedOf(saved)).toBe(3000);
      expect(env.c.totals()?.balance).toBe(3000);
      expect(env.c.paidOn()).toBeNull();
    });

    it('al cobrar todo el saldo la factura pasa a Pagada y registra el día de pago', async () => {
      const env = await montar();
      await facturaEmitida(env);
      abonar(env.c, '2000', '2026-11-10');
      abonar(env.c, '3000', '2026-11-25');
      await env.fixture.whenStable();

      const saved = env.c.documents()[0];
      expect(saved.paid).toBe(5000);
      expect(saved.status).toBe('pagada');
      expect(env.c.paidOnOf(saved)).toBe('2026-11-25');
      expect(env.c.paidOn()).toBe('2026-11-25');
      expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('Pagada'));
    });

    it('"Todo el saldo" llena el monto con lo pendiente', async () => {
      const env = await montar();
      await facturaEmitida(env);
      abonar(env.c, '1500');
      env.c.payAll();
      expect(env.c.payAmount()).toBe('3500');
    });

    it('no acepta un abono mayor que lo pendiente ni sin fecha ni en cero', async () => {
      const env = await montar();
      await facturaEmitida(env);

      abonar(env.c, '5000.01');
      expect(toast.show).toHaveBeenLastCalledWith(expect.stringContaining('mayor que lo pendiente'), 'error');
      abonar(env.c, '0');
      expect(toast.show).toHaveBeenLastCalledWith(expect.stringContaining('más de cero'), 'error');
      abonar(env.c, '100', '');
      expect(toast.show).toHaveBeenLastCalledWith(expect.stringContaining('fecha'), 'error');
      expect(env.c.draft()!.payments).toEqual([]);
    });

    it('quitar un abono pide confirmar y, si ya estaba pagada, la regresa a Emitida', async () => {
      const env = await montar();
      await facturaEmitida(env);
      abonar(env.c, '5000');
      await env.fixture.whenStable();
      expect(env.c.documents()[0].status).toBe('pagada');

      const id = env.c.draft()!.payments[0].id;
      env.c.removePayment(id);
      expect(env.c.pendingPaymentRemove()).toBe(id);
      expect(env.c.draft()!.payments).toHaveLength(1);

      env.c.removePayment(id);
      await env.fixture.whenStable();
      expect(env.c.documents()[0].payments).toEqual([]);
      expect(env.c.documents()[0].status).toBe('emitida');
      expect(env.c.documents()[0].paid).toBe(0);
    });

    it('una factura anulada no se cobra', async () => {
      const env = await montar();
      await facturaEmitida(env);
      env.c.setStatus(input('anulada'));
      expect(env.c.canPay()).toBe(false);
    });

    it('las cuentas por cobrar suman lo pendiente de las facturas emitidas, y no de las pagadas', async () => {
      const env = await montar();
      await facturaEmitida(env);
      abonar(env.c, '1500');
      await env.fixture.whenStable();
      expect(env.c.receivable()).toEqual({ total: 3500, count: 1 });

      abonar(env.c, '3500');
      await env.fixture.whenStable();
      expect(env.c.receivable()).toEqual({ total: 0, count: 0 });
    });

    it('la hoja muestra los pagos recibidos y el sello de Pagada', async () => {
      const env = await montar();
      await facturaEmitida(env);
      abonar(env.c, '5000', '2026-11-25', 'transferencia', 'ref 991');
      await env.fixture.whenStable();
      env.fixture.detectChanges();

      const paper = (env.el.querySelector('.doc-sheet') as HTMLElement).textContent!;
      expect(paper).toContain('Pagos recibidos');
      expect(paper).toContain('Transferencia');
      expect(paper).toContain('ref 991');
      expect(paper).toContain('Pagada');
      expect(paper).toContain('25/11/2026');
    });

    it('la hoja pinta el pendiente en rojo solo si hay saldo; saldada dice "Saldado" y no en rojo', async () => {
      const env = await montar();
      await facturaEmitida(env);
      abonar(env.c, '1500');
      await env.fixture.whenStable();
      env.fixture.detectChanges();

      const row = () => env.el.querySelector('.doc-sheet .ds__balance') as HTMLElement;
      expect(row().textContent).toContain('3,500.00');
      expect(row().classList.contains('ds__balance--settled')).toBe(false);

      abonar(env.c, '3500');
      await env.fixture.whenStable();
      env.fixture.detectChanges();
      expect(row().textContent).toContain('Saldado');
      expect(row().textContent).not.toContain('0.00');
      expect(row().classList.contains('ds__balance--settled')).toBe(true);
    });

    it('en la lista, cada factura dice cuánto se cobró y cuánto falta', async () => {
      const env = await montar();
      await facturaEmitida(env);
      abonar(env.c, '1000');
      await env.fixture.whenStable();
      env.c.backToList();
      env.fixture.detectChanges();

      const text = (env.el as HTMLElement).textContent!;
      expect(text).toContain('Cobrado RD$ 1,000.00');
      expect(text).toContain('Pendiente RD$ 4,000.00');
      expect(text).toContain('Por cobrar');
    });
  });

  describe('enlaces desde /admin/clientes (abrir y filtrar)', () => {
    /** Un documento ya guardado, escrito directo en el almacén simulado (así no hace falta usar `inject` antes de fijar la ruta). */
    function semilla(id: string, kind: 'cotizacion' | 'factura', number: number, customerName: string, customerId: string) {
      const now = '2026-11-26T12:00:00.000Z';
      return {
        id, kind, number, code: `${kind === 'factura' ? 'FAC' : 'COT'}-${String(number).padStart(4, '0')}`, template: 'mecanica', status: 'borrador',
        customerName, customerPhone: '', customerEmail: '', customerRnc: '', customerId,
        vehicle: { text: '', plate: '', mileage: '', vin: '', verdict: '' },
        issueDate: '2026-11-26', validUntil: null,
        items: [{ uid: 'l' + id, section: '', tbd: false, kind: 'servicio', description: 'Trabajo', quantity: 1, unitPrice: 1000 }],
        discountType: 'amount', discountValue: 0, applyItbis: false, itbisRate: 18, paid: 0, payments: [], notes: '', terms: '', sourceId: null,
        subtotal: 1000, itbis: 0, total: 1000, createdAt: now, updatedAt: now,
      };
    }

    /** Monta la página como si se llegara con esos parámetros (`?abrir=`, `?filtrar=`). */
    async function montarConParams(params: Record<string, string>, docs: ReturnType<typeof semilla>[] = []) {
      localStorage.setItem('x-autohub.business-documents', JSON.stringify(docs));
      TestBed.overrideProvider(ActivatedRoute, { useValue: { snapshot: { queryParamMap: convertToParamMap(params) } } });
      const fixture = TestBed.createComponent(AdminDocumentos);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
    }

    const dosClientes = () => [
      semilla('doc-a', 'cotizacion', 1, 'Constructora SD', 'cli-a'),
      semilla('doc-b', 'cotizacion', 2, 'Ana Lora', 'cli-b'),
    ];

    it('?abrir=<id> abre ese documento directamente en el editor', async () => {
      const { c } = await montarConParams({ abrir: 'fac-1' }, [semilla('fac-1', 'factura', 1, 'Juan', 'cli-x')]);
      expect(c.view()).toBe('edit');
      expect(c.saved()?.code).toBe('FAC-0001');
      expect(c.draft()?.customerName).toBe('Juan');
    });

    it('?abrir con un documento que ya no existe lo dice y deja la lista', async () => {
      const { c } = await montarConParams({ abrir: 'no-existe' }, dosClientes());
      expect(c.view()).toBe('list');
      expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('No encontramos ese documento'), 'error');
    });

    it('?filtrar=<id de cliente> muestra solo los documentos de ese cliente y lo avisa', async () => {
      const { fixture, c, el } = await montarConParams({ filtrar: 'cli-a' }, dosClientes());
      fixture.detectChanges();

      expect(c.visible().map((d) => d.id)).toEqual(['doc-a']);
      expect(el.querySelector('.dc__filterbar')?.textContent).toContain('Constructora SD');
    });

    it('"Ver todos" quita el filtro', async () => {
      const { fixture, c, el } = await montarConParams({ filtrar: 'cli-a' }, dosClientes());
      c.clearCustomerFilter();
      fixture.detectChanges();

      expect(c.visible()).toHaveLength(2);
      expect(el.querySelector('.dc__filterbar')).toBeNull();
    });

    it('un cliente sin documentos lo dice en vez de mostrar la lista vacía de siempre', async () => {
      const { el } = await montarConParams({ filtrar: 'cli-sin-docs' }, dosClientes());
      expect(el.textContent).toContain('Este cliente todavía no tiene documentos.');
    });
  });

  describe('más de un vehículo en el mismo documento', () => {
    async function conDosVehiculos() {
      const env = await montar();
      env.c.startNew();
      env.c.pickTemplate('mecanica');
      env.c.addLine('servicio', 'Cambio de pastillas');
      env.c.addVehicle();
      env.fixture.detectChanges();
      return env;
    }

    it('agregar otro vehículo muestra su formulario y deja asignar cada línea', async () => {
      const { c, el } = await conDosVehiculos();
      expect(c.draft()?.extraVehicles).toHaveLength(1);
      expect(el.textContent).toContain('Vehículo 2');
      expect(el.querySelector('.dc__line-vehicle')).not.toBeNull();
      expect(c.vehicleChoices().map((v) => v.label)).toEqual(['Vehículo 1', 'Vehículo 2']);
    });

    it('sin vehículos extra no sale el selector de vehículo en las líneas', async () => {
      const { c, el } = await montar();
      c.startNew();
      c.pickTemplate('mecanica');
      expect(el.querySelector('.dc__line-vehicle')).toBeNull();
    });

    it('cada línea se asigna a su vehículo, y volver a general quita la asignación', async () => {
      const { fixture, c } = await conDosVehiculos();
      const uid = c.draft()!.items[0].uid;
      c.setLineVehicle(uid, input('1'));
      expect(c.draft()!.items[0].vehicle).toBe(1);
      c.setLineVehicle(uid, input(''));
      fixture.detectChanges();
      expect(c.draft()!.items[0].vehicle).toBeUndefined();
    });

    it('con varios vehículos el editor se divide en un bloque por vehículo, cada uno con su subtotal', async () => {
      const { fixture, c, el } = await conDosVehiculos();
      c.addLineToVehicle(0);
      c.addLineToVehicle(1);
      const [l0, l1] = c.draft()!.items.filter((i) => !i.description);
      c.draft.update((d) => ({ ...d!, items: d!.items.map((i) => (i.uid === l0.uid ? { ...i, description: 'A', unitPrice: 100 } : i.uid === l1.uid ? { ...i, description: 'B', unitPrice: 250 } : i)) }));
      fixture.detectChanges();

      const bloques = el.querySelectorAll('.dc__veh');
      expect(bloques.length).toBeGreaterThanOrEqual(2);
      expect(c.vehicleGroups().map((g) => g.subtotal).slice(0, 2)).toEqual([expect.any(Number), 250]);
      expect(c.vehicleGroups()[0].lines.every((l) => l.vehicle === 0 || l.vehicle === undefined)).toBe(true);
    });

    it('lo que se agrega sin elegir bloque cae en el vehículo elegido arriba', async () => {
      const { c } = await conDosVehiculos();
      c.setVehicleTarget(input('1'));
      c.addLine('servicio', 'Alineación', 500);

      const nueva = c.draft()!.items.find((i) => i.description === 'Alineación')!;
      expect(nueva.vehicle).toBe(1);
    });

    it('subir y bajar solo cambia de lugar entre las líneas de su vehículo y resalta la que se movió', async () => {
      const { c } = await conDosVehiculos();
      c.draft.update((d) => ({
        ...d!,
        items: [
          { ...d!.items[0], uid: 'a', description: 'A', vehicle: 0 },
          { ...d!.items[0], uid: 'x', description: 'X', vehicle: 1 },
          { ...d!.items[0], uid: 'b', description: 'B', vehicle: 0 },
        ],
      }));

      c.moveLineBy('b', -1);

      expect(c.draft()!.items.map((i) => i.uid)).toEqual(['b', 'x', 'a']);
      expect(c.flashUid()).toBe('b');
    });

    it('al tocar un número se selecciona todo, para escribir encima del 0', async () => {
      const { c } = await montar();
      const select = vi.fn();
      c.selectAll({ target: { select } } as unknown as Event);
      expect(select).toHaveBeenCalled();
    });

    it('quitar un vehículo deja sus líneas como generales y recorre las de los siguientes', async () => {
      const { c } = await conDosVehiculos();
      c.addVehicle();
      c.addLine('servicio', 'Alineación');
      const [l1, l2] = c.draft()!.items;
      c.setLineVehicle(l1.uid, input('1'));
      c.setLineVehicle(l2.uid, input('2'));

      c.removeVehicle(0);

      expect(c.draft()!.extraVehicles).toHaveLength(1);
      expect(c.draft()!.items.find((i) => i.uid === l1.uid)!.vehicle).toBeUndefined();
      expect(c.draft()!.items.find((i) => i.uid === l2.uid)!.vehicle).toBe(1);
    });
  });

  describe('facturas vencidas', () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const dia = (n: number) => new Date(Date.parse(hoy) + n * 86_400_000).toISOString().slice(0, 10);

    function factura(id: string, number: number, validUntil: string | null, over: Record<string, unknown> = {}) {
      const now = '2026-11-26T12:00:00.000Z';
      return {
        id, kind: 'factura', number, code: 'FAC-000' + number, template: 'mecanica', status: 'emitida',
        customerName: 'Ana Lora', customerPhone: '809-555-0134', customerEmail: '', customerRnc: '', customerId: null,
        vehicle: { text: '', plate: '', mileage: '', vin: '', verdict: '' }, issueDate: '2026-11-01', validUntil,
        items: [{ uid: 'l' + id, section: '', tbd: false, kind: 'servicio', description: 'Trabajo', quantity: 1, unitPrice: 1000 }],
        discountType: 'amount', discountValue: 0, applyItbis: false, itbisRate: 18, paid: 0, payments: [], notes: '', terms: '', sourceId: null,
        subtotal: 1000, itbis: 0, total: 1000, createdAt: now, updatedAt: now, ...over,
      };
    }

    async function montarCon(docs: ReturnType<typeof factura>[]) {
      localStorage.setItem('x-autohub.business-documents', JSON.stringify(docs));
      return montar();
    }

    it('avisa arriba cuántas facturas están vencidas y cuánto suman', async () => {
      const { el, c } = await montarCon([factura('a', 1, dia(-5)), factura('b', 2, dia(-1), { paid: 400 }), factura('c', 3, dia(3))]);
      expect(c.overdue()).toEqual({ count: 2, total: 1600 });
      expect(el.querySelector('.dc__overdue')?.textContent).toContain('2 facturas vencidas');
    });

    it('no avisa si nada está vencido', async () => {
      const { el } = await montarCon([factura('a', 1, dia(3)), factura('b', 2, null)]);
      expect(el.querySelector('.dc__overdue')).toBeNull();
    });

    it('el filtro Vencidas muestra solo esas', async () => {
      const { fixture, c } = await montarCon([factura('a', 1, dia(-5)), factura('b', 2, dia(3))]);
      c.setFilter('vencidas');
      fixture.detectChanges();
      expect(c.visible().map((d) => d.id)).toEqual(['a']);
    });

    it('la tarjeta dice hace cuántos días venció y ofrece recordar el cobro por WhatsApp', async () => {
      const { el } = await montarCon([factura('a', 1, dia(-5))]);
      expect(el.querySelector('.dc__late')?.textContent).toContain('Vencida hace 5 días');
      const link = Array.from(el.querySelectorAll('a')).find((a) => a.textContent!.includes('Recordar cobro')) as HTMLAnchorElement;
      expect(link.href).toContain('wa.me/18095550134');
      expect(decodeURIComponent(link.href)).toContain('FAC-0001');
    });

    it('una factura pagada o sin fecha no ofrece recordatorio', async () => {
      const { el } = await montarCon([factura('a', 1, dia(-5), { status: 'pagada', paid: 1000 }), factura('b', 2, null)]);
      expect(el.textContent).not.toContain('Recordar cobro');
    });

    it('una factura nueva trae vencimiento a 15 días y el editor deja cambiarlo', async () => {
      const { fixture, c, el } = await montar();
      c.startNew();
      c.setPickKind('factura');
      c.pickTemplate('mecanica');
      fixture.detectChanges();
      expect(c.draft()?.validUntil).toBe(dia(15));
      expect(el.querySelector('input[name="validUntil"]')).not.toBeNull();
      c.setText('validUntil', input(''));
      expect(c.draft()?.validUntil).toBeNull();
    });
  });
});
