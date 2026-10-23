import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ServiceCatalogService } from './service-catalog.service';
import { SERVICES_MOCK } from '../data/service.mock';
import { SERVICE_CATEGORIES } from '../models/service.model';
import { toService } from '../../core/supabase/mappers';

describe('ServiceCatalogService (mock)', () => {
  let catalog: ServiceCatalogService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    catalog = TestBed.inject(ServiceCatalogService);
  });

  it('el catálogo trae diez servicios activos, en su orden', async () => {
    const list = await firstValueFrom(catalog.getServices());

    expect(list).toHaveLength(10);
    expect(list.map((s) => s.sortOrder)).toEqual([...list.map((s) => s.sortOrder)].sort((a, b) => a - b));
  });

  it('cubre las seis categorías', async () => {
    const categories = new Set((await firstValueFrom(catalog.getServices())).map((s) => s.category));

    expect([...categories].sort()).toEqual([...SERVICE_CATEGORIES].sort());
  });

  it('cada servicio tiene su slug único y su texto largo', () => {
    expect(new Set(SERVICES_MOCK.map((s) => s.slug)).size).toBe(SERVICES_MOCK.length);
    expect(SERVICES_MOCK.every((s) => s.longDescription.length > 40)).toBe(true);
  });

  it('un servicio se busca por slug o por id, y uno que no existe da undefined', async () => {
    expect((await firstValueFrom(catalog.getBySlug('frenos')))?.id).toBe(4);
    expect((await firstValueFrom(catalog.getById(4)))?.slug).toBe('frenos');
    expect(await firstValueFrom(catalog.getBySlug('no-existe'))).toBeUndefined();
    expect(await firstValueFrom(catalog.getById(999))).toBeUndefined();
  });

  it('hay servicios a cotizar (sin precio) y servicios con "desde"', () => {
    expect(SERVICES_MOCK.some((s) => s.priceFrom === null)).toBe(true);
    expect(SERVICES_MOCK.some((s) => s.priceFrom !== null)).toBe(true);
  });

  it('el horario de ejemplo es de lunes a sábado', async () => {
    const rules = await firstValueFrom(catalog.getAvailability());

    expect(rules.map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rules.every((r) => r.isExample)).toBe(true);
  });

  it('solo trae los trabajos publicados, y se pueden filtrar por servicio', async () => {
    const all = await firstValueFrom(catalog.getWorks());
    const frenos = await firstValueFrom(catalog.getWorks(4));

    expect(all.every((w) => w.isPublished)).toBe(true);
    expect(frenos.every((w) => w.serviceId === 4)).toBe(true);
    expect(frenos.length).toBeLessThan(all.length);
  });
});

describe('toService (mapper)', () => {
  it('traduce la fila de Postgres y el precio nulo es "a cotizar"', () => {
    const service = toService({
      id: 4, slug: 'frenos', icon: 'x.svg', title: 'Frenos', description: 'd', sort_order: 40, is_active: true,
      category: 'mecanica', price_from: null, duration_minutes: 90, is_bookable: true, images: [], long_description: 'texto',
    });

    expect(service.priceFrom).toBeNull();
    expect(service.durationMinutes).toBe(90);
    expect(service.longDescription).toBe('texto');
  });

  it('el precio llega como texto (numeric) y vuelve como número', () => {
    const service = toService({
      id: 1, slug: 'a', icon: 'x', title: 'A', description: 'd', sort_order: 1, is_active: true,
      category: 'instalacion', price_from: '1500.00' as unknown as number, duration_minutes: 60, is_bookable: false,
      images: ['a.jpg'], long_description: '',
    });

    expect(service.priceFrom).toBe(1500);
    expect(service.isBookable).toBe(false);
    expect(service.images).toEqual(['a.jpg']);
  });
});
