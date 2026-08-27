import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { StatsService } from './stats.service';
import { SiteSettingsService } from './site-settings.service';
import { AUTO_HUB_MOCK } from '../data/auto-hub.mock';
import { HUB_PART_MOCK } from '../data/hub-part.mock';
import { HUB_MARKET_ITEMS_MOCK } from '../data/hub-market-item.mock';
import { ADMIN_USERS_MOCK } from '../data/admin.mock';

/**
 * Los contadores del home y el ajuste que decide cuáles se muestran.
 *
 * Estas pruebas corren en modo simulado (`test-providers.ts` inyecta
 * `TestSupabaseService`), así que ejercitan la rama de mocks. Lo que vigilan es
 * que esa rama diga **lo mismo que Postgres**: la migración 0014 cuenta con la
 * visibilidad de un visitante anónimo, y si el modo simulado contara distinto,
 * el interruptor enseñaría en desarrollo unos números y en producción otros. Es
 * la lección de la ronda 14 —el fallo que solo aparece contra la base real—
 * aplicada por adelantado.
 *
 * Las condiciones de la función quedaron comprobadas contra un Postgres de
 * verdad (ver la bitácora de esta fase); esto fija el otro lado.
 */
describe('StatsService (mock)', () => {
  let service: StatsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StatsService);
  });

  const stats = () => firstValueFrom(service.getSiteStats());

  it('no cuenta el contenido marcado como de prueba', async () => {
    const { vehicles, parts } = await stats();

    // Los mocks traen una pieza y un vehículo de prueba (fase 6 de la ronda 14).
    expect(HUB_PART_MOCK.some((p) => p.isTest)).toBe(true);
    expect(AUTO_HUB_MOCK.some((v) => v.isTest)).toBe(true);

    expect(parts).toBe(HUB_PART_MOCK.filter((p) => !p.isTest).length);
    expect(parts).toBeLessThan(HUB_PART_MOCK.length);
    expect(vehicles).toBeLessThan(AUTO_HUB_MOCK.length + HUB_MARKET_ITEMS_MOCK.length);
  });

  it('cuenta los vehiculos de Auto Hub mas las publicaciones aprobadas', async () => {
    const { vehicles } = await stats();

    const propios = AUTO_HUB_MOCK.filter((v) => !v.isTest).length;
    const comunidad = HUB_MARKET_ITEMS_MOCK.filter(
      (i) => i.category === 'vehiculos' && (i.status ?? 'aprobado') === 'aprobado' && !i.isTest,
    ).length;

    expect(vehicles).toBe(propios + comunidad);
  });

  it('no cuenta una publicacion pendiente ni una rechazada', async () => {
    // Ninguna publicación sin aprobar debe entrar: en el sitio no se ve, así que
    // en el contador no existe.
    const sinAprobar = HUB_MARKET_ITEMS_MOCK.filter(
      (i) => i.category === 'vehiculos' && (i.status ?? 'aprobado') !== 'aprobado',
    );
    const { vehicles } = await stats();

    const todosLosVehiculos = HUB_MARKET_ITEMS_MOCK.filter(
      (i) => i.category === 'vehiculos' && !i.isTest,
    ).length;
    const propios = AUTO_HUB_MOCK.filter((v) => !v.isTest).length;

    expect(vehicles).toBe(propios + todosLosVehiculos - sinAprobar.filter((i) => !i.isTest).length);
  });

  it('no cuenta piezas ni accesorios como vehiculos', async () => {
    const { vehicles } = await stats();
    const noVehiculos = HUB_MARKET_ITEMS_MOCK.filter((i) => i.category !== 'vehiculos').length;

    expect(noVehiculos).toBeGreaterThan(0);
    expect(vehicles).toBeLessThan(
      AUTO_HUB_MOCK.length + HUB_MARKET_ITEMS_MOCK.length - noVehiculos + 1,
    );
  });

  it('no cuenta las cuentas de prueba como miembros', async () => {
    const { members } = await stats();

    expect(ADMIN_USERS_MOCK.some((u) => u.isTestUser)).toBe(true);
    expect(members).toBe(ADMIN_USERS_MOCK.filter((u) => !u.isTestUser).length);
    expect(members).toBeLessThan(ADMIN_USERS_MOCK.length);
  });
});

describe('SiteSettingsService (mock)', () => {
  let service: SiteSettingsService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(SiteSettingsService);
  });

  afterEach(() => localStorage.clear());

  const modo = () => firstValueFrom(service.getStatsMode());

  it('arranca en showcase', async () => {
    // Es el valor con el que la migración siembra la fila: mientras el sitio es
    // joven, los números reales son pequeños.
    expect(await modo()).toBe('showcase');
  });

  it('guarda el cambio y lo devuelve', async () => {
    await firstValueFrom(service.setStatsMode('real'));

    expect(await modo()).toBe('real');
  });

  it('el cambio sobrevive a una recarga', async () => {
    await firstValueFrom(service.setStatsMode('real'));

    // Instancia nueva = lo que pasa al recargar la página. En memoria esto
    // volvería a 'showcase' y el interruptor parecería no funcionar.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const recargado = TestBed.inject(SiteSettingsService);

    expect(await firstValueFrom(recargado.getStatsMode())).toBe('real');
  });

  it('vuelve a showcase si el valor guardado no se entiende', async () => {
    localStorage.setItem('x-autohub.site-settings', JSON.stringify({ stats_mode: 'lo-que-sea' }));

    expect(await modo()).toBe('showcase');
  });

  it('y tambien si el storage tiene basura', async () => {
    localStorage.setItem('x-autohub.site-settings', 'no-es-json{');

    expect(await modo()).toBe('showcase');
  });
});
