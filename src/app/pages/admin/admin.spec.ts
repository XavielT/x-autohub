import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { Admin } from './admin';
import { AuthService } from '../../../shared/services/auth.service';
import { UserModel, UserRole } from '../../../shared/models/user.model';

const USUARIO: UserModel = {
  id: 'u-1',
  displayName: 'Xaviel Terrero',
  email: 'xaviel@correo.com',
  isVerified: true,
  role: 'admin',
  isAdmin: true,
  createdAt: '2026-07-06T10:00:00Z',
};

/**
 * La navegación del panel según el rol.
 *
 * No es cosmética: dibujarle a un moderador una pestaña que su `adminGuard` va a
 * rebotar lo manda a la raíz con un mensaje de error por hacer clic justo donde
 * la interfaz se lo ofreció.
 */
describe('Admin', () => {
  function montar(role: UserRole) {
    const user = signal<UserModel | null>({
      ...USUARIO,
      role,
      isAdmin: role === 'admin',
    });

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { user, isAdmin: () => role === 'admin' },
        },
      ],
    });

    const fixture = TestBed.createComponent(Admin);
    return { fixture, componente: fixture.componentInstance };
  }

  it('un admin ve las seis secciones', () => {
    const { componente } = montar('admin');

    expect(componente.sections().map((s) => s.path)).toEqual([
      'moderacion',
      'versiones',
      'pedidos',
      'inventario',
      'usuarios',
      'ajustes',
    ]);
  });

  it('un moderador solo ve moderacion', () => {
    const { componente } = montar('moderador');

    expect(componente.sections().map((s) => s.path)).toEqual(['moderacion']);
  });

  it('no le ofrece usuarios a un moderador ni en el HTML', async () => {
    const { fixture } = montar('moderador');
    await fixture.whenStable();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(texto).toContain('Moderacion');
    expect(texto).not.toContain('Usuarios');
    expect(texto).not.toContain('Inventario');
    expect(texto).not.toContain('Pedidos');
    // Los ajustes del sitio cambian lo que ve todo el mundo: no son moderacion.
    expect(texto).not.toContain('Ajustes');
  });

  it('dice de que rol es la sesion abierta', async () => {
    const { fixture } = montar('moderador');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Sesion de Xaviel Terrero · Moderador',
    );
  });
});
