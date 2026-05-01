import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HubPartModel } from '../../models/hub-part.model';
import { CartService } from '../../services/cart';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-catalogo-card',
  imports: [RouterLink],
  templateUrl: './catalogo-card.html',
  styleUrl: './catalogo-card.scss',
})
export class CatalogoCard {
  @Input({required:true}) hubPart!: HubPartModel;

  constructor(
    private cartService: CartService,
    private toastService: ToastService) {}

  addToCart(): void {
    try {
      this.cartService.addToCart(this.hubPart);
      this.toastService.show(`${this.hubPart.name} agregado al carrito`);
    } catch {
      this.toastService.show('No se pudo agregar el articulo', 'error');
    }
  }
}
