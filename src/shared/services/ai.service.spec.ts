import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { AiOverviewPayload } from '../../core/supabase/database.types';
import { AiService, toOverview } from './ai.service';
import { SiteSettingsService } from './site-settings.service';

describe('AiService (migración 0050)', () => {
  let service: AiService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(AiService);
  });

  afterEach(() => localStorage.clear());

  it('en modo simulado la IA "no está disponible" y el flujo sigue por su camino', async () => {
    const out = await firstValueFrom(service.call('ai-parse-search', { query: 'faros corolla' }));
    expect(out).toEqual({ ok: false, code: 'ia_no_disponible' });
  });

  it('el resumen simulado arranca en cero y con el tope por defecto', async () => {
    const overview = await firstValueFrom(service.getOverview());
    expect(overview.budget.spentUsd).toBe(0);
    expect(overview.budget.capUsd).toBe(25);
    expect(overview.maps.capUsd).toBe(10);
    expect(overview.errors).toEqual([]);
  });

  it('toOverview convierte el jsonb de la base (números como texto, snake_case) y un tier raro se toma como apagado', () => {
    const payload: AiOverviewPayload = {
      budget: { spent_usd: 12.5, cap_usd: 25, pct: 50, tier: 'ok', public_spent_usd: 1, public_ok: true },
      maps: { spent_usd: 9, cap_usd: 10, pct: 90, tier: 'quien-sabe' },
      by_feature: [{ feature: 'search', calls: 3, errors: 1, cost_usd: 0.012 }],
      by_day: [{ day: '2026-11-03', calls: 3, cost_usd: 0.012 }],
      errors: [{ feature: 'search', error_code: null, created_at: '2026-11-03T12:00:00Z' }],
    };
    const o = toOverview(payload);

    expect(o.budget.pct).toBe(50);
    expect(o.maps.tier).toBe('apagado');
    expect(o.byFeature[0]).toEqual({ feature: 'search', calls: 3, errors: 1, costUsd: 0.012 });
    expect(o.errors[0].errorCode).toBe('sin código');
  });
});

describe('SiteSettingsService: interruptores de IA (migración 0050)', () => {
  let settings: SiteSettingsService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    settings = TestBed.inject(SiteSettingsService);
  });

  afterEach(() => localStorage.clear());

  it('en modo simulado solo devuelve las claves de IA y Maps', async () => {
    await firstValueFrom(settings.setAiSetting('ai_feature_search', false));
    await firstValueFrom(settings.setAiSetting('ai_monthly_cap_usd', 40));
    const values = await firstValueFrom(settings.getAiSettings());

    expect(values['ai_feature_search']).toBe(false);
    expect(values['ai_monthly_cap_usd']).toBe(40);
    expect(Object.keys(values).every((k) => k.startsWith('ai_') || k === 'maps_monthly_cap_usd')).toBe(true);
  });
});
