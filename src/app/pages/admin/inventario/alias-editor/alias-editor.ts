import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductAlias } from '../../../../../shared/models/product.model';
import { AdminCatalogService } from '../../../../../shared/services/admin-catalog.service';

/**
 * Los alias de búsqueda de un producto: otros nombres con los que alguien lo buscaría ("bumper"
 * para un parachoques). El buscador los usa y dice "también: bumper" cuando fue un alias lo que
 * coincidió. Se guardan al instante, aparte del formulario del producto.
 */
@Component({
  selector: 'app-alias-editor',
  imports: [FormsModule],
  templateUrl: './alias-editor.html',
  styleUrl: './alias-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AliasEditor {
  private readonly catalog = inject(AdminCatalogService);

  /** El producto en edición; `null` si todavía no se guarda (no hay a qué colgarle un alias). */
  readonly productId = input<number | null>(null);

  readonly aliases = signal<ProductAlias[]>([]);
  readonly text = signal('');
  readonly error = signal('');
  readonly isBusy = signal(false);

  constructor() {
    effect(() => {
      const id = this.productId();
      this.aliases.set([]);
      this.error.set('');
      if (id === null) return;
      this.catalog.getAliases(id).subscribe({
        next: (list) => this.aliases.set(list),
        error: () => this.error.set('No pudimos cargar los alias.'),
      });
    });
  }

  add(): void {
    const id = this.productId();
    const text = this.text().trim();
    if (id === null || this.isBusy()) return;
    if (!text) {
      this.error.set('Escribe el alias.');
      return;
    }

    this.isBusy.set(true);
    this.catalog.addAlias(id, text).subscribe({
      next: (created) => {
        this.aliases.update((all) => [...all, created]);
        this.text.set('');
        this.error.set('');
        this.isBusy.set(false);
      },
      error: (e: Error) => {
        this.error.set(e.message);
        this.isBusy.set(false);
      },
    });
  }

  remove(alias: ProductAlias): void {
    const id = this.productId();
    if (id === null) return;
    this.catalog.removeAlias(id, alias.id).subscribe({
      next: () => this.aliases.update((all) => all.filter((a) => a.id !== alias.id)),
      error: (e: Error) => this.error.set(e.message),
    });
  }
}
