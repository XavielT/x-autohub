import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from '../shared/components/navbar/navbar';
import { Footer } from '../shared/components/footer/footer';
import { CartModal } from '../shared/components/cart-modal/cart-modal';
import { Toast } from '../shared/components/toast/toast';
import { MobileTabBar } from '../shared/components/mobile-tab-bar/mobile-tab-bar';
import { VehiclePickerModal } from '../shared/components/vehicle-picker-modal/vehicle-picker-modal';
import { VehiclePickerService } from '../shared/services/vehicle-picker.service';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Navbar, Footer, CartModal, Toast, MobileTabBar, VehiclePickerModal],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly title = signal('x-autohub');
  /** Cuando se abre por primera vez, `@defer` descarga el selector de vehículo. */
  protected readonly pickerOpen = inject(VehiclePickerService).isOpen;
}
