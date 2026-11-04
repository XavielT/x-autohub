import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { OrderProofCheckRow } from '../../core/supabase/database.types';
import { AiProofService, toProofCheck } from './ai-proof.service';

const row = (extra: Partial<OrderProofCheckRow> = {}): OrderProofCheckRow => ({
  id: 1,
  order_id: 'o1',
  proof_path: 'o1/comprobante.jpg',
  extracted: { amount: 4500, currency: 'DOP', dest_bank: 'Banreservas', dest_account_last4: '4821', date: '2026-11-03', time: '10:15' },
  verdict: 'coincide',
  flags: [],
  reason: 'Se lee claro.',
  reference_hash: 'abc',
  reference_last4: '4321',
  model: 'claude-sonnet-5',
  cost_usd: 0.01,
  created_at: '2026-11-03T12:00:00Z',
  ...extra,
});

describe('AiProofService (migración 0052)', () => {
  let service: AiProofService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AiProofService);
  });

  it('en modo simulado no hay lecturas ni "esperado", y releer dice que la IA no está', async () => {
    expect(await firstValueFrom(service.getLatest(['o1']))).toEqual({});
    expect(await firstValueFrom(service.getExpected('o1'))).toBeNull();
    expect(await firstValueFrom(service.recheck('o1'))).toBe(false);
  });

  it('toProofCheck convierte la fila: lo leído, los 4 últimos de la referencia y la fecha', () => {
    const c = toProofCheck(row({ verdict: 'revisar', flags: ['monto_distinto'] }));

    expect(c.verdict).toBe('revisar');
    expect(c.flags).toEqual(['monto_distinto']);
    expect(c.read).toMatchObject({ amount: 4500, destBank: 'Banreservas', destLast4: '4821', date: '2026-11-03' });
    expect(c.referenceLast4).toBe('4321');
    expect(c.createdAt).toEqual(new Date('2026-11-03T12:00:00Z'));
  });

  it('lo que la IA no leyó queda nulo, no inventado', () => {
    const c = toProofCheck(row({ extracted: {}, reference_last4: null }));

    expect(c.read.amount).toBeNull();
    expect(c.read.destLast4).toBeNull();
    expect(c.referenceLast4).toBeNull();
  });
});
