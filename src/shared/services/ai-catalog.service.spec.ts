import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { AiProductDraftRow } from '../../core/supabase/database.types';
import { AiCatalogService, toDraft } from './ai-catalog.service';

const row = (extra: Partial<AiProductDraftRow> = {}): AiProductDraftRow => ({
  id: 'd1',
  created_by: 'u1',
  status: 'ready',
  source_kind: 'article',
  source_paths: ['u1/lote/00-a.jpg'],
  batch_id: 'lote',
  hint: null,
  fields: { name: { value: 'Pastillas', confidence: 'alta', source: 'sugerido' } },
  unmatched: [{ text: 'Mazda 3 2015', printed: true }],
  duplicate_of: null,
  duplicate_confirmed: false,
  final_fields: null,
  edited_fields: [],
  product_id: null,
  model: 'claude-sonnet-5',
  cost_usd: 0.0123,
  error: null,
  created_at: '2026-11-03T12:00:00Z',
  updated_at: '2026-11-03T12:00:00Z',
  reviewed_at: null,
  ...extra,
});

describe('AiCatalogService (migración 0051)', () => {
  let service: AiCatalogService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AiCatalogService);
  });

  it('en modo simulado no está disponible y no hay borradores', async () => {
    expect(service.isAvailable()).toBe(false);
    expect(await firstValueFrom(service.list())).toEqual([]);
    expect(await firstValueFrom(service.accuracy())).toEqual([]);
  });

  it('subir, crear y aprobar fallan con un mensaje claro en vez de tocar nada', async () => {
    await expect(firstValueFrom(service.uploadSources([], 'lote'))).rejects.toThrow('modo de prueba');
    await expect(firstValueFrom(service.createDrafts([['a']], 'article', 'lote'))).rejects.toThrow('modo de prueba');
    await expect(
      firstValueFrom(
        service.approve(toDraft(row()), {
          name: 'x', brand: 'y', categoryId: 1, partNumber: '', crossRefs: [], shortDescription: '', description: '', price: 1, stock: 0,
          specs: {}, fitmentType: 'universal', fitments: [], aliases: [], photoIndices: [], duplicateConfirmed: false, publish: false, editedFields: [],
        }),
      ),
    ).rejects.toThrow('modo de prueba');
  });

  it('la IA en modo simulado "no está disponible": agrupar devuelve null y procesar, false', async () => {
    expect(await firstValueFrom(service.groupPaths(['a']))).toBeNull();
    expect(await firstValueFrom(service.process(['d1']))).toBe(false);
    expect(await firstValueFrom(service.reread('d1', 'pista'))).toBe(false);
  });

  it('toDraft convierte la fila (snake_case, costo numérico, fecha)', () => {
    const d = toDraft(row({ duplicate_of: 12, cost_usd: '0.5' as unknown as number }));

    expect(d.sourceKind).toBe('article');
    expect(d.sourcePaths).toEqual(['u1/lote/00-a.jpg']);
    expect(d.duplicateOf).toBe(12);
    expect(d.costUsd).toBe(0.5);
    expect(d.createdAt).toEqual(new Date('2026-11-03T12:00:00Z'));
    expect(d.fields['name'].confidence).toBe('alta');
    expect(d.unmatched[0].text).toBe('Mazda 3 2015');
  });
});
