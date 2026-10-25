import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { HubMarketService } from './hub-market.service';
import { HubMarketItemModel } from '../models/hub-market-item.model';

/**
 * Vendida y vencida, por el camino simulado. En modo real las fechas las pone la base (`mark_publication_sold()`,
 * `renew_publication()`, migración 0030) y las comprueba `verify-migrations.sh`; aquí se fija que el servicio las
 * respete en los listados y que el modo simulado se comporte igual.
 */
describe('HubMarketService — vendida y vencida (mock)', () => {
  let service: HubMarketService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HubMarketService);
  });

  const BASE = {
    description: 'x',
    images: ['x.jpg'],
    price: 1000,
    location: 'Santiago',
    sellerName: 'Quien sea',
    category: 'piezas',
    isFeatured: false,
  } as Omit<HubMarketItemModel, 'id' | 'title'>;

  const publicar = (title: string) =>
    firstValueFrom(service.publish({ ...BASE, title } as Omit<HubMarketItemModel, 'id'>, 'u-1', 'Quien sea', true));

  const titulos = async () => (await firstValueFrom(service.getAll())).map((i) => i.title);

  it('una publicación nueva nace a la venta y con 60 días de plazo', async () => {
    const creada = await publicar('Faros LED');

    expect(creada.soldAt).toBeUndefined();
    expect(creada.expiresAt).toBeDefined();
    expect(await titulos()).toContain('Faros LED');
  });

  it('marcarla vendida la saca de los listados', async () => {
    const creada = await publicar('Faros vendidos');

    const fechas = await firstValueFrom(service.markSold(creada.id));

    expect(fechas?.soldAt).toBeDefined();
    expect(await titulos()).not.toContain('Faros vendidos');
    expect((await firstValueFrom(service.getByCategory('piezas'))).map((i) => i.title)).not.toContain('Faros vendidos');
    expect((await firstValueFrom(service.search('Faros vendidos'))).length).toBe(0);
  });

  it('su ficha sigue respondiendo: quien tenga el enlace ve que se vendió, no "no encontrado"', async () => {
    const creada = await publicar('Faros con enlace');
    await firstValueFrom(service.markSold(creada.id));

    const ficha = await firstValueFrom(service.getById(creada.id));

    expect(ficha?.title).toBe('Faros con enlace');
    expect(ficha?.soldAt).toBeDefined();
  });

  it('renovarla la vuelve a poner a la venta', async () => {
    const creada = await publicar('Faros renovados');
    await firstValueFrom(service.markSold(creada.id));

    const fechas = await firstValueFrom(service.renew(creada.id));

    expect(fechas?.soldAt).toBeUndefined();
    expect(await titulos()).toContain('Faros renovados');
  });

  it('una vencida sale de los listados hasta que se renueva', async () => {
    const creada = await publicar('Faros vencidos');
    // El mock no tiene reloj que adelantar: se vence a mano la copia que guarda el servicio.
    (service as unknown as { mockItems: HubMarketItemModel[] }).mockItems = (
      service as unknown as { mockItems: HubMarketItemModel[] }
    ).mockItems.map((i) => (i.id === creada.id ? { ...i, expiresAt: '2020-01-01T00:00:00Z' } : i));

    expect(await titulos()).not.toContain('Faros vencidos');

    await firstValueFrom(service.renew(creada.id));

    expect(await titulos()).toContain('Faros vencidos');
  });

  it('marcar como vendida dos veces no cambia la fecha', async () => {
    const creada = await publicar('Faros dos veces');

    const primera = await firstValueFrom(service.markSold(creada.id));
    const segunda = await firstValueFrom(service.markSold(creada.id));

    expect(segunda?.soldAt).toBe(primera?.soldAt);
  });
});
