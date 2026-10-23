import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { AdminServicesService, WorkDraft } from '../../../../../shared/services/admin-services.service';
import { StorageService } from '../../../../../shared/services/storage.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import { ServiceModel, ServiceWorkModel } from '../../../../../shared/models/service.model';
import { localDate } from '../../../../../shared/utils/service-time';

const blank = (): WorkDraft => ({
  id: null,
  title: '',
  description: '',
  serviceId: null,
  beforeImage: null,
  afterImage: null,
  vehicleText: '',
  doneAt: localDate(new Date()),
  isPublished: false,
});

const toDraft = (w: ServiceWorkModel): WorkDraft => ({
  id: w.id,
  title: w.title,
  description: w.description,
  serviceId: w.serviceId,
  beforeImage: w.beforeImage,
  afterImage: w.afterImage,
  vehicleText: w.vehicleText ?? '',
  doneAt: localDate(w.doneAt),
  isPublished: w.isPublished,
});

/**
 * Los trabajos realizados: crearlos con su antes y su después, ligarlos a un servicio
 * y **publicarlos** (solo lo publicado sale en /servicios y en el detalle del servicio).
 *
 * Un trabajo sin publicar es un borrador: solo lo ve el admin. Publicar exige la foto
 * del después, que es la que se ve en la galería. Las fotos van al bucket público
 * `service-works`, que solo un admin puede escribir.
 */
@Component({
  selector: 'app-admin-trabajos',
  imports: [DatePipe],
  templateUrl: './admin-trabajos.html',
  styleUrl: './admin-trabajos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminTrabajos implements OnInit {
  private readonly admin = inject(AdminServicesService);
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);

  readonly works = signal<ServiceWorkModel[]>([]);
  readonly services = signal<ServiceModel[]>([]);
  readonly isLoading = signal(true);
  readonly draft = signal<WorkDraft | null>(null);
  readonly isSaving = signal(false);
  readonly confirmDeleteId = signal<number | null>(null);

  /** Las fotos elegidas pero todavía sin subir (se suben al guardar). */
  private pending: { before?: File; after?: File } = {};
  readonly beforePreview = signal<string | null>(null);
  readonly afterPreview = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    forkJoin([this.admin.getWorks(), this.admin.getServices()]).subscribe({
      next: ([works, services]) => {
        this.works.set(works);
        this.services.set(services);
        this.isLoading.set(false);
      },
      error: (error: Error) => {
        this.isLoading.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  serviceTitle(id: number | null): string {
    return this.services().find((s) => s.id === id)?.title ?? 'Sin servicio';
  }

  newWork(): void {
    this.pending = {};
    this.beforePreview.set(null);
    this.afterPreview.set(null);
    this.draft.set(blank());
  }

  edit(work: ServiceWorkModel): void {
    this.pending = {};
    this.beforePreview.set(work.beforeImage);
    this.afterPreview.set(work.afterImage);
    this.draft.set(toDraft(work));
  }

  cancel(): void {
    this.pending = {};
    this.draft.set(null);
  }

  setText(field: 'title' | 'description' | 'vehicleText' | 'doneAt', event: Event): void {
    this.patch({ [field]: (event.target as HTMLInputElement | HTMLTextAreaElement).value });
  }

  setService(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    this.patch({ serviceId: raw === '' ? null : Number(raw) });
  }

  setPublished(event: Event): void {
    this.patch({ isPublished: (event.target as HTMLInputElement).checked });
  }

  /** Elige una foto: se ve al instante y se sube al guardar. */
  onPhoto(which: 'before' | 'after', event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const invalid = this.storage.validate(file);
    if (invalid) {
      this.toast.show(invalid, 'error');
      input.value = '';
      return;
    }

    this.pending = { ...this.pending, [which]: file };
    (which === 'before' ? this.beforePreview : this.afterPreview).set(URL.createObjectURL(file));
  }

  removePhoto(which: 'before' | 'after'): void {
    this.pending = { ...this.pending, [which]: undefined };
    (which === 'before' ? this.beforePreview : this.afterPreview).set(null);
    this.patch(which === 'before' ? { beforeImage: null } : { afterImage: null });
  }

  private patch(change: Partial<WorkDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...change } : d));
  }

  save(): void {
    const draft = this.draft();
    if (!draft || this.isSaving()) return;

    if (!draft.title.trim()) {
      this.toast.show('Escribe el título del trabajo.', 'error');
      return;
    }
    if (draft.isPublished && !draft.afterImage && !this.pending.after) {
      this.toast.show('Para publicar hace falta al menos la foto del después.', 'error');
      return;
    }

    this.isSaving.set(true);
    this.admin.saveWorkWithImages(draft, this.pending).subscribe({
      next: (saved) => {
        this.isSaving.set(false);
        this.pending = {};
        this.draft.set(null);
        this.toast.show(saved.isPublished ? `"${saved.title}" publicado.` : `"${saved.title}" guardado como borrador.`);
        this.load();
      },
      error: (error: Error) => {
        this.isSaving.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  /** Publicar o despublicar sin abrir el formulario. */
  togglePublished(work: ServiceWorkModel): void {
    this.admin.saveWork({ ...toDraft(work), isPublished: !work.isPublished }).subscribe({
      next: () => {
        this.toast.show(work.isPublished ? 'Trabajo despublicado.' : 'Trabajo publicado.');
        this.load();
      },
      error: (error: Error) => this.toast.show(error.message, 'error'),
    });
  }

  /** Borrar no se deshace: se pide un segundo toque. */
  remove(work: ServiceWorkModel): void {
    if (this.confirmDeleteId() !== work.id) {
      this.confirmDeleteId.set(work.id);
      return;
    }

    this.confirmDeleteId.set(null);
    this.admin.deleteWork(work.id).subscribe({
      next: () => {
        this.toast.show('Trabajo borrado.');
        this.load();
      },
      error: (error: Error) => this.toast.show(error.message, 'error'),
    });
  }
}
