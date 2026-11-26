import { BusinessDocument } from '../models/business-document.model';
import { customerKey, customersFrom, searchCustomers } from './document-customers';

function doc(over: Partial<BusinessDocument> & { customerName: string; createdAt: Date }): BusinessDocument {
  return {
    id: over.customerName + over.createdAt.getTime(),
    kind: 'factura',
    number: 1,
    code: 'FAC-0001',
    template: 'mecanica',
    status: 'emitida',
    customerPhone: '',
    customerEmail: '',
    customerRnc: '',
    vehicle: { text: '', plate: '', mileage: '', vin: '', verdict: '' },
    issueDate: '2026-11-26',
    validUntil: null,
    items: [],
    discountType: 'amount',
    discountValue: 0,
    applyItbis: false,
    itbisRate: 18,
    paid: 0,
    notes: '',
    terms: '',
    sourceId: null,
    subtotal: 0,
    itbis: 0,
    total: 0,
    updatedAt: over.createdAt,
    ...over,
  };
}

const d = (day: number) => new Date(2026, 10, day);

describe('directorio de clientes', () => {
  it('"José  PÉREZ" y "jose perez" son el mismo cliente', () => {
    expect(customerKey('  José  PÉREZ ')).toBe(customerKey('jose perez'));
  });

  it('junta los documentos de un mismo cliente y cuenta cuántos tiene', () => {
    const list = customersFrom([
      doc({ customerName: 'Juan Pérez', createdAt: d(1) }),
      doc({ customerName: 'juan perez', createdAt: d(5) }),
      doc({ customerName: 'Ana', createdAt: d(3) }),
    ]);
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('juan perez');
    expect(list[0].documents).toBe(2);
  });

  it('vale lo más reciente, y lo que falta ahí se completa con documentos anteriores', () => {
    const [juan] = customersFrom([
      doc({ customerName: 'Juan', customerPhone: '809 555 0134', customerEmail: 'viejo@x.com', createdAt: d(1) }),
      doc({ customerName: 'Juan', customerPhone: '829 555 9999', createdAt: d(9) }),
    ]);
    expect(juan.phone).toBe('829 555 9999');
    expect(juan.email).toBe('viejo@x.com');
  });

  it('recuerda los vehículos distintos, sin repetir el mismo (por placa)', () => {
    const [juan] = customersFrom([
      doc({ customerName: 'Juan', createdAt: d(1), vehicle: { text: 'Jetta 2012', plate: 'A123456', mileage: '', vin: '', verdict: '' } }),
      doc({ customerName: 'Juan', createdAt: d(2), vehicle: { text: 'Jetta', plate: 'a123456', mileage: '90,000', vin: '', verdict: '' } }),
      doc({ customerName: 'Juan', createdAt: d(3), vehicle: { text: 'Corolla 2018', plate: 'B999', mileage: '', vin: '', verdict: '' } }),
    ]);
    expect(juan.vehicles.map((v) => v.plate)).toEqual(['B999', 'a123456']);
  });

  it('ignora documentos sin nombre de cliente', () => {
    expect(customersFrom([doc({ customerName: '   ', createdAt: d(1) })])).toEqual([]);
  });

  it('busca por nombre (sin acentos), por teléfono y por RNC', () => {
    const list = customersFrom([
      doc({ customerName: 'José Pérez', customerPhone: '809-555-0134', customerRnc: '131-12345-6', createdAt: d(2) }),
      doc({ customerName: 'Ana Lora', customerPhone: '829-111-2222', createdAt: d(1) }),
    ]);
    expect(searchCustomers(list, 'jose').map((c) => c.name)).toEqual(['José Pérez']);
    expect(searchCustomers(list, '5550134').map((c) => c.name)).toEqual(['José Pérez']);
    expect(searchCustomers(list, '12345').map((c) => c.name)).toEqual(['José Pérez']);
    expect(searchCustomers(list, 'zzz')).toEqual([]);
    expect(searchCustomers(list, '   ')).toEqual([]);
  });

  it('un teléfono con muy pocos dígitos no trae cualquier cosa', () => {
    const list = customersFrom([doc({ customerName: 'Ana', customerPhone: '829-111-2222', createdAt: d(1) })]);
    expect(searchCustomers(list, '82')).toEqual([]);
  });
});
