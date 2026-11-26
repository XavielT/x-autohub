import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { BusinessCustomerService } from './business-customer.service';
import { CustomerDraft } from '../models/business-document.model';
import { draftFromTemplate } from '../utils/document-templates';

const draftOf = (over: Partial<CustomerDraft> = {}): CustomerDraft => ({
  id: null,
  name: 'Juan Pérez',
  phone: '809 555 0134',
  email: '',
  rnc: '',
  address: '',
  notes: '',
  vehicles: [],
  ...over,
});

describe('BusinessCustomerService (modo simulado)', () => {
  let service: BusinessCustomerService;

  beforeEach(() => {
    localStorage.clear();
    service = TestBed.inject(BusinessCustomerService);
  });

  afterEach(() => localStorage.clear());

  it('crea, lista por orden alfabético y conserva los datos', async () => {
    await firstValueFrom(service.save(draftOf({ name: 'Zoila' })));
    await firstValueFrom(service.save(draftOf({ name: 'Álvaro', rnc: '001-1' })));
    const list = await firstValueFrom(service.list());
    expect(list.map((c) => c.name)).toEqual(['Álvaro', 'Zoila']);
    expect(list[0].rnc).toBe('001-1');
  });

  it('guardar con id edita al mismo cliente', async () => {
    const created = await firstValueFrom(service.save(draftOf()));
    await firstValueFrom(service.save({ ...draftOf({ phone: '829 000 1111' }), id: created.id }));
    const list = await firstValueFrom(service.list());
    expect(list).toHaveLength(1);
    expect(list[0].phone).toBe('829 000 1111');
  });

  it('sin nombre no guarda', async () => {
    await expect(firstValueFrom(service.save(draftOf({ name: '  ' })))).rejects.toThrow(/nombre/);
  });

  it('limpia los vehículos: sin espacios de sobra y sin renglones vacíos', async () => {
    const saved = await firstValueFrom(
      service.save(
        draftOf({
          vehicles: [
            { text: ' Jetta 2012 ', plate: ' A1 ', mileage: '', vin: '' },
            { text: '  ', plate: '', mileage: '10', vin: '' },
          ],
        }),
      ),
    );
    expect(saved.vehicles).toEqual([{ text: 'Jetta 2012', plate: 'A1', mileage: '', vin: '' }]);
  });

  it('borra al cliente', async () => {
    const created = await firstValueFrom(service.save(draftOf()));
    await firstValueFrom(service.delete(created));
    expect(await firstValueFrom(service.list())).toEqual([]);
  });

  describe('resolveForDocument', () => {
    const doc = (name: string, over: Partial<ReturnType<typeof draftFromTemplate>> = {}) => ({
      ...draftFromTemplate('mecanica', 'factura', '2026-11-26'),
      customerName: name,
      ...over,
    });

    it('un nombre nuevo crea al cliente, con el teléfono y el vehículo del documento', async () => {
      const d = doc('Marta', {
        customerPhone: '809 1',
        vehicle: { text: 'Honda Civic', plate: 'H1', mileage: '', vin: '', verdict: '' },
      });
      const id = await firstValueFrom(service.resolveForDocument(d, []));
      const [c] = await firstValueFrom(service.list());
      expect(id).toBe(c.id);
      expect(c.phone).toBe('809 1');
      expect(c.vehicles.map((v) => v.plate)).toEqual(['H1']);
    });

    it('un cliente que ya existe (aunque se escriba distinto) se reutiliza y se completa sin pisarlo', async () => {
      const existing = await firstValueFrom(service.save(draftOf({ name: 'José Pérez', phone: '809 555 0134' })));
      const d = doc('  jose   PEREZ ', { customerPhone: '999 999 9999', customerEmail: 'jose@x.com' });

      const id = await firstValueFrom(service.resolveForDocument(d, [existing]));
      expect(id).toBe(existing.id);

      const list = await firstValueFrom(service.list());
      expect(list).toHaveLength(1);
      expect(list[0].phone).toBe('809 555 0134');
      expect(list[0].email).toBe('jose@x.com');
    });

    it('un documento ya vinculado (customerId) usa a ese cliente aunque el nombre cambie', async () => {
      const existing = await firstValueFrom(service.save(draftOf({ name: 'Ana Lora' })));
      const id = await firstValueFrom(service.resolveForDocument(doc('Ana L.', { customerId: existing.id }), [existing]));
      expect(id).toBe(existing.id);
      expect(await firstValueFrom(service.list())).toHaveLength(1);
    });

    it('sin nombre no hay cliente', async () => {
      expect(await firstValueFrom(service.resolveForDocument(doc('   '), []))).toBeNull();
    });
  });
});
