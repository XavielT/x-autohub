import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogoCard } from '../../../../shared/components/catalogo-card/catalogo-card';
import { ProductModel } from '../../../../shared/models/product.model';
import { FavoriteService } from '../../../../shared/services/favorite.service';

/**
 * "Mis favoritos" en el perfil: los productos que guardó la persona, con la misma tarjeta de la
 * tienda. Quitar uno con el corazón lo saca de la lista al instante.
 */
@Component({
  selector: 'app-mis-favoritos',
  imports: [CatalogoCard, RouterLink],
  templateUrl: './mis-favoritos.html',
  styleUrl: './mis-favoritos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MisFavoritos {
  private readonly favorites = inject(FavoriteService);

  protected readonly items = signal<ProductModel[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly hasError = signal(false);

  constructor() {
    // Se vuelve a pedir la lista cuando cambian los ids (al abrir el perfil llegan después de iniciar sesión).
    effect(() => {
      this.favorites.ids();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    this.hasError.set(false);
    this.favorites.list().subscribe({
      next: (items) => {
        this.items.set(items);
        this.isLoading.set(false);
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }
}
