import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/storage.service';
import { ToastService } from '../../services/toast.service';
import { UserModel } from '../../models/user.model';
import { AvatarEditor } from './avatar-editor';

const USUARIO: UserModel = {
  id: 'u-1',
  displayName: 'Xaviel Terrero',
  email: 'x@correo.com',
  phone: '8095550101',
  location: 'Santiago',
  isVerified: false,
  role: 'user',
  isAdmin: false,
  createdAt: '2026-07-06T10:00:00Z',
};

describe('AvatarEditor', () => {
  function montar(user: UserModel = USUARIO) {
    const updateProfile = vi.fn(() => of(user));
    const show = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: signal(user), updateProfile } },
        { provide: StorageService, useValue: { uploadAvatar: vi.fn(() => of('https://x/a.jpg')) } },
        { provide: ToastService, useValue: { show } },
      ],
    });
    const fixture = TestBed.createComponent(AvatarEditor);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, updateProfile, show };
  }

  it('ofrece los ocho avatares del sitio', () => {
    const { el } = montar();
    expect(el.querySelectorAll('.ae__choice')).toHaveLength(8);
  });

  it('elegir un avatar lo guarda sin tocar el resto del perfil', () => {
    const { fixture, updateProfile, show } = montar();

    fixture.componentInstance.chooseSite('assets/avatars/rueda.svg');

    expect(updateProfile).toHaveBeenCalledWith({
      displayName: 'Xaviel Terrero',
      phone: '8095550101',
      location: 'Santiago',
      avatarUrl: 'assets/avatars/rueda.svg',
    });
    expect(show).toHaveBeenCalledWith('Avatar actualizado.');
  });

  it('"Quitar foto" solo aparece si hay una y manda null', () => {
    const sin = montar();
    expect(sin.el.textContent).not.toContain('Quitar foto');
    TestBed.resetTestingModule();

    const con = montar({ ...USUARIO, avatarUrl: 'assets/avatars/casco.svg' });
    expect(con.el.textContent).toContain('Quitar foto');
    con.fixture.componentInstance.remove();
    expect(con.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: null }));
  });
});
