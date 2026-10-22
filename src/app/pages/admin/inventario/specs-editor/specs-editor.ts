import { ChangeDetectionStrategy, Component, computed, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * Las especificaciones de un producto como pares clave/valor ("Material:
 * Aluminio", "Medida: 18x8.5").
 *
 * Es un `model()` de un objeto: el formulario padre lo guarda tal cual en la
 * columna `specs` (jsonb). Ojo con el orden: jsonb no conserva el orden en que se
 * escribieron las claves, así que la ficha las muestra como las devuelva la base.
 */
@Component({
  selector: 'app-specs-editor',
  imports: [FormsModule],
  templateUrl: './specs-editor.html',
  styleUrl: './specs-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpecsEditor {
  readonly specs = model<Record<string, string>>({});

  readonly entries = computed(() => Object.entries(this.specs()));

  readonly key = signal('');
  readonly value = signal('');
  readonly error = signal('');

  add(): void {
    const key = this.key().trim();
    const value = this.value().trim();

    if (!key || !value) {
      this.error.set('Escribe el nombre y el valor.');
      return;
    }
    if (key in this.specs()) {
      this.error.set(`"${key}" ya esta en la lista. Quitala para cambiarla.`);
      return;
    }

    this.specs.update((all) => ({ ...all, [key]: value }));
    this.key.set('');
    this.value.set('');
    this.error.set('');
  }

  remove(key: string): void {
    this.specs.update((all) => {
      const { [key]: _removed, ...rest } = all;
      return rest;
    });
  }
}
