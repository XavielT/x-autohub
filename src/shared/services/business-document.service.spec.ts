import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { BusinessDocumentService } from './business-document.service';
import { draftFromTemplate } from '../utils/document-templates';

describe('BusinessDocumentService (modo simulado)', () => {
  let service: BusinessDocumentService;

  beforeEach(() => {
    localStorage.clear();
    service = TestBed.inject(BusinessDocumentService);
  });

  afterEach(() => localStorage.clear());

  function draft(kind: 'cotizacion' | 'factura' = 'cotizacion') {
    const d = draftFromTemplate('mecanica', kind, '2026-11-26');
    d.customerName = 'Juan Pérez';
    d.items[0].description = 'Cambio de pastillas';
    d.items[0].quantity = 2;
    d.items[0].unitPrice = 1500;
    return d;
  }

  it('guarda con consecutivo por tipo y calcula los totales', async () => {
    const a = await firstValueFrom(service.save(draft()));
    const b = await firstValueFrom(service.save(draft()));
    const f = await firstValueFrom(service.save(draft('factura')));

    expect([a.code, b.code, f.code]).toEqual(['COT-0001', 'COT-0002', 'FAC-0001']);
    expect(a.subtotal).toBe(3000);
    expect(a.total).toBe(3000);
  });

  it('aplica ITBIS y descuento al total', async () => {
    const d = draft();
    d.applyItbis = true;
    d.discountValue = 300;
    const saved = await firstValueFrom(service.save(d));
    expect(saved.itbis).toBe(486);
    expect(saved.total).toBe(3186);
  });

  it('guardar con id actualiza el mismo documento y conserva su número', async () => {
    const first = await firstValueFrom(service.save(draft()));
    const edited = { ...draft(), id: first.id, customerName: 'Ana' };
    const second = await firstValueFrom(service.save(edited));

    expect(second.number).toBe(first.number);
    const all = await firstValueFrom(service.list());
    expect(all).toHaveLength(1);
    expect(all[0].customerName).toBe('Ana');
  });

  it('no deja guardar un documento sin cliente ni líneas', async () => {
    const d = draftFromTemplate('general', 'factura');
    await expect(firstValueFrom(service.save(d))).rejects.toThrow(/cliente/);
  });

  it('solo borra borradores; lo emitido se anula', async () => {
    const doc = await firstValueFrom(service.save(draft('factura')));
    await firstValueFrom(service.setStatus(doc, 'emitida'));
    const [issued] = await firstValueFrom(service.list());
    await expect(firstValueFrom(service.delete(issued))).rejects.toThrow(/borrador/);

    const draftDoc = await firstValueFrom(service.save(draft()));
    await firstValueFrom(service.delete(draftDoc));
    expect((await firstValueFrom(service.list())).map((d) => d.id)).toEqual([doc.id]);
  });

  it('guarda líneas a determinar sin precio y no suman al total', async () => {
    const d = draft();
    d.items.push({ ...d.items[0], uid: 'tbd1', description: 'Pieza a determinar', unitPrice: 9999, tbd: true });
    const saved = await firstValueFrom(service.save(d));

    const tbd = saved.items.find((i) => i.description === 'Pieza a determinar')!;
    expect(tbd.tbd).toBe(true);
    expect(tbd.unitPrice).toBe(0);
    expect(saved.total).toBe(3000);
    expect((await firstValueFrom(service.list()))[0].items.filter((i) => i.tbd)).toHaveLength(1);
  });

  it('la revisión pre-compra guarda el chasis y el dictamen', async () => {
    const d = draftFromTemplate('precompra', 'factura', '2026-11-26');
    d.customerName = 'Marta';
    d.items[0].description = 'Revisión pre-compra completa';
    d.items[0].unitPrice = 3500;
    d.vehicle = { text: 'Toyota Corolla 2018', plate: '', mileage: '60,000 km', vin: 'JTDBR32E720012345', verdict: 'aprobado' };

    const saved = await firstValueFrom(service.save(d));
    expect(saved.vehicle.verdict).toBe('aprobado');
    expect(saved.vehicle.vin).toBe('JTDBR32E720012345');
    expect(saved.template).toBe('precompra');
    expect((await firstValueFrom(service.list()))[0].vehicle.verdict).toBe('aprobado');
  });

  it('convertir una cotización en factura copia los datos y apunta a su origen', async () => {
    const quote = await firstValueFrom(service.save(draft()));
    const invoice = service.duplicate(quote, 'factura');

    expect(invoice.id).toBeNull();
    expect(invoice.kind).toBe('factura');
    expect(invoice.sourceId).toBe(quote.id);
    expect(invoice.items[0].description).toBe('Cambio de pastillas');
    expect(invoice.items[0].uid).not.toBe(quote.items[0].uid);
    expect(invoice.status).toBe('borrador');
  });
});
