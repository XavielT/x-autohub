import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { WritableSignal, signal } from '@angular/core';

import { MobileTabBar } from './mobile-tab-bar';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { VehicleService } from '../../services/vehicle.service';
import { ToastService } from '../../services/toast.service';
import { VehiclePickerService } from '../../services/vehicle-picker.service';
import { UserModel } from '../../models/user.model';

const BASE: UserModel = {
  id: 'u-1',
  displayName: 'Maria Perez',
  email: 'maria@ejemplo.com',
  role: 'user',
  createdAt: '2026-08-15T00:00:00Z',
};

describe('MobileTabBar', () => {
  let user: WritableSignal<UserModel | null>;
  let count: WritableSignal<number>;
  let cartOpen: WritableSignal<boolean>;
  const logout = vi.fn();
  const toggleCart = vi.fn();
  const closePanel = vi.fn();
  const toast = { show: vi.fn() };

  function montar() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: AuthService,
          useValue: {
            user,
            isLoggedIn: () => user() !== null,
            canModerate: () => user() !== null && user()?.role !== 'user',
            logout,
          },
        },
        { provide: CartService, useValue: { totalItems: count, isOpen: cartOpen, toggleCart, closePanel } },
        { provide: VehicleService, useValue: { selectedLabel: signal<string | null>('Honda Civic 2018'), selected: signal(null) } },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(MobileTabBar);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    user = signal<UserModel | null>(null);
    count = signal(0);
    cartOpen = signal(false);
    logout.mockReset();
    toggleCart.mockReset();
    closePanel.mockReset();
    toast.show.mockReset();
  });

  const tabLabels = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.tabs__tab')).map((t) => t.textContent?.replace(/\s+/g, ' ').trim());

  it('tiene las cinco pestanas del plan, en orden', () => {
    const { el } = montar();
    expect(tabLabels(el)).toEqual(['Inicio', 'Categorías', 'Buscar', 'Carrito', 'Cuenta']);
  });

  it('Inicio y Buscar son enlaces; Categorias, Carrito y Cuenta son botones', () => {
    const { el } = montar();
    const tabs = Array.from(el.querySelectorAll('.tabs__tab'));
    expect(tabs.map((t) => t.tagName)).toEqual(['A', 'BUTTON', 'A', 'BUTTON', 'BUTTON']);
    expect(tabs[0].getAttribute('href')).toBe('/');
    expect(tabs[2].getAttribute('href')).toBe('/buscar');
  });

  describe('pestana activa', () => {
    it('sigue la pagina: Inicio en /, Buscar en /buscar', async () => {
      const { c } = montar();
      const router = TestBed.inject(Router);

      await router.navigateByUrl('/');
      expect(c.activeTab()).toBe('inicio');
      await router.navigateByUrl('/buscar?q=disco');
      expect(c.activeTab()).toBe('buscar');
      await router.navigateByUrl('/perfil');
      expect(c.activeTab()).toBe('cuenta');
      await router.navigateByUrl('/servicios');
      expect(c.activeTab()).toBeNull();
    });

    it('una hoja abierta manda sobre la pagina, y el carrito abierto tambien', async () => {
      const { c } = montar();
      await TestBed.inject(Router).navigateByUrl('/');

      c.toggleSheet('categorias');
      expect(c.activeTab()).toBe('categorias');

      c.closeSheet();
      cartOpen.set(true);
      expect(c.activeTab()).toBe('carrito');
    });

    it('usa el icono *-hub-icon.svg de la pestana activa', async () => {
      const { c } = montar();
      await TestBed.inject(Router).navigateByUrl('/');

      expect(c.icon('inicio')).toBe('assets/icons/home-hub-icon.svg');
      expect(c.icon('carrito')).toBe('assets/icons/cart-icon.svg');
      expect(c.icon('buscar')).toBe('assets/icons/search-icon.svg');
    });
  });

  describe('hoja de Categorias', () => {
    it('lista las 12 categorias y un enlace a toda la tienda', async () => {
      const { fixture, c, el } = montar();
      c.toggleSheet('categorias');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(el.querySelectorAll('.tabs__root').length).toBe(12);
      expect(el.querySelector('.tabs__all')?.getAttribute('href')).toBe('/tienda');
      expect(el.querySelector('.tabs__root')?.getAttribute('href')).toBe('/tienda?categoria=accesorios-interior');
    });

    it('tocar la pestana otra vez la cierra, y Escape tambien', () => {
      const { c } = montar();
      c.toggleSheet('categorias');
      expect(c.sheet()).toBe('categorias');
      c.toggleSheet('categorias');
      expect(c.sheet()).toBeNull();

      c.toggleSheet('cuenta');
      c.closeSheet();
      expect(c.sheet()).toBeNull();
    });

    it('abrir una hoja cierra el carrito, y elegir una categoria cierra la hoja', () => {
      const { c } = montar();
      c.toggleSheet('categorias');
      expect(closePanel).toHaveBeenCalled();

      c.go();
      expect(c.sheet()).toBeNull();
    });
  });

  describe('hoja de Cuenta', () => {
    it('sin sesion ofrece Entrar y Crear cuenta', () => {
      const { fixture, c, el } = montar();
      c.toggleSheet('cuenta');
      fixture.detectChanges();

      const ctas = Array.from(el.querySelectorAll('.tabs__cta')).map((a) => a.getAttribute('href'));
      expect(ctas).toEqual(['/login', '/registro']);
      expect(el.textContent).not.toContain('Salir');
    });

    it('con sesion muestra el perfil y Salir', () => {
      user.set(BASE);
      const { fixture, c, el } = montar();
      c.toggleSheet('cuenta');
      fixture.detectChanges();

      expect(el.querySelector('.tabs__me')?.textContent).toContain('Maria Perez');
      expect(el.textContent).toContain('Salir');
    });

    it('agrupa Vehiculos (Auto Hub, Hub Market, Publicar), Servicios y Comunidad', () => {
      const { fixture, c, el } = montar();
      c.toggleSheet('cuenta');
      fixture.detectChanges();

      const links = Array.from(el.querySelectorAll('.tabs__link')).map((a) => a.getAttribute('href'));
      expect(links).toEqual(['/auto-hub', '/hub-market', '/publicar', '/servicios', '/social-hub']);
    });

    it('el panel de administracion solo sale para quien modera', () => {
      const { fixture, c, el } = montar();
      c.toggleSheet('cuenta');
      fixture.detectChanges();
      expect(el.querySelector('a[href="/admin"]')).toBeNull();

      user.set({ ...BASE, role: 'admin', isAdmin: true });
      fixture.detectChanges();
      expect(el.querySelector('a[href="/admin"]')).not.toBeNull();
    });

    it('muestra el vehiculo elegido y al tocarlo abre el selector', () => {
      const { fixture, c, el } = montar();
      c.toggleSheet('cuenta');
      fixture.detectChanges();
      expect(el.querySelector('.tabs__vehicle')?.textContent).toContain('Honda Civic 2018');

      c.openVehiclePicker();
      expect(TestBed.inject(VehiclePickerService).isOpen()).toBe(true);
      expect(c.sheet()).toBeNull();
    });

    it('Salir cierra la sesion, cierra la hoja, avisa y vuelve al inicio', () => {
      user.set(BASE);
      const { c } = montar();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      c.toggleSheet('cuenta');

      c.logout();

      expect(logout).toHaveBeenCalled();
      expect(c.sheet()).toBeNull();
      expect(toast.show).toHaveBeenCalledWith('Sesion cerrada.');
      expect(navigate).toHaveBeenCalledWith('/');
    });
  });

  describe('carrito', () => {
    it('abre el carrito y cierra cualquier hoja', () => {
      const { c } = montar();
      c.toggleSheet('cuenta');

      c.openCart();

      expect(toggleCart).toHaveBeenCalled();
      expect(c.sheet()).toBeNull();
    });

    it('muestra el contador solo si hay articulos', () => {
      const { fixture, el } = montar();
      expect(el.querySelector('.tabs__count')).toBeNull();

      count.set(4);
      fixture.detectChanges();
      expect(el.querySelector('.tabs__count')?.textContent?.trim()).toBe('4');
    });
  });
});
