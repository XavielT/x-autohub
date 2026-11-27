import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { selectNumberOnFocus } from '../shared/utils/select-on-focus';
import { RouterOutlet } from '@angular/router';
import { Navbar } from '../shared/components/navbar/navbar';
import { Footer } from '../shared/components/footer/footer';
import { CartModal } from '../shared/components/cart-modal/cart-modal';
import { Toast } from '../shared/components/toast/toast';
import { MobileTabBar } from '../shared/components/mobile-tab-bar/mobile-tab-bar';
import { InstallPrompt } from '../shared/components/install-prompt/install-prompt';
import { UpdateToast } from '../shared/components/update-toast/update-toast';
import { VehiclePickerModal } from '../shared/components/vehicle-picker-modal/vehicle-picker-modal';
import { RouteProgress } from '../shared/components/route-progress/route-progress';
import { ScrollTop } from '../shared/components/scroll-top/scroll-top';
import { WhatsNewModal } from '../shared/components/whats-new-modal/whats-new-modal';
import { VehiclePickerService } from '../shared/services/vehicle-picker.service';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Navbar, Footer, CartModal, Toast, MobileTabBar, VehiclePickerModal, InstallPrompt, UpdateToast, WhatsNewModal, RouteProgress, ScrollTop],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  /** En todo el sitio, tocar un campo numérico selecciona su contenido (adiós al 0 pegado en precios y cantidades). */
  @HostListener('document:focusin', ['$event'])
  protected onFocusIn(event: Event): void {
    selectNumberOnFocus(event);
  }

  /** "/" lleva el cursor al buscador de arriba, como en cualquier sitio de búsqueda (solo si no se está escribiendo ya). */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
    const search = document.querySelector<HTMLInputElement>('app-navbar input[type="search"]');
    if (!search || getComputedStyle(search.closest('app-search-box') ?? search).display === 'none') return;
    event.preventDefault();
    search.focus();
    search.select();
  }

  protected readonly title = signal('x-autohub');
  /** Cuando se abre por primera vez, `@defer` descarga el selector de vehículo. */
  protected readonly pickerOpen = inject(VehiclePickerService).isOpen;
}
