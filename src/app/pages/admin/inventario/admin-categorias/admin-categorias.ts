import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminCatalogService } from '../../../../../shared/services/admin-catalog.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import { ProductCategoryModel } from '../../../../../shared/models/product.model';
import { buildCategoryTree } from '../../../../../shared/utils/category-tree';

/**
 * Las categorías de la tienda: crearlas, ordenarlas, renombrarlas y desactivarlas.
 *
 * Dos niveles como máximo (lo exige un trigger de la base, que es la barrera de
 * verdad). Aquí solo se ofrecen como padre las de primer nivel, para que el
 * formulario no deje elegir lo que la base va a rechazar.
 *
 * No hay "borrar": una categoría con productos no se puede borrar (la clave
 * foránea es `restrict`), y desactivarla la saca del sitio sin perder nada.
 */
@Component({
  selector: 'app-admin-categorias',
  imports: [FormsModule],
  templateUrl: './admin-categorias.html',
  styleUrl: './admin-categorias.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCategorias implements OnInit {
  private readonly catalog = inject(AdminCatalogService);
  private readonly toast = inject(ToastService);

  readonly categories = signal<ProductCategoryModel[]>([]);
  readonly isLoading = signal(true);
  readonly savingId = signal<number | null>(null);

  readonly tree = computed(() => buildCategoryTree(this.categories()));

  readonly newName = signal('');
  /** Vacío = primer nivel. */
  readonly newParentId = signal<number | null>(null);
  readonly isAdding = signal(false);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.catalog.getCategories().subscribe({
      next: (list) => {
        this.categories.set(list);
        this.isLoading.set(false);
      },
      error: (e: Error) => {
        this.isLoading.set(false);
        this.toast.show(e.message, 'error');
      },
    });
  }

  add(): void {
    const name = this.newName().trim();
    if (!name) {
      this.toast.show('Escribe el nombre de la categoria.', 'error');
      return;
    }

    const parentId = this.newParentId();
    const siblings = this.categories().filter((c) => c.parentId === parentId);
    const sortOrder = Math.max(0, ...siblings.map((c) => c.sortOrder)) + 10;

    this.isAdding.set(true);
    this.catalog.createCategory({ name, parentId, sortOrder }).subscribe({
      next: (created) => {
        this.isAdding.set(false);
        this.categories.update((l) => [...l, created]);
        this.newName.set('');
        this.toast.show(`"${created.name}" agregada.`);
      },
      error: (e: Error) => {
        this.isAdding.set(false);
        this.toast.show(e.message, 'error');
      },
    });
  }

  rename(category: ProductCategoryModel, event: Event): void {
    const name = (event.target as HTMLInputElement).value.trim();
    if (!name) {
      (event.target as HTMLInputElement).value = category.name;
      this.toast.show('El nombre no puede quedar vacio.', 'error');
      return;
    }
    if (name === category.name) return;

    this.savingId.set(category.id);
    this.catalog.updateCategory(category.id, { name }).subscribe({
      next: (saved) => {
        this.savingId.set(null);
        this.replace(saved);
        this.toast.show('Guardado.');
      },
      error: (e: Error) => this.fail(e),
    });
  }

  toggleActive(category: ProductCategoryModel): void {
    this.savingId.set(category.id);
    this.catalog.updateCategory(category.id, { isActive: !category.isActive }).subscribe({
      next: (saved) => {
        this.savingId.set(null);
        this.replace(saved);
        this.toast.show(saved.isActive ? 'Categoria visible.' : 'Categoria oculta del sitio.');
      },
      error: (e: Error) => this.fail(e),
    });
  }

  /** Sube o baja una categoría entre sus hermanas. */
  move(category: ProductCategoryModel, direction: -1 | 1): void {
    const siblings = this.categories()
      .filter((c) => c.parentId === category.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'));
    const index = siblings.findIndex((c) => c.id === category.id);
    const other = siblings[index + direction];
    if (!other) return;

    this.savingId.set(category.id);
    this.catalog.swapCategoryOrder(category, other).subscribe({
      next: () => {
        this.savingId.set(null);
        // Se vuelve a pedir la lista: el intercambio toca dos filas y es más
        // simple leer el resultado que adivinarlo.
        this.load();
      },
      error: (e: Error) => this.fail(e),
    });
  }

  private replace(saved: ProductCategoryModel): void {
    this.categories.update((l) => l.map((c) => (c.id === saved.id ? saved : c)));
  }

  private fail(error: Error): void {
    this.savingId.set(null);
    this.toast.show(error.message, 'error');
  }
}
