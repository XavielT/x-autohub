import { TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';

import { Footer } from './footer';
import { AuthService } from '../../services/auth.service';
import { STORE_PHONE, STORE_PHONE_DISPLAY, storeWhatsAppLink } from '../../utils/contact';
import { UserModel } from '../../models/user.model';

describe('Footer', () => {
  let user: WritableSignal<UserModel | null>;

  async function montar() {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { user, isLoggedIn: () => user() !== null } }],
    });
    const fixture = TestBed.createComponent(Footer);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    user = signal<UserModel | null>(null);
  });

  const links = (el: HTMLElement, label: string) =>
    Array.from(el.querySelectorAll(`nav[aria-label="${label}"] a`)).map((a) => a.getAttribute('href'));

  it('tiene las cinco columnas del plan', async () => {
    const { el } = await montar();
    const titles = Array.from(el.querySelectorAll('.footer__title')).map((t) => t.textContent?.trim());

    expect(titles).toEqual(['Tienda', 'Servicios', 'Vehículos', 'Comunidad', 'Cuenta']);
  });

  it('la columna Tienda lista las 12 categorias de primer nivel y el enlace a toda la tienda', async () => {
    const { el } = await montar();
    const tienda = links(el, 'Tienda');

    expect(tienda.length).toBe(13);
    expect(tienda[0]).toBe('/tienda?categoria=accesorios-interior');
    expect(tienda[12]).toBe('/tienda');
  });

  it('Vehiculos agrupa Auto Hub, Hub Market y Publicar', async () => {
    const { el } = await montar();
    expect(links(el, 'Vehiculos')).toEqual(['/auto-hub', '/hub-market', '/publicar']);
  });

  it('la linea de contacto trae el WhatsApp 809-953-9782 con su enlace', async () => {
    const { el } = await montar();
    const link = el.querySelector('.footer__contact a') as HTMLAnchorElement;

    expect(link.textContent?.trim()).toBe('809-953-9782');
    expect(link.href).toBe('https://wa.me/18099539782?text=Hola%20X%20AutoHub');
  });

  it('ya no hay enlaces muertos (href="#")', async () => {
    const { el } = await montar();
    const muertos = Array.from(el.querySelectorAll('a')).filter((a) => a.getAttribute('href') === '#');

    expect(muertos).toEqual([]);
    // Privacidad, Contacto y Reportar problema no tienen pagina: no se muestran.
    expect(el.textContent).not.toContain('Privacidad');
    expect(el.textContent).not.toContain('Reportar problema');
    expect(links(el, 'Servicios')).toContain('/servicios');
  });

  it('la columna Cuenta cambia con la sesion', async () => {
    const guest = await montar();
    expect(links(guest.el, 'Cuenta')).toEqual(['/login', '/registro']);

    TestBed.resetTestingModule();
    user = signal<UserModel | null>({
      id: 'u',
      displayName: 'M',
      email: 'm@e.com',
      role: 'user',
      createdAt: '2026-08-15T00:00:00Z',
    });
    const logged = await montar();
    expect(links(logged.el, 'Cuenta')).toEqual(['/perfil']);
  });

  it('conserva Terminos y condiciones y las redes', async () => {
    const { el } = await montar();

    expect(el.querySelector('.footer__legal a')?.getAttribute('href')).toBe('/terminos-condiciones');
    expect(el.querySelectorAll('.footer__social-link').length).toBe(3);
  });
});

describe('contacto de la tienda', () => {
  it('el numero es uno solo: 809-953-9782', () => {
    expect(STORE_PHONE).toBe('8099539782');
    expect(STORE_PHONE_DISPLAY).toBe('809-953-9782');
  });

  it('el enlace de WhatsApp lleva el codigo de pais y el mensaje codificado', () => {
    expect(storeWhatsAppLink()).toBe('https://wa.me/18099539782?text=Hola%20X%20AutoHub');
    expect(storeWhatsAppLink('Quiero cotizar & más')).toBe(
      'https://wa.me/18099539782?text=Quiero%20cotizar%20%26%20m%C3%A1s',
    );
  });
});
