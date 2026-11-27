import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { Publicar } from './publicar';
import { AuthService } from '../../../shared/services/auth.service';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { StorageService } from '../../../shared/services/storage.service';
import { ToastService } from '../../../shared/services/toast.service';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { UserModel } from '../../../shared/models/user.model';

const USUARIO: UserModel = {
  id: 'u-1',
  displayName: 'Xaviel Terrero',
  email: 'xaviel@correo.com',
  phone: '809-555-0101',
  isVerified: true,
  role: 'user',
  isAdmin: false,
  createdAt: '2026-07-06T10:00:00Z',
};

describe('Publicar', () => {
  function montar(options: { user?: UserModel | null } = {}) {
    const user = signal<UserModel | null>('user' in options ? options.user! : USUARIO);
    // Deriva del usuario, como la señal de verdad: así una prueba que monte un
    // moderador no tiene que acordarse de cambiar dos cosas.
    const canModerate = computed(() => (user()?.role ?? 'user') !== 'user');
    const publish = vi.fn(
      (
        item: Omit<HubMarketItemModel, 'id'>,
        _sellerId: string,
        _sellerName: string,
        _canModerate?: boolean,
      ) => of({ ...item, id: 999 } as HubMarketItemModel),
    );
    const navigate = vi.fn(() => Promise.resolve(true));
    const show = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user, canModerate } },
        { provide: HubMarketService, useValue: { publish } },
        {
          provide: StorageService,
          useValue: {
            validate: vi.fn(() => null),
            uploadListingImages: vi.fn(() => of(['assets/imgs/x.jpg'])),
          },
        },
        { provide: ToastService, useValue: { show } },
        { provide: Router, useValue: { navigate } },
      ],
    });

    const fixture = TestBed.createComponent(Publicar);
    return { fixture, componente: fixture.componentInstance, publish, show, user, navigate };
  }

  /** Deja el formulario listo para enviar, salvo lo que la prueba quiera cambiar. */
  function llenar(componente: Publicar): void {
    componente.publishForm.patchValue({
      category: 'piezas',
      title: 'Discos Brembo',
      description: 'Poco uso',
      price: 600,
      location: 'Santo Domingo',
    });
    componente.selectedFiles.set([new File(['x'], 'x.jpg', { type: 'image/jpeg' })]);
  }

  it('should create', () => {
    const { componente } = montar();
    expect(componente).toBeTruthy();
  });

  it('hay trabajo sin guardar solo cuando se escribió algo o se eligió una foto', async () => {
    const { fixture, componente } = montar();
    await fixture.whenStable();
    expect(componente.hasUnsavedWork()).toBe(false);

    componente.publishForm.controls.title.setValue('Discos');
    componente.publishForm.controls.title.markAsDirty();
    expect(componente.hasUnsavedWork()).toBe(true);
  });

  it('avisa al cerrar la pestaña con trabajo a medias', async () => {
    const { fixture, componente } = montar();
    await fixture.whenStable();
    componente.publishForm.controls.title.markAsDirty();

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('precarga el teléfono del perfil, para no hacerlo escribir de nuevo', async () => {
    const { fixture, componente } = montar();
    await fixture.whenStable();

    expect(componente.publishForm.controls.contactPhone.value).toBe('809-555-0101');
  });

  it('deja el campo vacío si el perfil no tiene teléfono', async () => {
    const { fixture, componente } = montar({ user: { ...USUARIO, phone: undefined } });
    await fixture.whenStable();

    expect(componente.publishForm.controls.contactPhone.value).toBe('');
  });

  // Con Supabase la sesion se restaura de forma asincrona, asi que al construirse
  // el componente `auth.user()` todavia puede ser null. Estas dos pruebas son las
  // que justifican que la precarga sea un `effect` y no un valor inicial.
  it('precarga también cuando la sesión se restaura después de abrir la página', async () => {
    const { fixture, componente, user } = montar({ user: null });
    await fixture.whenStable();
    expect(componente.publishForm.controls.contactPhone.value).toBe('');

    user.set(USUARIO);
    await fixture.whenStable();

    expect(componente.publishForm.controls.contactPhone.value).toBe('809-555-0101');
  });

  it('no pisa lo que el usuario ya escribio cuando el perfil llega tarde', async () => {
    const { fixture, componente, user } = montar({ user: null });
    await fixture.whenStable();

    componente.publishForm.controls.contactPhone.setValue('829 555 0187');
    componente.publishForm.controls.contactPhone.markAsDirty();
    user.set(USUARIO);
    await fixture.whenStable();

    expect(componente.publishForm.controls.contactPhone.value).toBe('829 555 0187');
  });

  it('el teléfono es opcional: sin el la publicación sale igual', async () => {
    const { fixture, componente, publish } = montar({ user: { ...USUARIO, phone: undefined } });
    await fixture.whenStable();

    llenar(componente);
    componente.onSubmit();
    await fixture.whenStable();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0].contactPhone).toBeUndefined();
  });

  it('guarda el teléfono normalizado, no como lo escribieron', async () => {
    const { fixture, componente, publish } = montar();
    await fixture.whenStable();

    llenar(componente);
    componente.publishForm.controls.contactPhone.setValue('+1 809-555-0134');
    componente.onSubmit();
    await fixture.whenStable();

    expect(publish.mock.calls[0][0].contactPhone).toBe('8095550134');
  });

  it('no publica con un teléfono inválido, y dice por que', async () => {
    const { fixture, componente, publish, show } = montar();
    await fixture.whenStable();

    llenar(componente);
    componente.publishForm.controls.contactPhone.setValue('12345');
    componente.onSubmit();
    await fixture.whenStable();

    expect(publish).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith('Escribe un teléfono válido, ej. 809 555 0134.', 'error');
  });

  // --- Moderacion (fase 5) --------------------------------------------------

  it('a un usuario normal le avisa que su publicación espera aprobación', async () => {
    const { fixture, componente, publish, show, navigate } = montar();
    await fixture.whenStable();

    llenar(componente);
    componente.onSubmit();
    await fixture.whenStable();

    // El cuarto argumento es `canModerate`: false para un usuario normal.
    expect(publish.mock.calls[0][3]).toBe(false);
    expect(show).toHaveBeenCalledWith(
      'Recibimos tu publicación. La revisa un moderador y te aparecerá como "Pendiente" en tu perfil hasta que se apruebe.',
    );
    // A /perfil, que es donde puede verla con su distintivo "Pendiente".
    expect(navigate).toHaveBeenCalledWith(['/perfil']);
  });

  it('a un moderador le confirma que ya está publicada, y lo lleva a verla', async () => {
    const { fixture, componente, publish, show, navigate } = montar({
      user: { ...USUARIO, role: 'moderador' },
    });
    await fixture.whenStable();

    llenar(componente);
    componente.onSubmit();
    await fixture.whenStable();

    expect(publish.mock.calls[0][3]).toBe(true);
    expect(show).toHaveBeenCalledWith('Publicada. Como moderador, tu publicación no necesita aprobación y ya está en Hub Market.');
    expect(navigate).not.toHaveBeenCalledWith(['/perfil']);
  });

  it('un admin también publica directo: canModerate no es solo el moderador', async () => {
    const { fixture, componente, publish } = montar({
      user: { ...USUARIO, role: 'admin', isAdmin: true },
    });
    await fixture.whenStable();

    llenar(componente);
    componente.onSubmit();
    await fixture.whenStable();

    expect(publish.mock.calls[0][3]).toBe(true);
  });

  it('muestra el error debajo del campo, no solo en el aviso', async () => {
    const { fixture, componente } = montar();
    await fixture.whenStable();

    llenar(componente);
    componente.publishForm.controls.contactPhone.setValue('mi celular');
    componente.onSubmit();
    await fixture.whenStable();

    expect(componente.showError('contactPhone')).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Escribe un teléfono válido, ej. 809 555 0134.',
    );
  });

  describe('vehículos: marca, modelo y año del catálogo', () => {
    const toyotaCorolla = { text: 'Toyota Corolla 2018', makeName: 'Toyota', modelName: 'Corolla', makeId: 1, modelId: 3, modelText: '', year: 2018 };

    /** Deja un vehículo listo para enviar, con la marca y el modelo elegidos del selector. */
    function llenarVehiculo(componente: Publicar): void {
      componente.publishForm.patchValue({
        category: 'vehiculos',
        description: 'Impecable',
        price: 900000,
        location: 'Santo Domingo',
        mileage: 60000,
      });
      componente.selectedFiles.set([new File(['x'], 'x.jpg', { type: 'image/jpeg' })]);
    }

    it('pide marca, modelo y año cuando la categoría es vehículos, y no en otra', async () => {
      const { fixture, componente } = montar();
      await fixture.whenStable();

      componente.publishForm.controls.category.setValue('piezas');
      expect(componente.requiredFields().map((f) => f.key)).not.toContain('vehicle-make');

      componente.publishForm.controls.category.setValue('vehiculos');
      expect(componente.requiredFields().map((f) => f.key)).toEqual(
        expect.arrayContaining(['vehicle-make', 'vehicle-model', 'vehicle-year', 'mileage']),
      );
    });

    it('lo que elige el selector va a los campos y arma el título', async () => {
      const { fixture, componente } = montar();
      await fixture.whenStable();
      componente.publishForm.controls.category.setValue('vehiculos');

      componente.onVehiclePick(toyotaCorolla);

      expect(componente.publishForm.getRawValue()).toMatchObject({ brand: 'Toyota', model: 'Corolla', year: 2018, title: 'Toyota Corolla 2018' });
    });

    it('si el título ya lo escribió el usuario, no se lo pisa; si lo armó el selector, sí lo actualiza', async () => {
      const { fixture, componente } = montar();
      await fixture.whenStable();
      componente.publishForm.controls.category.setValue('vehiculos');

      componente.onVehiclePick(toyotaCorolla);
      componente.onVehiclePick({ ...toyotaCorolla, year: 2019, text: 'Toyota Corolla 2019' });
      expect(componente.publishForm.controls.title.value).toBe('Toyota Corolla 2019');

      componente.publishForm.controls.title.setValue('Corolla full, único dueño');
      componente.onVehiclePick({ ...toyotaCorolla, year: 2020, text: 'Toyota Corolla 2020' });
      expect(componente.publishForm.controls.title.value).toBe('Corolla full, único dueño');
    });

    it('publica con la marca y el modelo guardados en vehicleSpecs', async () => {
      const { fixture, componente, publish } = montar();
      await fixture.whenStable();

      llenarVehiculo(componente);
      componente.onVehiclePick(toyotaCorolla);
      componente.onSubmit();
      await fixture.whenStable();

      expect(publish).toHaveBeenCalledTimes(1);
      expect(publish.mock.calls[0][0].vehicleSpecs).toMatchObject({ brand: 'Toyota', model: 'Corolla', year: 2018, mileage: 60000 });
    });

    it('sin marca y modelo no publica un vehículo', async () => {
      const { fixture, componente, publish } = montar();
      await fixture.whenStable();

      llenarVehiculo(componente);
      componente.publishForm.patchValue({ title: 'Mi carro', year: 2018 });
      componente.onSubmit();
      await fixture.whenStable();

      expect(publish).not.toHaveBeenCalled();
      expect(componente.requiredFields().filter((f) => f.invalid).map((f) => f.key)).toEqual(
        expect.arrayContaining(['vehicle-make', 'vehicle-model']),
      );
    });

    it('al cambiar de vehículos a otra categoría se limpian marca, modelo y año', async () => {
      const { fixture, componente } = montar();
      await fixture.whenStable();
      componente.publishForm.controls.category.setValue('vehiculos');
      componente.onVehiclePick(toyotaCorolla);

      componente.publishForm.controls.category.setValue('piezas');
      expect(componente.publishForm.getRawValue()).toMatchObject({ brand: '', model: '', year: null });
    });
  });
});
