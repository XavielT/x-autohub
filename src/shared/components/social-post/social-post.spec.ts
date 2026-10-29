import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SocialPostModel } from '../../models/social-hub.model';
import { UserModel } from '../../models/user.model';
import { AuthService } from '../../services/auth.service';
import { SocialPost, relativeTime } from './social-post';

const USUARIO: UserModel = {
  id: 'u-1',
  displayName: 'Ana',
  email: 'ana@correo.com',
  isVerified: false,
  role: 'user',
  isAdmin: false,
  createdAt: '2026-07-06T10:00:00Z',
};

const POST: SocialPostModel = {
  id: 1,
  authorName: 'Juan M.',
  createdAt: '2026-08-09T18:30:00',
  text: 'Terminamos el armado',
  imageUrl: 'assets/imgs/supra-white.webp',
  tags: ['2JZ'],
  likes: 10,
  comments: 2,
};

describe('relativeTime', () => {
  const now = new Date('2026-08-10T12:00:00').getTime();

  it('habla en días, horas y minutos, con tilde', () => {
    expect(relativeTime('2026-08-10T11:59:50', now)).toBe('ahora mismo');
    expect(relativeTime('2026-08-10T11:30:00', now)).toBe('hace 30 min');
    expect(relativeTime('2026-08-10T09:00:00', now)).toBe('hace 3 h');
    expect(relativeTime('2026-08-09T11:00:00', now)).toBe('hace 1 día');
    expect(relativeTime('2026-08-05T12:00:00', now)).toBe('hace 5 días');
  });
});

describe('SocialPost', () => {
  function montar(user: UserModel | null = USUARIO, post: SocialPostModel = POST) {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { user: signal(user), isLoggedIn: () => !!user, isAdmin: () => false } }],
    });
    const fixture = TestBed.createComponent(SocialPost);
    fixture.componentRef.setInput('post', post);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('el me gusta sube el número y se puede quitar', () => {
    const { fixture, c, el } = montar();
    expect(c.likes()).toBe(10);

    c.toggleLike();
    fixture.detectChanges();
    expect(c.likes()).toBe(11);
    expect(el.querySelector('.post__action--on')).not.toBeNull();

    c.toggleLike();
    fixture.detectChanges();
    expect(c.likes()).toBe(10);
  });

  it('los comentarios se piden al abrirlos, y comentar suma uno', async () => {
    const { fixture, c } = montar();
    expect(c.commentCount()).toBe(2);

    c.toggleComments();
    await fixture.whenStable();
    c.draft.set('Qué limpio');
    c.send();
    await fixture.whenStable();

    expect(c.comments().map((x) => x.text)).toEqual(['Qué limpio']);
    expect(c.commentCount()).toBe(3);

    c.remove(c.comments()[0]);
    await fixture.whenStable();
    expect(c.commentCount()).toBe(2);
  });

  it('sin sesión se leen los comentarios pero no hay caja para escribir', async () => {
    const { fixture, c, el } = montar(null);

    c.toggleComments();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.comment-form')).toBeNull();
    expect(el.textContent).toContain('Inicia sesión para comentar');
  });

  it('muestra un video con controles y las fotos en grande al tocarlas', () => {
    const { fixture, c, el } = montar(USUARIO, {
      ...POST,
      imageUrl: undefined,
      media: [
        { type: 'image', url: 'a.jpg' },
        { type: 'video', url: 'v.mp4' },
      ],
    });
    fixture.detectChanges();

    const video = el.querySelector('video');
    expect(video?.hasAttribute('controls')).toBe(true);
    expect(video?.getAttribute('preload')).toBe('metadata');

    c.openImage('a.jpg');
    expect(c.lightboxOpen()).toBe(true);
    expect(c.lightboxIndex()).toBe(0);
  });
});
