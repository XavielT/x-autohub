import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { QuoteService, toQuoteRequest } from './quote.service';

describe('QuoteService (migración 0055)', () => {
  let service: QuoteService;
  const base = { name: 'Maria', phone: '809-555-0134', description: 'Ruido al frenar', vehicleText: 'Corolla 2015', photos: [] as File[], website: '' };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(QuoteService);
  });

  it('un teléfono que no es dominicano se rechaza antes de tocar nada', async () => {
    await expect(firstValueFrom(service.create({ ...base, phone: '12345' }))).rejects.toThrow('teléfono dominicano');
  });

  it('en modo simulado no guarda nada y da un código de prueba con el formato XAH-C-0001', async () => {
    expect((await firstValueFrom(service.create(base))).code).toBe('XAH-C-0001');
    expect((await firstValueFrom(service.create(base))).code).toBe('XAH-C-0002');
  });

  it('en modo simulado no hay solicitudes que listar ni fotos que firmar', async () => {
    expect(await firstValueFrom(service.list())).toEqual([]);
    expect(await firstValueFrom(service.photoUrls(['a/0.jpg']))).toEqual({});
  });

  it('toQuoteRequest convierte la fila con su triage y su urgencia', () => {
    const r = toQuoteRequest({
      id: 'q1', code: 'XAH-C-0007', contact_name: 'Maria', contact_phone: '8095550134', vehicle_text: null, service_id: 2, description: 'Ruido',
      photos: ['u/0.jpg'], status: 'nueva', urgency: 'seguridad',
      ai_triage: { services: [{ slug: 'frenos', title: 'Frenos', price_from: 1500 }], summary: 's', missing_info: [], checklist: [], checklist_note: 'Orientativa', can_quote_without_inspection: false },
      created_at: '2026-11-03T12:00:00Z',
    });

    expect(r.code).toBe('XAH-C-0007');
    expect(r.urgency).toBe('seguridad');
    expect(r.triage?.services[0].price_from).toBe(1500);
    expect(r.createdAt).toEqual(new Date('2026-11-03T12:00:00Z'));
  });
});
