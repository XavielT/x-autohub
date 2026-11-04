import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { AiSearchService, looksLikePartNumber, toParsed, understoodChips } from './ai-search.service';

const payload = {
  make_id: 1, make_name: 'Toyota', model_id: 100, model_name: 'Corolla', year: 2015, category_slug: 'luces', category_name: 'Luces',
  terms: ['faro'], part_number: null, intent: 'comprar' as const, corrected_query: null,
};

describe('AiSearchService (migración 0054)', () => {
  let service: AiSearchService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AiSearchService);
  });

  it('en modo simulado la IA no está: parse devuelve null y el buscador sigue como siempre', async () => {
    expect(await firstValueFrom(service.parse('faros corolla 2015', null))).toBeNull();
    expect(await firstValueFrom(service.proposeModels())).toEqual([]);
    expect(await firstValueFrom(service.proposeAliases())).toEqual([]);
  });

  it('logSearch en modo simulado no hace nada ni falla', () => {
    expect(() => service.logSearch('faros', 3, false)).not.toThrow();
  });

  describe('heurística: cuándo vale la pena preguntarle a la IA', () => {
    it('un número de parte o un SKU se busca tal cual', () => {
      for (const q of ['04465-02220', 'GDB3469', 'XAH-000123', '04465 02220']) {
        expect(looksLikePartNumber(q)).toBe(true);
        expect(service.shouldAsk(q, 0, false)).toBe(false);
      }
    });

    it('una frase normal no es un número de parte', () => {
      for (const q of ['faros corolla', 'led h4', 'bateria 70 amp']) expect(looksLikePartNumber(q)).toBe(false);
    });

    it('con buenos resultados y sin año ni vehículo, no se gasta', () => {
      expect(service.shouldAsk('pastillas de freno', 12, false)).toBe(false);
    });

    it('con pocos o ningún resultado, sí', () => {
      expect(service.shouldAsk('faros corolla', 0, false)).toBe(true);
      expect(service.shouldAsk('faros corolla', 2, false)).toBe(true);
    });

    it('con un año en la frase, sí, aunque haya resultados', () => {
      expect(service.shouldAsk('faros corolla 2015', 40, false)).toBe(true);
    });

    it('con un vehículo elegido y resultados mediocres, sí; con muchos, no', () => {
      expect(service.shouldAsk('faros', 8, true)).toBe(true);
      expect(service.shouldAsk('faros', 30, true)).toBe(false);
    });

    it('una frase muy corta o larguísima no se manda', () => {
      expect(service.shouldAsk('ab', 0, false)).toBe(false);
      expect(service.shouldAsk('x'.repeat(121), 0, false)).toBe(false);
    });
  });

  it('toParsed convierte lo que llega de la edge y lleva el vehículo', () => {
    const p = toParsed(payload)!;

    expect(p.makeId).toBe(1);
    expect(p.modelName).toBe('Corolla');
    expect(p.categorySlug).toBe('luces');
    expect(p.terms).toEqual(['faro']);
  });

  it('si la IA no entendió nada útil, toParsed devuelve null', () => {
    expect(toParsed({ ...payload, make_id: null, make_name: null, model_id: null, model_name: null, year: null, category_slug: null, category_name: null, terms: [] })).toBeNull();
  });

  it('una frase solo corregida o de servicio sí cuenta como entendida', () => {
    const base = { ...payload, make_id: null, make_name: null, model_id: null, model_name: null, year: null, category_slug: null, category_name: null, terms: [] };

    expect(toParsed({ ...base, corrected_query: 'batería' })).not.toBeNull();
    expect(toParsed({ ...base, intent: 'servicio' })).not.toBeNull();
  });

  it('los chips dicen "Toyota Corolla 2015" y "Luces"', () => {
    expect(understoodChips(toParsed(payload)!)).toEqual(['Toyota Corolla 2015', 'Luces']);
  });

  it('sin vehículo, solo la categoría', () => {
    expect(understoodChips(toParsed({ ...payload, make_id: null, make_name: null, model_id: null, model_name: null, year: null })!)).toEqual(['Luces']);
  });
});
