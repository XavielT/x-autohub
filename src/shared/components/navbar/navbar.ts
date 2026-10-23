import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { LogoHub } from '../logo-hub/logo-hub';
import { SearchBox } from '../search-box/search-box';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { CategoryService } from '../../services/category.service';
import { ToastService } from '../../services/toast.service';
import { VehiclePickerService } from '../../services/vehicle-picker.service';
import { VehicleService } from '../../services/vehicle.service';

export type NavSection = 'tienda' | 'servicios' | 'vehiculos' | 'comunidad';
type MenuId = 'tienda' | 'vehiculos' | 'cuenta';

/**
 * Qué rutas cuentan como "estar dentro" de cada sección, para marcarla activa.
 *
 * Las páginas de detalle y el checkout también: quien está viendo una pieza sigue
 * estando en la tienda, y quien está viendo un carro de Hub Market sigue en
 * Vehículos.
 */
const SECTION_PREFIXES: Record<NavSection, readonly string[]> = {
  tienda: ['/tienda', '/catalogo', '/buscar', '/hub-part-details', '/checkout'],
  servicios: ['/servicios'],
  vehiculos: [
    '/auto-hub',
    '/hub-market',
    '/car-details',
    '/auto-hub-details',
    '/hub-market-part-details',
    '/accessory-details',
    '/publicar',
  ],
  comunidad: ['/social-hub', '/news'],
};

/**
 * La barra de arriba (pivote de octubre de 2026, fase 2).
 *
 * En escritorio: logo, buscador, Tienda (con menú de categorías), Servicios,
 * Vehículos (Auto Hub, Hub Market y Publicar), Comunidad, el chip de "Mi
 * vehículo", el carrito y la cuenta. En el teléfono queda solo logo, buscador y
 * carrito; lo demás vive en la barra de pestañas de abajo (`MobileTabBar`).
 *
 * "Publicar" dejó de ser el botón ámbar: ese lugar es del carrito. Publicar
 * vive dentro de Vehículos y en la propia página de Hub Market.
 */
@Component({
  selector: 'app-navbar',
  imports: [LogoHub, RouterModule, SearchBox],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'closeMenu()',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class Navbar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly cart = inject(CartService);
  private readonly categories = inject(CategoryService);
  private readonly vehicles = inject(VehicleService);
  private readonly picker = inject(VehiclePickerService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly isLoggedIn = this.auth.isLoggedIn;
  readonly user = this.auth.user;
  /**
   * La entrada al panel se dibuja para quien pueda moderar — moderador o admin.
   *
   * Apunta a `/admin`, cuyo redirect lleva a `moderacion`: es la única sección
   * que abren los dos roles, así que ninguno cae en una pantalla que su guard
   * vaya a rebotar. Ver `moderatorGuard`.
   */
  readonly canModerate = this.auth.canModerate;

  /** Las categorías de primer nivel con sus hijas, para el menú de la Tienda. */
  readonly categoryTree = toSignal(this.categories.getTree(), { initialValue: [] });

  readonly cartCount = this.cart.totalItems;
  /** "Toyota Corolla 2015", o `null` si no hay vehículo elegido. */
  readonly vehicleLabel = this.vehicles.selectedLabel;

  /** El menú desplegado, si hay alguno. Solo uno a la vez. */
  readonly openMenu = signal<MenuId | null>(null);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** ¿La página actual pertenece a esta sección? Sin importar los parámetros. */
  isActive(section: NavSection): boolean {
    const path = this.url().split(/[?#]/)[0];
    return SECTION_PREFIXES[section].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  }

  /** El icono de la sección: el del par `*-hub-icon.svg` cuando está activa. */
  icon(section: NavSection): string {
    const names: Record<NavSection, [off: string, on: string]> = {
      tienda: ['cart-icon', 'cart-hub-icon'],
      servicios: ['services-icon', 'services-hub-icon'],
      vehiculos: ['auto-icon', 'auto-hub-icon'],
      comunidad: ['network2-icon', 'network2-hub-icon'],
    };
    return `assets/icons/${names[section][this.isActive(section) ? 1 : 0]}.svg`;
  }

  openMenuFor(menu: MenuId): void {
    this.openMenu.set(menu);
  }

  toggleMenu(menu: MenuId): void {
    this.openMenu.update((current) => (current === menu ? null : menu));
  }

  closeMenu(): void {
    this.openMenu.set(null);
  }

  /** Un clic fuera del navbar cierra el menú abierto. */
  onDocumentClick(event: Event): void {
    if (this.openMenu() !== null && !this.host.nativeElement.contains(event.target as Node)) {
      this.closeMenu();
    }
  }

  openCart(): void {
    this.closeMenu();
    this.cart.toggleCart();
  }

  openVehiclePicker(): void {
    this.closeMenu();
    this.picker.open();
  }

  logout(): void {
    this.auth.logout();
    this.closeMenu();
    this.toast.show('Sesion cerrada.');
    void this.router.navigateByUrl('/');
  }
}
