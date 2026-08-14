import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { AuthService } from './auth.service';
import { HubMarketService } from './hub-market.service';
import { OrderService } from './order.service';
import { HubMarketItemModel } from '../models/hub-market-item.model';

/**
 * Los caminos simulados de lo que consume el perfil.
 *
 * `test-providers.ts` inyecta `TestSupabaseService`, así que `shouldUseMockData()`
 * es true y estas pruebas ejercitan las ramas de mock sin tocar la red — ver la
 * trampa correspondiente en `CLAUDE.md`.
 */
describe('HubMarketService.getBySellerId (mock)', () => {
  let service: HubMarketService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HubMarketService);
  });

  const publicar = (sellerId: string, title: string) =>
    firstValueFrom(
      service.publish(
        {
          title,
          description: 'x',
          images: ['x'],
          price: 1000,
          location: 'Santiago',
          sellerName: 'Quien sea',
          category: 'piezas',
          isFeatured: false,
        } as Omit<HubMarketItemModel, 'id'>,
        sellerId,
        'Quien sea',
      ),
    );

  it('no devuelve nada para un vendedor sin publicaciones', async () => {
    // El contenido sembrado no tiene `sellerId`: es de la casa, no de un usuario.
    expect(await firstValueFrom(service.getBySellerId('nadie'))).toEqual([]);
  });

  it('devuelve solo las del vendedor pedido', async () => {
    await publicar('u-1', 'De u-1');
    await publicar('u-2', 'De u-2');
    await publicar('u-1', 'Otra de u-1');

    const mias = await firstValueFrom(service.getBySellerId('u-1'));

    expect(mias.map((i) => i.title).sort()).toEqual(['De u-1', 'Otra de u-1']);
  });

  it('publish() guarda el sellerId, que es lo que hace posible el filtro', async () => {
    const creada = await publicar('u-9', 'Con dueno');

    expect(creada.sellerId).toBe('u-9');
  });

  it('devuelve lo mas nuevo primero', async () => {
    await publicar('u-3', 'Primera');
    // Fechas distintas: sin esperar, las dos comparten el mismo instante ISO y el
    // orden entre ellas seria arbitrario, lo que haria la prueba inestable.
    await new Promise((r) => setTimeout(r, 5));
    await publicar('u-3', 'Segunda');

    const mias = await firstValueFrom(service.getBySellerId('u-3'));

    expect(mias[0].title).toBe('Segunda');
  });
});

describe('OrderService.getByUserId (mock)', () => {
  let service: OrderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OrderService);
  });

  it('trae los pedidos sembrados, del mas nuevo al mas viejo', async () => {
    const pedidos = await firstValueFrom(service.getByUserId('u-1'));

    expect(pedidos.length).toBe(2);
    expect(+pedidos[0].createdAt).toBeGreaterThan(+pedidos[1].createdAt);
  });

  it('un pedido nuevo aparece en la actividad', async () => {
    const antes = (await firstValueFrom(service.getByUserId('u-1'))).length;

    await firstValueFrom(
      service.submit(
        {
          contactEmail: 'a@b.c',
          contactPhone: '',
          fullName: 'A',
          addressLine1: 'B',
          city: '',
          postalCode: '',
          shippingOptionId: 'standard',
          paymentMethodId: 'card',
        },
        [
          {
            part: { id: 1, name: 'Pieza', price: 1000, brand: 'X', category: 'frenos', imgUrl: 'x', description: '', starsRating: 4 },
            quantity: 2,
          },
        ],
        0,
      ),
    );

    const despues = await firstValueFrom(service.getByUserId('u-1'));

    expect(despues.length).toBe(antes + 1);
    // Cuenta unidades, no lineas: dos del mismo articulo son dos articulos.
    expect(despues[0].itemCount).toBe(2);
    expect(despues[0].total).toBe(2000);
    expect(despues[0].status).toBe('pending');
  });
});

describe('AuthService.updateProfile (mock)', () => {
  let auth: AuthService;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    auth = TestBed.inject(AuthService);
    await firstValueFrom(auth.login({ email: 'xaviel@correo.com', password: 'secreta1' }));
  });

  it('actualiza la senal de sesion', async () => {
    await firstValueFrom(
      auth.updateProfile({ displayName: 'Nombre Nuevo', phone: '809-555-1111', location: 'Azua' }),
    );

    expect(auth.user()?.displayName).toBe('Nombre Nuevo');
    expect(auth.user()?.phone).toBe('809-555-1111');
    expect(auth.user()?.location).toBe('Azua');
  });

  it('persiste en localStorage, asi que sobrevive una recarga', async () => {
    await firstValueFrom(auth.updateProfile({ displayName: 'Persistido' }));

    const guardado = JSON.parse(localStorage.getItem('x-autohub.session') ?? '{}');
    expect(guardado.displayName).toBe('Persistido');
  });

  it('recorta los espacios y convierte lo vacio en undefined', async () => {
    await firstValueFrom(
      auth.updateProfile({ displayName: '  Con Espacios  ', phone: '   ', location: '' }),
    );

    expect(auth.user()?.displayName).toBe('Con Espacios');
    // Cadena vacia no: `undefined`, para que la plantilla muestre "Sin telefono".
    expect(auth.user()?.phone).toBeUndefined();
    expect(auth.user()?.location).toBeUndefined();
  });

  it('no cambia el correo ni el id', async () => {
    const antes = auth.user()!;

    await firstValueFrom(auth.updateProfile({ displayName: 'Otro' }));

    expect(auth.user()?.email).toBe(antes.email);
    expect(auth.user()?.id).toBe(antes.id);
  });

  it('falla con un mensaje claro si no hay sesion', async () => {
    auth.logout();

    await expect(firstValueFrom(auth.updateProfile({ displayName: 'X' }))).rejects.toThrow(
      /sesion/i,
    );
  });
});
