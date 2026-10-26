import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FavoriteService } from '../../services/favorite.service';

/**
 * El corazón que guarda o quita un producto de favoritos. Sin sesión avisa que hay que
 * iniciarla (lo hace `FavoriteService`). Va dentro de una tarjeta o de la ficha; no navega.
 */
@Component({
  selector: 'app-favorite-button',
  templateUrl: './favorite-button.html',
  styleUrl: './favorite-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FavoriteButton {
  private readonly favorites = inject(FavoriteService);

  readonly partId = input.required<number>();
  /** Para el lector de pantalla: "Guardar X en favoritos". */
  readonly label = input('este producto');

  protected readonly saved = computed(() => this.favorites.ids().includes(this.partId()));

  protected toggle(event: Event): void {
    // Si va sobre un enlace (la tarjeta), el toque no debe abrir la ficha.
    event.preventDefault();
    event.stopPropagation();
    this.favorites.toggle(this.partId()).subscribe();
  }
}
