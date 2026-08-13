import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HubPartModel } from '../../models/hub-part.model';
import { CartService } from '../../services/cart.service';
import { ToastService } from '../../services/toast.service';
import { CommonModule, NgOptimizedImage } from '@angular/common';

@Component({
  selector: 'app-catalogo-card',
  imports: [RouterLink, CommonModule, NgOptimizedImage],
  templateUrl: './catalogo-card.html',
  styleUrl: './catalogo-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogoCard {
  private readonly cartService = inject(CartService);
  private readonly toastService = inject(ToastService);

  readonly hubPart = input.required<HubPartModel>();

  addToCart(): void {
    const hubPart = this.hubPart();

    try {
      this.cartService.addToCart(hubPart);
      this.toastService.show(`${hubPart.name} agregado al carrito`);
    } catch {
      this.toastService.show('No se pudo agregar el articulo', 'error');
    }
  }
}
