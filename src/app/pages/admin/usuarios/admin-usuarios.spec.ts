import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { AdminUsuarios } from './admin-usuarios';
import { AdminService } from '../../../../shared/services/admin.service';
import { AuthService } from '../../../../shared/services/auth.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { AdminUserModel } from '../../../../shared/models/release.model';
import { UserModel } from '../../../../shared/models/user.model';

const YO: UserModel = {
  id: 'u-admin',
  displayName: 'Xaviel Terrero',
  email: 'admin@ejemplo.com',
  isVerified: true,
  role: 'admin',
  isAdmin: true,
  createdAt: '2026-07-06T10:00:00Z',
};

const OTRO: AdminUserModel = {
  id: 'u-9',
  displayName: 'Luis Mendez',
  email: 'luis@ejemplo.com',
  location: 'La Romana',
  role: 'user',
  isAdmin: false,
  isVerified: false,
  createdAt: new Date('2026-08-10T09:15:00Z'),
};

describe('AdminUsuarios', () => {
  function montar(usuarios: AdminUserModel[] = [OTRO]) {
    const setUserRole = vi.fn(() => of(undefined));
    const show = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AdminService,
          useValue: { getUsers: vi.fn(() => of(usuarios)), setUserRole },
        },
        { provide: AuthService, useValue: { user: signal<UserModel | null>(YO) } },
        { provide: ToastService, useValue: { show } },
      ],
    });

    const fixture = TestBed.createComponent(AdminUsuarios);
    return { fixture, componente: fixture.componentInstance, setUserRole, show };
  }

  it('cuenta admins y moderadores por separado', async () => {
    const { fixture } = montar([
      OTRO,
      { ...OTRO, id: 'u-2', role: 'moderador' },
      { ...OTRO, id: 'u-3', role: 'admin', isAdmin: true },
    ]);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      '3 cuenta(s) · 1 admin · 1 moderador(es)',
    );
  });

  it('nombrar moderador no pide confirmacion: es un permiso acotado', async () => {
    const { fixture, componente, setUserRole } = montar();
    await fixture.whenStable();

    componente.setRole(OTRO, 'moderador');
    await fixture.whenStable();

    expect(setUserRole).toHaveBeenCalledWith('u-9', 'moderador', null);
    expect(componente.users()[0].role).toBe('moderador');
  });

  it('dar admin pide un segundo clic antes de aplicarlo', async () => {
    const { fixture, componente, setUserRole } = montar();
    await fixture.whenStable();

    // Primer clic: solo abre la confirmacion.
    componente.setRole(OTRO, 'admin');
    await fixture.whenStable();

    expect(setUserRole).not.toHaveBeenCalled();
    expect(componente.pendingPromoteId()).toBe('u-9');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Confirmar: dar acceso total',
    );

    // Segundo clic: ahora si.
    componente.setRole(OTRO, 'admin');
    await fixture.whenStable();

    expect(setUserRole).toHaveBeenCalledWith('u-9', 'admin', null);
    expect(componente.users()[0].isAdmin).toBe(true);
  });

  it('quitar permisos no pide confirmacion: es la accion reversible', async () => {
    const admin: AdminUserModel = { ...OTRO, role: 'admin', isAdmin: true };
    const { fixture, componente, setUserRole } = montar([admin]);
    await fixture.whenStable();

    componente.setRole(admin, 'user');
    await fixture.whenStable();

    expect(setUserRole).toHaveBeenCalledWith('u-9', 'user', null);
  });

  it('elegir el rol que ya tiene no llama a la base', async () => {
    const { fixture, componente, setUserRole } = montar();
    await fixture.whenStable();

    componente.setRole(OTRO, 'user');
    await fixture.whenStable();

    expect(setUserRole).not.toHaveBeenCalled();
  });

  it('no ofrece cambiarse el rol a uno mismo: la funcion lo rechaza', async () => {
    const yoEnLaLista: AdminUserModel = {
      ...OTRO,
      id: YO.id,
      displayName: YO.displayName,
      role: 'admin',
      isAdmin: true,
    };
    const { fixture } = montar([yoEnLaLista]);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'No puedes cambiar tu propio rol',
    );
  });

  it('distingue el moderador del admin en la lista', async () => {
    const { fixture } = montar([{ ...OTRO, role: 'moderador' }]);
    await fixture.whenStable();
    const raiz = fixture.nativeElement as HTMLElement;

    expect(raiz.querySelector('.adm-usr__tag--mod')?.textContent?.trim()).toBe('Moderador');
    expect(raiz.querySelector('.adm-usr__tag--admin')).toBeNull();
  });
});
