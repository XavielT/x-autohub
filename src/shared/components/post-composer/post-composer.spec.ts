import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { UserModel } from '../../models/user.model';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { PostComposer, extractTags } from './post-composer';

const USUARIO: UserModel = {
  id: 'u-1',
  displayName: 'Ana',
  email: 'ana@correo.com',
  isVerified: false,
  role: 'user',
  isAdmin: false,
  createdAt: '2026-07-06T10:00:00Z',
};

describe('extractTags', () => {
  it('saca los #hashtags sin repetir, con tildes y números', () => {
    expect(extractTags('Mi #Supra y mi #supra2 con #Pasión #Supra')).toEqual(['Supra', 'supra2', 'Pasión']);
  });

  it('ignora un # suelto o de una letra', () => {
    expect(extractTags('# hola #a')).toEqual([]);
  });
});

describe('PostComposer', () => {
  function montar() {
    const show = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: signal(USUARIO) } },
        { provide: ToastService, useValue: { show } },
      ],
    });
    const fixture = TestBed.createComponent(PostComposer);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, show };
  }

  it('no se puede publicar sin texto', () => {
    const { c } = montar();
    expect(c.canPublish()).toBe(false);
    c.text.set('Hola');
    expect(c.canPublish()).toBe(true);
  });

  it('publica con etiquetas y limpia el formulario', async () => {
    const { fixture, c, show } = montar();
    const emitidos: string[][] = [];
    c.published.subscribe((p) => emitidos.push(p.tags));
    c.text.set('Mi build #JDM');

    c.publish();
    await fixture.whenStable();

    expect(emitidos).toEqual([['JDM']]);
    expect(c.text()).toBe('');
    expect(show).toHaveBeenCalledWith('Publicado en la comunidad.');
  });

  it('rechaza un video de más de 25 MB con un aviso', async () => {
    const { c, show } = montar();
    const grande = new File(['x'], 'v.mp4', { type: 'video/mp4' });
    Object.defineProperty(grande, 'size', { value: 26 * 1024 * 1024 });

    await c.onPick({ target: { files: [grande], value: '' } } as unknown as Event);

    expect(c.files()).toHaveLength(0);
    expect(show).toHaveBeenCalledWith(expect.stringContaining('25 MB'), 'error');
  });
});
