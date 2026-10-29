import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { UserModel } from '../models/user.model';
import { AuthService } from './auth.service';
import { SocialInteractionService } from './social-interaction.service';
import { ToastService } from './toast.service';

const USUARIO: UserModel = {
  id: 'u-1',
  displayName: 'Ana',
  email: 'ana@correo.com',
  isVerified: false,
  role: 'user',
  isAdmin: false,
  createdAt: '2026-07-06T10:00:00Z',
};

describe('SocialInteractionService (modo simulado)', () => {
  function montar(user: UserModel | null = USUARIO) {
    const show = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: signal(user) } },
        { provide: ToastService, useValue: { show } },
      ],
    });
    return { service: TestBed.inject(SocialInteractionService), show };
  }

  it('dar y quitar me gusta ajusta el total al instante', async () => {
    const { service } = montar();
    expect(service.likeCount(1, 10)).toBe(10);

    expect(await firstValueFrom(service.toggleLike(1))).toBe(true);
    expect(service.isLiked(1)).toBe(true);
    expect(service.likeCount(1, 10)).toBe(11);

    expect(await firstValueFrom(service.toggleLike(1))).toBe(false);
    expect(service.likeCount(1, 10)).toBe(10);
  });

  it('sin sesión avisa y no da el me gusta', async () => {
    const { service, show } = montar(null);

    expect(await firstValueFrom(service.toggleLike(1))).toBe(false);
    expect(service.isLiked(1)).toBe(false);
    expect(show).toHaveBeenCalledWith('Inicia sesión para dar me gusta.', 'error');
  });

  it('comenta, lista por publicación y borra', async () => {
    const { service } = montar();

    const created = await firstValueFrom(service.addComment(5, '  buen carro  '));
    expect(created.text).toBe('buen carro');
    expect(created.authorName).toBe('Ana');
    await firstValueFrom(service.addComment(6, 'otro'));

    expect((await firstValueFrom(service.getComments(5))).map((c) => c.text)).toEqual(['buen carro']);

    await firstValueFrom(service.deleteComment(created));
    expect(await firstValueFrom(service.getComments(5))).toEqual([]);
  });

  it('un comentario vacío o de más de 500 caracteres se rechaza', async () => {
    const { service } = montar();

    await expect(firstValueFrom(service.addComment(1, '   '))).rejects.toThrow(/entre 1 y 500/);
    await expect(firstValueFrom(service.addComment(1, 'x'.repeat(501)))).rejects.toThrow(/entre 1 y 500/);
  });

  it('sin sesión no se comenta', async () => {
    const { service } = montar(null);
    await expect(firstValueFrom(service.addComment(1, 'hola'))).rejects.toThrow(/Inicia sesión/);
  });
});
