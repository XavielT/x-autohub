import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { HubMarketService } from './hub-market.service';
import { HubMarketItemModel } from '../models/hub-market-item.model';

/**
 * El flujo de aprobación, por el camino simulado.
 *
 * `test-providers.ts` inyecta `TestSupabaseService`, así que `shouldUseMockData()`
 * es true y esto ejercita las ramas de mock sin tocar la red — ver la trampa
 * correspondiente en `CLAUDE.md`.
 *
 * Lo que fija: **lo que publica un usuario normal no se ve hasta que alguien lo
 * aprueba.** En modo real eso lo garantizan un trigger y una política RLS
 * (migración 0012), que estas pruebas no pueden ejecutar; aquí se comprueba que
 * el servicio no lo contradiga por su lado.
 */
describe('HubMarketService — moderacion (mock)', () => {
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

  const publicar = (title: string, canModerate = false) =>
    firstValueFrom(
      service.publish(
        { ...BASE, title } as Omit<HubMarketItemModel, 'id'>,
        'u-1',
        'Quien sea',
        canModerate,
      ),
    );

  const titulos = async () =>
    (await firstValueFrom(service.getAll())).map((i) => i.title);

  describe('publicar', () => {
    it('lo de un usuario normal nace pendiente y no se ve en el sitio', async () => {
      const creada = await publicar('Turbo Garrett');

      expect(creada.status).toBe('pendiente');
      expect(await titulos()).not.toContain('Turbo Garrett');
    });

    it('lo de un moderador nace aprobado y se ve enseguida', async () => {
      const creada = await publicar('Turbo del moderador', true);

      expect(creada.status).toBe('aprobado');
      expect(await titulos()).toContain('Turbo del moderador');
    });

    it('lo pendiente si aparece en la lista de su dueño', async () => {
      await publicar('Turbo Garrett');
      const mias = await firstValueFrom(service.getBySellerId('u-1'));

      expect(mias.map((i) => i.title)).toContain('Turbo Garrett');
      expect(mias[0].status).toBe('pendiente');
    });

    it('lo sembrado, sin status, se sigue viendo', async () => {
      // Si `getAll` exigiera `status === 'aprobado'` sin default, Hub Market
      // se habria quedado vacio en modo simulado.
      expect((await titulos()).length).toBeGreaterThan(0);
    });
  });

  describe('cola de revision', () => {
    it('solo trae lo pendiente', async () => {
      await publicar('Pendiente 1');
      await publicar('Aprobada ya', true);

      const cola = await firstValueFrom(service.getPending());

      expect(cola.map((i) => i.title)).toEqual(['Pendiente 1']);
    });

    it('junta todo lo que espera, sin perder ninguna', async () => {
      const a = await publicar('La primera');
      const b = await publicar('La segunda');

      const cola = await firstValueFrom(service.getPending());

      // No se afirma el orden entre estas dos: `publish` sella `createdAt` con
      // el reloj real y las dos caen en el mismo milisegundo, asi que
      // ordenarlas seria comprobar la resolucion del reloj y no el codigo. El
      // orden por antiguedad se comprueba abajo, con fechas distintas.
      expect(cola.map((i) => i.id).sort()).toEqual([a.id, b.id].sort());
    });

    it('atiende por antiguedad: primero lo que lleva mas tiempo esperando', async () => {
      // Se mueve el reloj en vez de tocar el servicio: `publish` sella
      // `createdAt` con `new Date()`, asi que esta es la forma de darles fechas
      // distintas sin agregarle a la produccion un metodo que solo usan las
      // pruebas.
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        await publicar('La vieja');
        vi.setSystemTime(new Date('2026-08-01T00:00:00Z'));
        await publicar('La nueva');
      } finally {
        vi.useRealTimers();
      }

      const cola = await firstValueFrom(service.getPending());

      expect(cola.map((i) => i.title)).toEqual(['La vieja', 'La nueva']);
    });
  });

  describe('aprobar', () => {
    it('la publica y la saca de la cola', async () => {
      const creada = await publicar('Turbo Garrett');

      await firstValueFrom(service.moderate(creada.id, 'aprobado'));

      expect(await titulos()).toContain('Turbo Garrett');
      expect(await firstValueFrom(service.getPending())).toEqual([]);
    });

    it('limpia el motivo de un rechazo anterior', async () => {
      const creada = await publicar('Turbo Garrett');
      await firstValueFrom(
        service.moderate(creada.id, 'rechazado', 'Las fotos no se ven bien.'),
      );

      await firstValueFrom(service.moderate(creada.id, 'aprobado'));
      const item = await firstValueFrom(service.getById(creada.id));

      expect(item?.status).toBe('aprobado');
      expect(item?.rejectionReason).toBeUndefined();
    });
  });

  describe('rechazar', () => {
    it('guarda el motivo y la deja invisible', async () => {
      const creada = await publicar('Turbo Garrett');

      await firstValueFrom(
        service.moderate(creada.id, 'rechazado', 'Las fotos no dejan ver el vehiculo.'),
      );
      const item = await firstValueFrom(service.getById(creada.id));

      expect(item?.status).toBe('rechazado');
      expect(item?.rejectionReason).toBe('Las fotos no dejan ver el vehiculo.');
      expect(await titulos()).not.toContain('Turbo Garrett');
    });

    it('exige un motivo: sin el, el vendedor no sabria que corregir', async () => {
      const creada = await publicar('Turbo Garrett');

      await expect(firstValueFrom(service.moderate(creada.id, 'rechazado'))).rejects.toThrow(
        /al menos 10 caracteres/,
      );
      await expect(
        firstValueFrom(service.moderate(creada.id, 'rechazado', 'corto')),
      ).rejects.toThrow(/al menos 10 caracteres/);

      // Y no la movio de sitio.
      expect((await firstValueFrom(service.getById(creada.id)))?.status).toBe('pendiente');
    });

    it('un motivo de solo espacios no cuenta como motivo', async () => {
      const creada = await publicar('Turbo Garrett');

      await expect(
        firstValueFrom(service.moderate(creada.id, 'rechazado', '              ')),
      ).rejects.toThrow(/al menos 10 caracteres/);
    });
  });
});
