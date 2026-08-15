import { TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthService } from './auth.service';
import { AutoHubService } from './auto-hub.service';
import { HubMarketService } from './hub-market.service';
import { HubPartService } from './hub-part.service';
import { NewsService } from './news.service';
import { UserModel } from '../models/user.model';

/**
 * Visibilidad del contenido de prueba, por el camino simulado.
 *
 * En modo real esto lo resuelve RLS (migración 0013) y estas pruebas no pueden
 * ejecutarlo. Lo que fijan es la otra mitad del trato: **con mocks el filtro lo
 * tiene que hacer la app**, y tiene que hacerlo en todos los caminos, no solo en
 * el listado principal. El detalle por URL directa es el que más fácil se olvida
 * y el que peor falla: enseña el artículo entero a quien no debía verlo.
 *
 * Los ids son los de las filas de prueba sembradas en los mocks (fase 6).
 */
const PIEZA_PRUEBA = 36;
const VEHICULO_PRUEBA = 6;
const NOTICIA_PRUEBA = 3;
const PUBLICACION_PRUEBA = 105;

/** Vehículo destacado del home; se marca como prueba dentro de una prueba. */
const SUPRA = 101;

const BASE: UserModel = {
  id: 'u-1',
  displayName: 'Quien sea',
  email: 'quien@ejemplo.com',
  role: 'user',
  createdAt: '2026-08-15T00:00:00Z',
};

const NORMAL: UserModel = BASE;
const DE_PRUEBA: UserModel = { ...BASE, isTestUser: true };
const ADMIN: UserModel = { ...BASE, role: 'admin', isAdmin: true };
const MODERADOR: UserModel = { ...BASE, role: 'moderador' };

