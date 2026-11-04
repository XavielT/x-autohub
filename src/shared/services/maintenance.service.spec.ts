import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { MaintenanceService, intervalText, toItem, toTemplate } from './maintenance.service';

describe('MaintenanceService (migración 0058)', () => {
  let service: MaintenanceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MaintenanceService);
  });

  it('en modo simulado no hay renglones ni guías, y armar una dice que no está disponible', async () => {
    expect(await firstValueFrom(service.getItems(1))).toEqual([]);
    expect(await firstValueFrom(service.getPendingTemplates())).toEqual([]);
    expect(await firstValueFrom(service.createGuide(1))).toBe('no_disponible');
    expect(await firstValueFrom(service.getTemplateReviewed({ id: 1, userId: 'u', makeId: 1, modelId: 2, modelText: null, year: 2015, nickname: null, isDefault: false }))).toBeNull();
  });

  it('escribir, registrar o borrar en modo simulado falla con un mensaje claro en vez de fingir', async () => {
    await expect(firstValueFrom(service.setOdometer(1, 1000))).rejects.toThrow('modo de prueba');
    await expect(firstValueFrom(service.logDone(1))).rejects.toThrow('modo de prueba');
    await expect(firstValueFrom(service.addCustom(1, 'Plumillas', 20000, null))).rejects.toThrow('modo de prueba');
    await expect(firstValueFrom(service.remove(1))).rejects.toThrow('modo de prueba');
  });

  it('toItem convierte la fila', () => {
    const i = toItem({
      id: 1, profile_vehicle_id: 2, template_key: 'aceite', label: 'Aceite y filtro', every_km: 5000, every_months: 4, last_done_on: '2026-10-01', last_done_km: 70000, due_on: '2027-02-01', due_km: 75000,
      status: 'pronto', source: 'taller', category_slug: 'filtros', service_slug: 'cambio-aceite', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    });

    expect(i).toMatchObject({ label: 'Aceite y filtro', everyKm: 5000, dueKm: 75000, status: 'pronto', source: 'taller', categorySlug: 'filtros', serviceSlug: 'cambio-aceite' });
  });

  it('toTemplate convierte la guía', () => {
    const t = toTemplate({ id: 1, make_id: 1, model_id: 2, year_from: 2014, year_to: 2019, engine_note: null, items: [], source: 'ia', reviewed: false });

    expect(t).toMatchObject({ makeId: 1, modelId: 2, yearFrom: 2014, yearTo: 2019, reviewed: false });
  });

  it('intervalText dice "Cada 5,000 km o 4 meses"', () => {
    expect(intervalText({ everyKm: 5000, everyMonths: 4 })).toBe('Cada 5,000 km o 4 meses');
    expect(intervalText({ everyKm: null, everyMonths: 1 })).toBe('Cada 1 mes');
    expect(intervalText({ everyKm: 30000, everyMonths: null })).toBe('Cada 30,000 km');
    expect(intervalText({ everyKm: null, everyMonths: null })).toBe('');
  });
});
