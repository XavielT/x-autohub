import { TestBed } from '@angular/core/testing';
import { DocumentSheet } from './document-sheet';
import { BusinessDocument, EMPTY_BUSINESS_PROFILE } from '../../models/business-document.model';

describe('DocumentSheet con varios vehículos', () => {
  const line = (uid: string, description: string, unitPrice: number, vehicle?: number) => ({
    uid, section: '', tbd: false, kind: 'servicio' as const, description, quantity: 1, unitPrice, ...(vehicle !== undefined && { vehicle }),
  });

  function doc(over: Partial<BusinessDocument> = {}): BusinessDocument {
    const now = new Date();
    return {
      id: 'd', kind: 'factura', number: 1, code: 'FAC-0001', template: 'diagnostico', status: 'emitida',
      customerName: 'Ana', customerPhone: '', customerEmail: '', customerRnc: '', customerId: null,
      vehicle: { text: 'Jetta 2012', plate: 'A1', mileage: '', vin: '', verdict: '' },
      extraVehicles: [{ text: 'Civic 2015', plate: 'B2', mileage: '', vin: '', verdict: '' }],
      issueDate: '2026-11-26', validUntil: null,
      items: [line('a', 'Diagnóstico Jetta', 1000, 0), line('b', 'Diagnóstico Civic', 1500, 1), line('c', 'Traslado', 200)],
      discountType: 'amount', discountValue: 0, applyItbis: false, itbisRate: 18, paid: 0, payments: [], notes: '', terms: '',
      sourceId: null, subtotal: 2700, itbis: 0, total: 2700, createdAt: now, updatedAt: now, ...over,
    } as BusinessDocument;
  }

  function montar(d: BusinessDocument) {
    const fixture = TestBed.createComponent(DocumentSheet);
    fixture.componentRef.setInput('doc', d);
    fixture.componentRef.setInput('profile', EMPTY_BUSINESS_PROFILE);
    fixture.detectChanges();
    return { c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('lista los dos vehículos y separa las líneas con el subtotal de cada uno', () => {
    const { c, el } = montar(doc());
    expect(el.querySelector('.ds__vehicle')?.textContent).toContain('Jetta 2012');
    expect(el.querySelector('.ds__vehicle')?.textContent).toContain('Civic 2015');
    expect(c.groups().map((g) => [g.title, g.subtotal])).toEqual([
      ['Jetta 2012 · A1', 1000],
      ['Civic 2015 · B2', 1500],
      ['General', 200],
    ]);
    expect(el.textContent).toContain('Subtotal · Civic 2015 · B2');
  });

  it('un documento de un solo vehículo se ve como siempre', () => {
    const { c, el } = montar(doc({ extraVehicles: [] }));
    expect(c.multiVehicle()).toBe(false);
    expect(el.querySelector('.ds__vehicle h4')?.textContent).toContain('Vehículo');
    expect(c.groups()).toHaveLength(1);
  });
});
