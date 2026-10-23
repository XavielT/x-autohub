import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  AdminServicesService,
  ServiceDraft,
  validateService,
} from '../../../../../shared/services/admin-services.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  ServiceCategory,
  ServiceModel,
} from '../../../../../shared/models/service.model';
import { formatDuration } from '../../../../../shared/utils/format-duration';

/** Los iconos que ya existen en `assets/icons/`. No se referencia uno que no esté. */
export const SERVICE_ICONS: readonly { value: string; label: string }[] = [
  { value: 'assets/icons/mechanic-tools-hub-icon.svg', label: 'Herramientas' },
  { value: 'assets/icons/maintenance-hub-icon.svg', label: 'Mantenimiento' },
  { value: 'assets/icons/repair-hub-icon.svg', label: 'Reparación' },
  { value: 'assets/icons/diagnostic-hub-icon.svg', label: 'Eléctrico' },
  { value: 'assets/icons/services-hub-icon.svg', label: 'Servicios' },
  { value: 'assets/icons/medical-scanner-hub-icon.svg', label: 'Escáner' },
  { value: 'assets/icons/search-check-hub-icon.svg', label: 'Revisión' },
  { value: 'assets/icons/speedometer-hub-icon.svg', label: 'Velocímetro' },
];

const blank = (sortOrder: number): ServiceDraft => ({
  id: null,
  title: '',
  slug: '',
  icon: SERVICE_ICONS[0].value,
  description: '',
  longDescription: '',
  category: 'mantenimiento',
  priceFrom: null,
  durationMinutes: 60,
  isBookable: true,
  images: [],
  sortOrder,
  isActive: true,
});

const toDraft = (s: ServiceModel): ServiceDraft => ({
  id: s.id,
  title: s.title,
  slug: s.slug,
  icon: s.icon,
  description: s.description,
  longDescription: s.longDescription,
  category: s.category,
  priceFrom: s.priceFrom,
  durationMinutes: s.durationMinutes,
  isBookable: s.isBookable,
  images: s.images,
  sortOrder: s.sortOrder,
  isActive: s.isActive,
});

/**
 * El catálogo de servicios: crear, editar, apagar y ordenar.
 *
 * Un servicio **apagado** no sale en /servicios ni se puede agendar, pero sigue aquí
 * (y las piezas que apuntan a él no se rompen). El precio vacío es "A cotizar": el
 * precio lo pone el taller, nunca el código.
 */
@Component({
  selector: 'app-admin-servicios',
  imports: [DecimalPipe],
  templateUrl: './admin-servicios.html',
  styleUrl: './admin-servicios.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminServicios implements OnInit {
  private readonly admin = inject(AdminServicesService);
  private readonly toast = inject(ToastService);

  readonly categories = SERVICE_CATEGORIES;
  readonly categoryLabels = SERVICE_CATEGORY_LABELS;
  readonly icons = SERVICE_ICONS;

  readonly services = signal<ServiceModel[]>([]);
  readonly isLoading = signal(true);
  readonly draft = signal<ServiceDraft | null>(null);
  readonly isSaving = signal(false);
  readonly isUploading = signal(false);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.admin.getServices().subscribe({
      next: (list) => {
        this.services.set(list);
        this.isLoading.set(false);
      },
      error: (error: Error) => {
        this.isLoading.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  duration(minutes: number): string {
    return formatDuration(minutes);
  }

  newService(): void {
    const last = Math.max(0, ...this.services().map((s) => s.sortOrder));
    this.draft.set(blank(last + 10));
  }

  edit(service: ServiceModel): void {
    this.draft.set(toDraft(service));
  }

  cancel(): void {
    this.draft.set(null);
  }

  /** Cambia un campo del borrador. El valor llega como texto del input. */
  setText(field: 'title' | 'slug' | 'description' | 'longDescription' | 'icon', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
    this.patch({ [field]: value });
  }

  setCategory(event: Event): void {
    this.patch({ category: (event.target as HTMLSelectElement).value as ServiceCategory });
  }

  setNumber(field: 'durationMinutes' | 'sortOrder', event: Event): void {
    this.patch({ [field]: Number((event.target as HTMLInputElement).value) });
  }

  /** Vacío = a cotizar (`null`). */
  setPrice(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    this.patch({ priceFrom: raw === '' ? null : Number(raw) });
  }

  setFlag(field: 'isBookable' | 'isActive', event: Event): void {
    this.patch({ [field]: (event.target as HTMLInputElement).checked });
  }

  removeImage(index: number): void {
    const current = this.draft();
    if (current) this.patch({ images: current.images.filter((_, i) => i !== index) });
  }

  onImages(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const current = this.draft();
    if (files.length === 0 || !current) return;

    this.isUploading.set(true);
    this.admin.uploadServiceImages(files).subscribe({
      next: (urls) => {
        this.isUploading.set(false);
        input.value = '';
        this.patch({ images: [...(this.draft()?.images ?? []), ...urls] });
      },
      error: (error: Error) => {
        this.isUploading.set(false);
        input.value = '';
        this.toast.show(error.message, 'error');
      },
    });
  }

  private patch(change: Partial<ServiceDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...change } : d));
  }

  save(): void {
    const draft = this.draft();
    if (!draft || this.isSaving()) return;

    const invalid = validateService(draft);
    if (invalid) {
      this.toast.show(invalid, 'error');
      return;
    }

    this.isSaving.set(true);
    this.admin.saveService(draft).subscribe({
      next: (saved) => {
        this.isSaving.set(false);
        this.draft.set(null);
        this.toast.show(`Servicio "${saved.title}" guardado.`);
        this.load();
      },
      error: (error: Error) => {
        this.isSaving.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  /** Apagar o encender sin abrir el formulario. */
  toggleActive(service: ServiceModel): void {
    this.admin.saveService({ ...toDraft(service), isActive: !service.isActive }).subscribe({
      next: () => {
        this.toast.show(`"${service.title}" ${service.isActive ? 'apagado' : 'encendido'}.`);
        this.load();
      },
      error: (error: Error) => this.toast.show(error.message, 'error'),
    });
  }
}
