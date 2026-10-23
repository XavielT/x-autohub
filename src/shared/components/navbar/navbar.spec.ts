import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { WritableSignal, signal } from '@angular/core';

import { Navbar } from './navbar';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { VehiclePickerService } from '../../services/vehicle-picker.service';
import { VehicleService } from '../../services/vehicle.service';
import { ToastService } from '../../services/toast.service';
import { UserModel } from '../../models/user.model';

const BASE: UserModel = {
  id: 'u-1',
  displayName: 'Maria Perez',
  email: 'maria@ejemplo.com',
  role: 'user',
  createdAt: '2026-08-15T00:00:00Z',
};

describe('Navbar', () => {
  let user: WritableSignal<UserModel | null>;
  let label: WritableSignal<string | null>;
  let count: WritableSignal<number>;
  const logout = vi.fn();
  const toast = { show: vi.fn() };
  const toggleCart = vi.fn();

  function montar() {
    TestBed.configureTestingModule({
      providers: [
        // Un comodin: las pruebas navegan a rutas de verdad y el router de pruebas
        // (provideRouter([])) no reconoce ninguna.
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: AuthService,
          useValue: {
            user,
            isLoggedIn: () => user() !== null,
            canModerate: () => user()?.role !== 'user' && user() !== null,
            logout,
          },
        },
        { provide: CartService, useValue: { totalItems: count, toggleCart, isOpen: signal(false) } },
        { provide: VehicleService, useValue: { selectedLabel: label, selected: signal(null) } },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(Navbar);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    user = signal<UserModel | null>(null);
    label = signal<string | null>(null);
    count = signal(0);
    logout.mockReset();
    toggleCart.mockReset();
    toast.show.mockReset();
  });

  const texts = (el: HTMLElement, selector: string) =>
    Array.from(el.querySelectorAll(selector)).map((n) => n.textContent?.replace(/\s+/g, ' ').trim());

  it('muestra el buscador y las cuatro secciones, sin el boton ambar de Publicar', () => {
    const { el } = montar();

    expect(el.querySelector('app-search-box')).not.toBeNull();
    expect(texts(el, '.navbar__menu > li > a, .navbar__menu > li > button.navbar__link')).toEqual(
      expect.arrayContaining(['Tienda', 'Servicios', 'Comunidad']),
    );
    expect(el.textContent).toContain('Vehiculos');
    // El lugar del boton ambar ahora es del carrito.
    expect(el.querySelector('.navbar__cart')).not.toBeNull();
    expect(el.querySelector('a[href="/publicar"].navbar__cart, .nav-button-primary')).toBeNull();
  });

  describe('menu de la Tienda', () => {
    it('empieza cerrado y se abre con el caret, con las 12 categorias de primer nivel', async () => {
      const { fixture, c, el } = montar();
      expect(el.querySelector('.navbar__panel--mega')).toBeNull();

      c.toggleMenu('tienda');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(el.querySelector('.navbar__panel--mega')).not.toBeNull();
      expect(el.querySelectorAll('.navbar__mega-root').length).toBe(12);
      expect(texts(el, '.navbar__mega-root')[0]).toBe('Accesorios interior');
    });

    it('cada categoria enlaza a /tienda con su slug', async () => {
      const { fixture, c, el } = montar();
      c.toggleMenu('tienda');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const frenos = Array.from(el.querySelectorAll('.navbar__mega-root')).find((a) => a.textContent?.trim() === 'Frenos');
      expect(frenos?.getAttribute('href')).toBe('/tienda/c/frenos');
    });

    it('pasar el raton abre el menu y sacarlo lo cierra', () => {
      const { fixture, el } = montar();
      const item = el.querySelector('.navbar__item') as HTMLElement;

      item.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();
      expect(el.querySelector('.navbar__panel')).not.toBeNull();

      item.dispatchEvent(new MouseEvent('mouseleave'));
      fixture.detectChanges();
      expect(el.querySelector('.navbar__panel')).toBeNull();
    });

    it('Escape y un clic fuera lo cierran', () => {
      const { fixture, c, el } = montar();
      c.toggleMenu('tienda');
      fixture.detectChanges();
      c.closeMenu();
      expect(c.openMenu()).toBeNull();

      c.toggleMenu('tienda');
      c.onDocumentClick({ target: document.body } as unknown as Event);
      expect(c.openMenu()).toBeNull();

      c.toggleMenu('tienda');
      c.onDocumentClick({ target: el } as unknown as Event);
      expect(c.openMenu()).toBe('tienda');
    });

    it('solo hay un menu abierto a la vez', () => {
      const { c } = montar();
      c.toggleMenu('tienda');
      c.toggleMenu('vehiculos');
      expect(c.openMenu()).toBe('vehiculos');
    });
  });

  describe('Vehiculos', () => {
    it('agrupa Auto Hub, Hub Market y Publicar', () => {
      const { fixture, c, el } = montar();
      c.toggleMenu('vehiculos');
      fixture.detectChanges();

      const links = Array.from(el.querySelectorAll('.navbar__panel-link')).map((a) => a.getAttribute('href'));
      expect(links).toEqual(['/auto-hub', '/hub-market', '/publicar']);
    });
  });

  describe('seccion activa', () => {
    it('marca la seccion segun la ruta, incluidas las paginas de detalle', async () => {
      const { fixture, c } = montar();
      const router = TestBed.inject(Router);

      await router.navigateByUrl('/hub-part-details/3');
      fixture.detectChanges();
      expect(c.isActive('tienda')).toBe(true);
      expect(c.isActive('vehiculos')).toBe(false);

      await router.navigateByUrl('/car-details/101');
      expect(c.isActive('vehiculos')).toBe(true);
      expect(c.isActive('tienda')).toBe(false);

      await router.navigateByUrl('/social-hub');
      expect(c.isActive('comunidad')).toBe(true);

      await router.navigateByUrl('/buscar?q=disco');
      expect(c.isActive('tienda')).toBe(true);
    });

    it('usa el icono *-hub-icon.svg cuando esta activa', async () => {
      const { c } = montar();
      const router = TestBed.inject(Router);

      await router.navigateByUrl('/servicios');
      expect(c.icon('servicios')).toBe('assets/icons/services-hub-icon.svg');
      expect(c.icon('tienda')).toBe('assets/icons/cart-icon.svg');
    });

    it('/tiendas no cuenta como /tienda: se compara por segmento', async () => {
      const { c } = montar();
      await TestBed.inject(Router).navigateByUrl('/tiendas-falsas');
      expect(c.isActive('tienda')).toBe(false);
    });
  });

  describe('chip Mi vehiculo', () => {
    it('sin vehiculo invita a elegir uno', () => {
      const { el } = montar();
      const chip = el.querySelector('.navbar__vehicle') as HTMLElement;

      expect(chip.textContent).toContain('Elige tu vehiculo');
      expect(chip.classList.contains('has-vehicle')).toBe(false);
    });

    it('con vehiculo dice cual es', () => {
      label.set('Toyota Corolla 2015');
      const { fixture, el } = montar();
      fixture.detectChanges();
      const chip = el.querySelector('.navbar__vehicle') as HTMLElement;

      expect(chip.textContent).toContain('Toyota Corolla 2015');
      expect(chip.classList.contains('has-vehicle')).toBe(true);
      expect(chip.getAttribute('aria-label')).toBe('Mi vehiculo: Toyota Corolla 2015. Cambiar');
    });

    it('al tocarlo abre el selector', () => {
      const { c } = montar();
      const picker = TestBed.inject(VehiclePickerService);

      c.openVehiclePicker();

      expect(picker.isOpen()).toBe(true);
    });
  });

  describe('carrito', () => {
    it('sin articulos no muestra contador', () => {
      const { el } = montar();
      expect(el.querySelector('.navbar__cart-count')).toBeNull();
    });

    it('con articulos muestra el contador y lo dice a los lectores de pantalla', () => {
      count.set(3);
      const { fixture, el } = montar();
      fixture.detectChanges();

      expect(el.querySelector('.navbar__cart-count')?.textContent?.trim()).toBe('3');
      expect(el.querySelector('.navbar__cart')?.getAttribute('aria-label')).toBe('Abrir el carrito, 3 articulos');
    });

    it('tocarlo abre el carrito', () => {
      const { c } = montar();
      c.openCart();
      expect(toggleCart).toHaveBeenCalled();
    });
  });

  describe('cuenta', () => {
    it('sin sesion hay un enlace para entrar', () => {
      const { el } = montar();
      expect(el.querySelector('.navbar__login')?.getAttribute('href')).toBe('/login');
      expect(el.querySelector('.navbar__user')).toBeNull();
    });

    it('con sesion muestra la inicial y el nombre, con Perfil y Salir', () => {
      user.set(BASE);
      const { fixture, c, el } = montar();
      c.toggleMenu('cuenta');
      fixture.detectChanges();

      expect(el.querySelector('.navbar__user-initial')?.textContent?.trim()).toBe('M');
      expect(el.querySelector('.navbar__user-name')?.textContent?.trim()).toBe('Maria Perez');
      const items = texts(el, '.navbar__panel--right .navbar__panel-link');
      expect(items).toEqual(['Mi perfil', 'Salir']);
    });

    it('un moderador ve ademas el Panel; un usuario normal no', () => {
      user.set({ ...BASE, role: 'moderador' });
      const { fixture, c, el } = montar();
      c.toggleMenu('cuenta');
      fixture.detectChanges();

      expect(texts(el, '.navbar__panel--right .navbar__panel-link')).toContain('Panel');
    });

    it('Salir cierra la sesion, avisa y vuelve al inicio', () => {
      user.set(BASE);
      const { c } = montar();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      c.logout();

      expect(logout).toHaveBeenCalled();
      expect(toast.show).toHaveBeenCalledWith('Sesion cerrada.');
      expect(navigate).toHaveBeenCalledWith('/');
    });
  });
});