describe('Contenido de prueba (mock)', () => {
  let user: WritableSignal<UserModel | null>;

  beforeEach(() => {
    user = signal<UserModel | null>(null);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { user } }],
    });
  });

  const ids = (list: { id: number }[]) => list.map((i) => i.id);

  describe('catalogo de piezas', () => {
    const parts = () => TestBed.inject(HubPartService);

    it('sin sesion la pieza de prueba no sale ni en la lista ni por id', async () => {
      expect(ids(await firstValueFrom(parts().getAll()))).not.toContain(PIEZA_PRUEBA);
      expect(await firstValueFrom(parts().getById(PIEZA_PRUEBA))).toBeUndefined();
    });

    it('un usuario normal tampoco la ve', async () => {
      user.set(NORMAL);

      expect(ids(await firstValueFrom(parts().getAll()))).not.toContain(PIEZA_PRUEBA);
      expect(await firstValueFrom(parts().getById(PIEZA_PRUEBA))).toBeUndefined();
    });

    it('tampoco entre los relacionados de su propia categoria', async () => {
      user.set(NORMAL);
      const relacionados = await firstValueFrom(parts().getByCategory('herramientas'));

      expect(relacionados.length).toBeGreaterThan(0);
      expect(ids(relacionados)).not.toContain(PIEZA_PRUEBA);
    });

    it('un usuario de prueba si la ve, y llega marcada', async () => {
      user.set(DE_PRUEBA);
      const pieza = await firstValueFrom(parts().getById(PIEZA_PRUEBA));

      expect(pieza?.isTest).toBe(true);
      expect(ids(await firstValueFrom(parts().getAll()))).toContain(PIEZA_PRUEBA);
    });

    it('un admin la ve por su rol, sin la marca de usuario de prueba', async () => {
      user.set(ADMIN);

      expect(ADMIN.isTestUser).toBeUndefined();
      expect(ids(await firstValueFrom(parts().getAll()))).toContain(PIEZA_PRUEBA);
    });
  });

  describe('Auto Hub', () => {
    const autos = () => TestBed.inject(AutoHubService);

    it('el vehiculo de prueba no sale para un usuario normal', async () => {
      user.set(NORMAL);

      expect(ids(await firstValueFrom(autos().getAll()))).not.toContain(VEHICULO_PRUEBA);
      expect(await firstValueFrom(autos().getById(VEHICULO_PRUEBA))).toBeUndefined();
    });

    it('para un moderador si', async () => {
      user.set(MODERADOR);

      expect((await firstValueFrom(autos().getById(VEHICULO_PRUEBA)))?.isTest).toBe(true);
    });
  });

  describe('noticias del home', () => {
    const news = () => TestBed.inject(NewsService);

    it('la noticia de prueba no sale en el home ni por URL directa', async () => {
      user.set(NORMAL);

      expect(ids(await firstValueFrom(news().getAll()))).not.toContain(NOTICIA_PRUEBA);
      expect(await firstValueFrom(news().getById(NOTICIA_PRUEBA))).toBeUndefined();
    });

    it('para un usuario de prueba si', async () => {
      user.set(DE_PRUEBA);

      expect(ids(await firstValueFrom(news().getAll()))).toContain(NOTICIA_PRUEBA);
    });
  });

  describe('Hub Market', () => {
    const market = () => TestBed.inject(HubMarketService);

    it('la publicacion de prueba esta aprobada y aun asi no se ve', async () => {
      user.set(NORMAL);
      const service = market();

      expect(ids(await firstValueFrom(service.getAll()))).not.toContain(PUBLICACION_PRUEBA);
      expect(ids(await firstValueFrom(service.getByCategory('accesorios')))).not.toContain(
        PUBLICACION_PRUEBA,
      );
      expect(await firstValueFrom(service.getById(PUBLICACION_PRUEBA))).toBeUndefined();
    });

    it('un admin la ve en el listado y por id', async () => {
      user.set(ADMIN);
      const service = market();

      expect(ids(await firstValueFrom(service.getAll()))).toContain(PUBLICACION_PRUEBA);
      expect((await firstValueFrom(service.getById(PUBLICACION_PRUEBA)))?.isTest).toBe(true);
    });

    /**
     * El caso que hace falta comprobar de verdad: un destacado del home que
     * pasa a ser de prueba tiene que desaparecer de la sección destacada, no
     * solo del listado. Es el camino que no pasa por `getAll()`.
     */
    it('marcar un destacado como prueba lo saca de la seccion del home', async () => {
      const service = market();

      user.set(MODERADOR);
      expect(ids(await firstValueFrom(service.getFeaturedVehicles(3)))).toContain(SUPRA);

      await firstValueFrom(service.setTestFlag(SUPRA, true));

      // El moderador lo sigue viendo: es quien está probando.
      expect(ids(await firstValueFrom(service.getFeaturedVehicles(3)))).toContain(SUPRA);

      user.set(NORMAL);
      const destacados = await firstValueFrom(service.getFeaturedVehicles(3));

      expect(destacados.length).toBeGreaterThan(0);
      expect(ids(destacados)).not.toContain(SUPRA);
      expect(await firstValueFrom(service.getById(SUPRA))).toBeUndefined();
    });

    /**
     * La consecuencia de componer el filtro de prueba con `and` sobre las tres
     * ramas de la política de 0012: la rama del dueño también queda debajo. El
     * modo simulado se comporta igual, para que lo que se prueba con mocks sea
     * lo que pasa en producción.
     */
    it('el dueño normal tampoco ve la suya si la marcaron como prueba', async () => {
      const service = market();

      const creada = await firstValueFrom(
        service.publish(
          {
            title: 'Turbo Garrett',
            description: 'x',
            images: ['x.jpg'],
            price: 1000,
            location: 'Santiago',
            sellerName: 'Quien sea',
            category: 'piezas',
          },
          NORMAL.id,
          NORMAL.displayName,
        ),
      );

      user.set(MODERADOR);
      await firstValueFrom(service.setTestFlag(creada.id, true));

      user.set(NORMAL);
      expect(ids(await firstValueFrom(service.getBySellerId(NORMAL.id)))).not.toContain(creada.id);
    });
  });
});
