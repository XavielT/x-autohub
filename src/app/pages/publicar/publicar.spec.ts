import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
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
  isAdmin: false,
  createdAt: '2026-07-06T10:00:00Z',
};

describe('Publicar', () => {
  function montar(options: { user?: UserModel | null } = {}) {
    const user = signal<UserModel | null>('user' in options ? options.user! : USUARIO);
    const publish = vi.fn((item: Omit<HubMarketItemModel, 'id'>) =>
      of({ ...item, id: 999 } as HubMarketItemModel),
    );
    const show = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user } },
        { provide: HubMarketService, useValue: { publish } },
        {
          provide: StorageService,
          useValue: {
            validate: vi.fn(() => null),
            uploadListingImages: vi.fn(() => of(['assets/imgs/x.jpg'])),
          },
        },
        { provide: ToastService, useValue: { show } },
        { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
      ],
    });

    const fixture = TestBed.createComponent(Publicar);
    return { fixture, componente: fixture.componentInstance, publish, show, user };
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

  it('precarga el telefono del perfil, para no hacerlo escribir de nuevo', async () => {
    const { fixture, componente } = montar();
    await fixture.whenStable();

    expect(componente.publishForm.controls.contactPhone.value).toBe('809-555-0101');
  });

  it('deja el campo vacio si el perfil no tiene telefono', async () => {
    const { fixture, componente } = montar({ user: { ...USUARIO, phone: undefined } });
    await fixture.whenStable();

    expect(componente.publishForm.controls.contactPhone.value).toBe('');
  });

  // Con Supabase la sesion se restaura de forma asincrona, asi que al construirse
  // el componente `auth.user()` todavia puede ser null. Estas dos pruebas son las
  // que justifican que la precarga sea un `effect` y no un valor inicial.
  it('precarga tambien cuando la sesion se restaura despues de abrir la pagina', async () => {
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

  it('el telefono es opcional: sin el la publicacion sale igual', async () => {
    const { fixture, componente, publish } = montar({ user: { ...USUARIO, phone: undefined } });
    await fixture.whenStable();

    llenar(componente);
    componente.onSubmit();
    await fixture.whenStable();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0].contactPhone).toBeUndefined();
  });

  it('guarda el telefono normalizado, no como lo escribieron', async () => {
    const { fixture, componente, publish } = montar();
    await fixture.whenStable();

    llenar(componente);
    componente.publishForm.controls.contactPhone.setValue('+1 809-555-0134');
    componente.onSubmit();
    await fixture.whenStable();

    expect(publish.mock.calls[0][0].contactPhone).toBe('8095550134');
  });

  it('no publica con un telefono invalido, y dice por que', async () => {
    const { fixture, componente, publish, show } = montar();
    await fixture.whenStable();

    llenar(componente);
    componente.publishForm.controls.contactPhone.setValue('12345');
    componente.onSubmit();
    await fixture.whenStable();

    expect(publish).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith('Escribe un telefono valido, ej. 809 555 0134.', 'error');
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
      'Escribe un telefono valido, ej. 809 555 0134.',
    );
  });
});
