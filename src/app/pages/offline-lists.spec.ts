import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { Servicios } from './servicios/servicios';
import { AutoHub } from './auto-hub/auto-hub';
import { HubMarket } from './hub-market/hub-market';
import { Tienda } from './tienda/tienda';
import { AutoHubService } from '../../shared/services/auto-hub.service';
import { HubMarketService } from '../../shared/services/hub-market.service';
import { ProductService } from '../../shared/services/product.service';
import { ServiceCatalogService } from '../../shared/services/service-catalog.service';
import { SiteSettingsService } from '../../shared/services/site-settings.service';
import { AVAILABILITY_MOCK } from '../../shared/data/service.mock';

/**
 * Las listas de tienda, servicios y vehículos distinguen "no hay red" de "falló algo":
 * sin conexión dicen "Sin conexión" con Reintentar; con red conservan su mensaje de siempre.
 */
describe('Listas sin conexión', () => {
  const boom = () => throwError(() => new Error('failed to fetch'));

  function setOnLine(value: boolean) {
    Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
  }

  afterEach(() => setOnLine(true));

  const pages: { name: string; component: Type<unknown>; providers: () => unknown[]; generic: string }[] = [
    {
      name: 'Servicios',
      component: Servicios,
      providers: () => [
        {
          provide: ServiceCatalogService,
          useValue: { getServices: boom, getWorks: () => of([]), getAvailability: () => of(AVAILABILITY_MOCK) },
        },
        { provide: SiteSettingsService, useValue: { getPickupAddress: () => of(null) } },
      ],
      generic: 'No pudimos cargar los servicios',
    },
    {
      name: 'Tienda',
      component: Tienda,
      providers: () => [
        {
          provide: ProductService,
          useValue: {
            searchProducts: boom,
            getFacets: () => of({ brands: [], maxPrice: 0 }),
            getCompatibleIds: () => of([]),
          },
        },
      ],
      generic: 'No pudimos cargar los productos',
    },
    {
      name: 'Auto Hub',
      component: AutoHub,
      providers: () => [{ provide: AutoHubService, useValue: { getAll: boom } }],
      generic: 'No hay articulos para mostrar',
    },
    {
      name: 'Hub Market',
      component: HubMarket,
      providers: () => [{ provide: HubMarketService, useValue: { getAll: boom } }],
      generic: 'No encontramos resultados',
    },
  ];

  for (const page of pages) {
    describe(page.name, () => {
      function montar() {
        TestBed.configureTestingModule({ providers: page.providers() as never[] });
        const fixture = TestBed.createComponent(page.component);
        fixture.detectChanges();
        return { fixture, el: fixture.nativeElement as HTMLElement };
      }

      it('sin red, el error se ve como "Sin conexión" con un botón Reintentar', async () => {
        setOnLine(false);
        const { fixture, el } = montar();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(el.querySelector('app-offline-state')).not.toBeNull();
        expect(el.textContent).toContain('Sin conexión');
        expect(el.textContent).toContain('Reintentar');
        expect(el.textContent).not.toContain(page.generic);
      });

      it('con red, el mismo error conserva su mensaje de siempre', async () => {
        setOnLine(true);
        const { fixture, el } = montar();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(el.querySelector('app-offline-state')).toBeNull();
        expect(el.textContent).toContain(page.generic);
      });
    });
  }

  it('Reintentar vuelve a pedir los datos (Servicios)', async () => {
    setOnLine(false);
    let calls = 0;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ServiceCatalogService,
          useValue: {
            getServices: () => {
              calls++;
              return throwError(() => new Error('failed to fetch'));
            },
            getWorks: () => of([]),
            getAvailability: () => of(AVAILABILITY_MOCK),
          },
        },
        { provide: SiteSettingsService, useValue: { getPickupAddress: () => of(null) } },
      ],
    });
    const fixture = TestBed.createComponent(Servicios);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(calls).toBe(1);

    (fixture.nativeElement.querySelector('.off__btn') as HTMLButtonElement).click();

    expect(calls).toBe(2);
  });
});
