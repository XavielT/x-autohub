import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VariantDraft } from '../../../../../shared/models/admin-inventory.model';
import { PHOTOS_MAX, VARIANT_NAME_MAX, activeVariantStock } from '../../../../../shared/utils/variant-rules';

/**
 * Las opciones de un producto (color, talla…), cada una con su propio stock.
 *
 * Comparten el precio del producto: si algo cuesta distinto, es otro producto. Una opción
 * que ya tuvo pedidos no se puede borrar de verdad (el pedido apunta a ella); al guardar se
 * apaga en su lugar, y el formulario padre lo avisa.
 *
 * La lista es un `model()`: el formulario padre la lee y la guarda con el producto
 * (`AdminCatalogService.saveVariants`). Este componente no guarda nada por su cuenta.
 */
@Component({
  selector: 'app-variant-editor',
  imports: [FormsModule],
  templateUrl: './variant-editor.html',
  styleUrl: './variant-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VariantEditor {
  readonly variants = model<VariantDraft[]>([]);
  /**
   * Las fotos del producto, para que cada opción elija una. Las que se acaban de elegir en el
   * formulario todavía no están subidas: aparecen aquí cuando el producto se guarda.
   */
  readonly images = input<readonly string[]>([]);

  readonly nameMax = VARIANT_NAME_MAX;
  readonly newName = signal('');
  readonly error = signal('');

  /** Lo que sumará el stock del producto: las opciones activas. */
  readonly total = computed(() => activeVariantStock(this.variants()));

  /** El nombre corto de una foto: "Foto 2". */
  photoLabel(url: string): string {
    const index = this.images().indexOf(url);
    return index >= 0 ? `Foto ${index + 1}` : 'Foto que ya no está en el producto';
  }

  /**
   * Las fotos de una opción que ya no están en el producto (alguien las quitó). Se siguen mostrando, marcadas,
   * para poder quitarlas de la opción; la ficha las descarta por su cuenta.
   */
  orphanPhotos(draft: VariantDraft): string[] {
    return draft.imageUrls.filter((url) => !this.images().includes(url));
  }

  /**
   * Marca o desmarca una foto del producto para la opción `index`. El orden de la opción es el de las fotos del
   * producto, no el del clic: así la portada (la primera) es siempre la primera foto del producto que se marcó, y el
   * formulario no tiene un segundo orden que arreglar. Máximo `PHOTOS_MAX` por opción.
   */
  togglePhoto(index: number, url: string, checked: boolean): void {
    const draft = this.variants()[index];
    if (!draft) return;
    const marked = new Set(draft.imageUrls);
    if (checked) {
      if (marked.size >= PHOTOS_MAX) {
        this.error.set(`Una opción admite hasta ${PHOTOS_MAX} fotos.`);
        return;
      }
      marked.add(url);
    } else {
      marked.delete(url);
    }
    this.error.set('');
    const ordered = [...this.images().filter((u) => marked.has(u)), ...[...marked].filter((u) => !this.images().includes(u))];
    this.patch(index, { imageUrls: ordered });
  }

  add(): void {
    const name = this.newName().trim();
    if (!name) {
      this.error.set('Escribe el nombre de la opción (por ejemplo "Negro").');
      return;
    }
    if (name.length > VARIANT_NAME_MAX) {
      this.error.set(`El nombre es muy largo (máximo ${VARIANT_NAME_MAX} caracteres).`);
      return;
    }
    if (this.variants().some((v) => v.name.trim().toLowerCase() === name.toLowerCase())) {
      this.error.set(`Ya hay una opción llamada "${name}".`);
      return;
    }

    this.variants.update((list) => [...list, { id: null, name, sku: '', imageUrls: [], stock: 0, isActive: true }]);
    this.error.set('');
    this.newName.set('');
  }

  /** Cambia un campo de la fila `index` sin tocar las demás. */
  patch(index: number, change: Partial<VariantDraft>): void {
    this.variants.update((list) => list.map((v, i) => (i === index ? { ...v, ...change } : v)));
  }

  setStock(index: number, value: number | string | null): void {
    const n = Number(value);
    this.patch(index, { stock: Number.isFinite(n) && value !== '' && value !== null ? Math.max(0, Math.floor(n)) : 0 });
  }

  move(index: number, delta: -1 | 1): void {
    const target = index + delta;
    this.variants.update((list) => {
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  remove(index: number): void {
    this.variants.update((list) => list.filter((_, i) => i !== index));
  }
}
