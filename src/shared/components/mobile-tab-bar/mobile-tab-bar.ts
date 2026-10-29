import { Avatar } from '../../ui/avatar/avatar';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { CategoryService } from '../../services/category.service';
import { ToastService } from '../../services/toast.service';
import { VehiclePickerService } from '../../services/vehicle-picker.service';
import { VehicleService } from '../../services/vehicle.service';

type Sheet = 'categorias' | 'cuenta';
type Tab = 'inicio' | 'categorias' | 'buscar' | 'carrito' | 'cuenta';

/**
 * La barra de pestañas de abajo, solo en el teléfono (≤ 900 px): Inicio ·
 * Categorías · Buscar · Carrito · Cuenta.
 *
 * Es lo que hace que el sitio se sienta app y no página. Categorías y Cuenta
 * abren una hoja que sube desde la barra; Vehículos, Comunidad, Publicar y el
 * panel de administración entran por la hoja de Cuenta, porque en el teléfono ya
 * no hay menú de arriba.
 *
 * Está visible siempre, no solo cuando el sitio está instalado como PWA, y
 * respeta el área segura del iPhone (`env(safe-area-inset-bottom)`).
 */
@Component({
  selector: 'app-mobile-tab-bar',
  imports: [RouterLink, Avatar],
  templateUrl: './mobile-tab-bar.html',
  styleUrl: './mobile-tab-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeSheet()' },
})
export class MobileTabBar {
  private readonly auth = inject(AuthService);
  private readonly cart = inject(CartService);
  private readonly categories = inject(CategoryService);
  private readonly vehicles = inject(VehicleService);
  private readonly picker = inject(VehiclePickerService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly isLoggedIn = this.auth.isLoggedIn;
  readonly user = this.auth.user;
  readonly canModerate = this.auth.canModerate;
  readonly cartCount = this.cart.totalItems;
  readonly vehicleLabel = this.vehicles.selectedLabel;
  readonly categoryTree = toSignal(this.categories.getTree(), { initialValue: [] });

  /** La hoja abierta, si hay alguna. */
  readonly sheet = signal<Sheet | null>(null);

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split(/[?#]/)[0]),
      startWith(this.router.url.split(/[?#]/)[0]),
    ),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );

  /** La pestaña que se pinta como activa. Una hoja abierta manda sobre la página. */
  readonly activeTab = computed<Tab | null>(() => {
    if (this.sheet() === 'categorias') return 'categorias';
    if (this.sheet() === 'cuenta') return 'cuenta';
    if (this.cart.isOpen()) return 'carrito';

    const path = this.path();
    if (path === '/') return 'inicio';
    if (path === '/buscar') return 'buscar';
    if (['/perfil', '/login', '/registro'].some((p) => path.startsWith(p))) return 'cuenta';
    return null;
  });

  /** El icono de la pestaña: el del par `*-hub-icon.svg` cuando está activa. */
  icon(tab: Tab): string {
    const names: Record<Tab, [off: string, on: string]> = {
      inicio: ['home-icon', 'home-hub-icon'],
      categorias: ['bag-icon', 'bag-hub-icon'],
      buscar: ['search-icon', 'search-check-hub-icon'],
      carrito: ['cart-icon', 'cart-hub-icon'],
      cuenta: ['crowd-icon', 'crowd-hub-icon'],
    };
    return `assets/icons/${names[tab][this.activeTab() === tab ? 1 : 0]}.svg`;
  }

  toggleSheet(sheet: Sheet): void {
    this.cart.closePanel();
    this.sheet.update((current) => (current === sheet ? null : sheet));
  }

  closeSheet(): void {
    if (this.sheet() !== null) this.sheet.set(null);
  }

  /** Cualquier pestaña que navega o abre otra cosa cierra la hoja primero. */
  go(): void {
    this.closeSheet();
    this.cart.closePanel();
  }

  openCart(): void {
    this.closeSheet();
    this.cart.toggleCart();
  }

  openVehiclePicker(): void {
    this.closeSheet();
    this.picker.open();
  }

  logout(): void {
    this.auth.logout();
    this.closeSheet();
    this.toast.show('Sesión cerrada.');
    void this.router.navigateByUrl('/');
  }
}
