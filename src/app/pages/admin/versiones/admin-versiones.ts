import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReleaseService } from '../../../../shared/services/release.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { ReleaseDraft, ReleaseModel } from '../../../../shared/models/release.model';

/** Semver de tres partes, lo mismo que exige el check de la tabla. */
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * Historial de versiones del sitio.
 *
 * El listado incluye los borradores (`includeDrafts`), que el público no ve:
 * permite redactar las notas de una versión antes de publicarla.
 *
 * Los puntos del changelog se editan como texto, una línea por punto, y se
 * guardan en la columna `changes text[]`. Es más rápido de escribir que una
 * lista de campos y evita mantener un FormArray para algo que al final es una
 * lista de frases.
 */
@Component({
  selector: 'app-admin-versiones',
  imports: [FormsModule, DatePipe],
  templateUrl: './admin-versiones.html',
  styleUrl: './admin-versiones.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminVersiones implements OnInit {
  private readonly releases = inject(ReleaseService);
  private readonly toast = inject(ToastService);

  readonly items = signal<ReleaseModel[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);

  /** null = no hay formulario abierto. 0 = creando. >0 = editando ese id. */
  readonly editingId = signal<number | null>(null);
  readonly expandedId = signal<number | null>(null);

  readonly version = signal('');
  readonly releasedAt = signal('');
  readonly title = signal('');
  readonly summary = signal('');
  readonly changesText = signal('');
  readonly isPublished = signal(true);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.isLoading.set(true);
    this.releases.getAll(true).subscribe({
      next: (items) => {
        this.items.set(items);
        this.isLoading.set(false);
      },
      error: (error: Error) => {
        this.isLoading.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  toggleDetail(id: number): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  startCreate(): void {
    this.editingId.set(0);
    this.version.set('');
    // Por defecto hoy, en formato ISO corto que es lo que espera <input type=date>.
    this.releasedAt.set(new Date().toISOString().slice(0, 10));
    this.title.set('');
    this.summary.set('');
    this.changesText.set('');
    this.isPublished.set(true);
  }

  startEdit(item: ReleaseModel): void {
    this.editingId.set(item.id);
    this.version.set(item.version);
    this.releasedAt.set(item.releasedAt.toISOString().slice(0, 10));
    this.title.set(item.title);
    this.summary.set(item.summary);
    this.changesText.set(item.changes.join('\n'));
    this.isPublished.set(item.isPublished);
  }

  cancel(): void {
    this.editingId.set(null);
  }

  save(): void {
    const version = this.version().trim();
    const title = this.title().trim();

    if (!VERSION_PATTERN.test(version)) {
      this.toast.show('La version tiene que ser tres numeros: 1.2.3', 'error');
      return;
    }
    if (!title) {
      this.toast.show('Ponle un titulo a la version.', 'error');
      return;
    }

    const draft: ReleaseDraft = {
      version,
      releasedAt: this.releasedAt(),
      title,
      summary: this.summary().trim(),
      // Una linea por punto; se descartan las vacias para que un salto de mas no
      // se convierta en un elemento en blanco.
      changes: this.changesText()
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
      isPublished: this.isPublished(),
    };

    const id = this.editingId();
    const request = id && id > 0 ? this.releases.update(id, draft) : this.releases.create(draft);

    this.isSaving.set(true);
    request.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.editingId.set(null);
        this.toast.show(id && id > 0 ? 'Version actualizada.' : 'Version publicada.');
        this.load();
      },
      error: (error: Error) => {
        this.isSaving.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  /**
   * Borrar es destructivo y no hay deshacer, así que hace falta pulsar dos veces:
   * el primer clic marca la fila y el segundo confirma. Se evita un
   * `window.confirm`, que bloquea el hilo y se ve fuera de lugar.
   */
  readonly pendingDeleteId = signal<number | null>(null);

  askDelete(id: number): void {
    this.pendingDeleteId.set(this.pendingDeleteId() === id ? null : id);
  }

  confirmDelete(item: ReleaseModel): void {
    this.releases.remove(item.id).subscribe({
      next: () => {
        this.pendingDeleteId.set(null);
        this.toast.show(`Version ${item.version} eliminada.`);
        this.load();
      },
      error: (error: Error) => this.toast.show(error.message, 'error'),
    });
  }
}
