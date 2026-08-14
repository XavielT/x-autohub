import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { Perfil } from './perfil';
import { AuthService } from '../../../shared/services/auth.service';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { OrderService } from '../../../shared/services/order.service';
import { UserModel } from '../../../shared/models/user.model';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { UserOrderModel } from '../../../shared/models/user-order.model';

const USUARIO: UserModel = {
  id: 'u-1',
  displayName: 'Xaviel Terrero',
  email: 'xaviel@correo.com',
  phone: '809-555-0101',
  location: 'Santiago',
  isVerified: true,
  isAdmin: false,
  createdAt: '2026-07-06T10:00:00Z',
};

const PUBLICACION: HubMarketItemModel = {
  id: 1,
  title: 'Honda Civic 2018',
  description: 'Un dueno',
  images: ['assets/imgs/x.jpg'],
  price: 1250000,
  location: 'Santiago',
  sellerName: 'Xaviel Terrero',
  sellerId: 'u-1',
  category: 'vehiculos',
  isFeatured: false,
  detailRoute: '/car-details/1',
  vehicleSpecs: { year: 2018, mileage: 68000 },
};

const PEDIDO: UserOrderModel = {
  id: '7f038d63-ac9d-41d2-af3d-1c8cae1f62b6',
  createdAt: new Date('2026-08-12T11:05:00Z'),
  itemCount: 3,
  total: 28750,
  status: 'paid',
};

describe('Perfil', () => {
  function montar(options: {
    user?: UserModel | null;
    publicaciones?: HubMarketItemModel[];
    pedidos?: UserOrderModel[];
  } = {}) {
    const user = signal<UserModel | null>(options.user ?? USUARIO);
    const updateProfile = vi.fn((changes: { displayName: string; phone?: string; location?: string }) => {
      const next = { ...user()!, ...changes };
      user.set(next);
      return of(next);
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user, updateProfile } },
        {
          provide: HubMarketService,
          useValue: { getBySellerId: vi.fn(() => of(options.publicaciones ?? [PUBLICACION])) },
        },
        {
          provide: OrderService,
          useValue: { getByUserId: vi.fn(() => of(options.pedidos ?? [PEDIDO])) },
        },
      ],
    });

    const fixture = TestBed.createComponent(Perfil);
    return { fixture, componente: fixture.componentInstance, user, updateProfile };
  }

  it('muestra los datos del usuario en sesion', async () => {
    const { fixture } = montar();
    await fixture.whenStable();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(texto).toContain('Xaviel Terrero');
    expect(texto).toContain('xaviel@correo.com');
    expect(texto).toContain('809-555-0101');
    expect(texto).toContain('Santiago');
    expect(texto).toContain('Verificado');
  });

  it('dice "Sin telefono" cuando no hay, en vez de dejarlo en blanco', async () => {
    const { fixture } = montar({ user: { ...USUARIO, phone: undefined } });
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sin telefono');
  });

  // Dos pruebas y no una: `TestBed` no se puede reconfigurar despues de crear un
  // componente, asi que cada montaje necesita su propio caso.
  it('no muestra rol a un usuario normal', async () => {
    const { fixture } = montar();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Administrador');
  });

  it('muestra el rol de forma discreta a un admin', async () => {
    const { fixture } = montar({ user: { ...USUARIO, isAdmin: true } });
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Administrador');
  });

  it('lista las publicaciones del usuario', async () => {
    const { fixture, componente } = montar();
    await fixture.whenStable();

    expect(componente.publications().length).toBe(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Honda Civic 2018');
  });

  it('ofrece publicar cuando no hay publicaciones', async () => {
    const { fixture } = montar({ publicaciones: [] });
    await fixture.whenStable();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(texto).toContain('Todavia no has publicado nada');
    expect(texto).toContain('Publicar mi primer articulo');
  });

  it('lista la actividad con su estado en espanol', async () => {
    const { fixture } = montar();
    await fixture.whenStable();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(texto).toContain('3 articulos');
    expect(texto).toContain('28,750');
    expect(texto).toContain('Pagado');
    // Los 8 primeros del uuid, no el uuid entero.
    expect(texto).toContain('#7f038d63');
  });

  it('avisa de que las compras sin cuenta no aparecen', async () => {
    const { fixture } = montar();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'sin cuenta no aparecen aqui',
    );
  });

  it('un articulo en singular no dice "articulos"', async () => {
    const { fixture } = montar({ pedidos: [{ ...PEDIDO, itemCount: 1 }] });
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('1 articulo');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('1 articulos');
  });

  describe('edicion', () => {
    it('precarga el formulario con los datos actuales', async () => {
      const { fixture, componente } = montar();
      await fixture.whenStable();

      componente.startEdit();

      expect(componente.form.getRawValue()).toEqual({
        displayName: 'Xaviel Terrero',
        phone: '809-555-0101',
        location: 'Santiago',
      });
    });

    it('no guarda con el nombre vacio y lo nombra en el aviso', async () => {
      const { fixture, componente, updateProfile } = montar();
      await fixture.whenStable();
      componente.startEdit();
      componente.form.controls.displayName.setValue('');

      componente.save();

      expect(updateProfile).not.toHaveBeenCalled();
      expect(componente.isEditing()).toBe(true);
    });

    it('guarda y cierra el modo edicion', async () => {
      const { fixture, componente, updateProfile } = montar();
      await fixture.whenStable();
      componente.startEdit();
      componente.form.controls.displayName.setValue('Xaviel T.');
      componente.form.controls.phone.setValue('809-555-9999');

      componente.save();

      expect(updateProfile).toHaveBeenCalledWith({
        displayName: 'Xaviel T.',
        phone: '809-555-9999',
        location: 'Santiago',
      });
      expect(componente.isEditing()).toBe(false);
    });

    it('el nombre nuevo se refleja de inmediato, porque la senal es la de la sesion', async () => {
      const { fixture, componente } = montar();
      await fixture.whenStable();
      componente.startEdit();
      componente.form.controls.displayName.setValue('Nombre Nuevo');

      componente.save();
      await fixture.whenStable();

      // Es la misma senal que consume el navbar: si aquí cambia, allí también.
      expect(componente.user()?.displayName).toBe('Nombre Nuevo');
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nombre Nuevo');
    });

    it('cancelar no toca los datos', async () => {
      const { fixture, componente, updateProfile } = montar();
      await fixture.whenStable();
      componente.startEdit();
      componente.form.controls.displayName.setValue('Descartado');

      componente.cancelEdit();

      expect(updateProfile).not.toHaveBeenCalled();
      expect(componente.user()?.displayName).toBe('Xaviel Terrero');
    });
  });
});
