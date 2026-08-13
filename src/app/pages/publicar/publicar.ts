import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { switchMap } from 'rxjs';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { StorageService } from '../../../shared/services/storage.service';
import { AuthService } from '../../../shared/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { HubMarketCategory, HubMarketItemModel } from '../../../shared/models/hub-market-item.model';

@Component({
  selector: 'app-publicar',
  imports: [ReactiveFormsModule],
  templateUrl: './publicar.html',
  styleUrl: './publicar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Publicar {
  private readonly fb = inject(FormBuilder);
  private readonly hubMarketService = inject(HubMarketService);
  private readonly storage = inject(StorageService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** Archivos originales: son los que se suben a Storage. */
  readonly selectedFiles = signal<File[]>([]);
  /** Data URLs solo para la vista previa del formulario. */
  readonly imagePreviews = signal<string[]>([]);

  readonly isDragOver = signal(false);
  readonly isSubmitting = signal(false);

  readonly categories = [
    { value: 'vehiculos', label: 'Vehículos' },
    { value: 'piezas', label: 'Piezas' },
    { value: 'accesorios', label: 'Accesorios' },
  ];

  readonly publishForm = this.fb.nonNullable.group({
    category: ['', Validators.required],
    title: ['', Validators.required],
    description: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(1)]],
    location: ['', Validators.required],
    year: [null as number | null],
    mileage: [null as number | null],
    hp: [null as number | null],
    zeroTo100: [null as number | null],
    topSpeed: [null as number | null],
    condition: [''],
  });

  get isVehicle(): boolean {
    return this.publishForm.controls.category.value === 'vehiculos';
  }

  get isPartOrAccessory(): boolean {
    return ['piezas', 'accesorios'].includes(this.publishForm.controls.category.value);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      Array.from(input.files).forEach((file) => this.handleFile(file));
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files?.length) {
      Array.from(files).forEach((file) => this.handleFile(file));
    }
  }

  removeImage(index: number): void {
    this.selectedFiles.update((files) => files.filter((_, i) => i !== index));
    this.imagePreviews.update((previews) => previews.filter((_, i) => i !== index));
  }

  formatPriceDisplay(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/\D/g, '');
    const numeric = Number(raw);

    this.publishForm.controls.price.setValue(numeric, { emitEvent: false });
    input.value = numeric > 0 ? numeric.toLocaleString('es-DO') : '';
  }

  onSubmit(): void {
    if (this.publishForm.invalid) {
      this.publishForm.markAllAsTouched();
      this.toast.show('Completa los campos obligatorios.', 'error');
      return;
    }
    if (this.selectedFiles().length === 0) {
      this.toast.show('Agrega al menos una imagen.', 'error');
      return;
    }

    const user = this.auth.user();
    if (!user) {
      // El authGuard ya protege esta ruta; esto cubre que la sesión expire
      // mientras el formulario estaba abierto.
      this.toast.show('Tu sesion expiro. Vuelve a iniciar sesion.', 'error');
      void this.router.navigate(['/login'], { queryParams: { returnUrl: '/publicar' } });
      return;
    }

    this.isSubmitting.set(true);
    const form = this.publishForm.getRawValue();

    // Primero las imágenes: sin URLs no tiene sentido crear la publicación.
    this.storage
      .uploadListingImages(this.selectedFiles(), user.id)
      .pipe(
        switchMap((imageUrls) => {
          const item: Omit<HubMarketItemModel, 'id'> = {
            category: form.category as HubMarketCategory,
            title: form.title,
            description: form.description,
            price: form.price,
            images: imageUrls,
            location: form.location,
            sellerName: user.displayName,
            condition: form.condition === 'new' || form.condition === 'used' ? form.condition : undefined,
            ...(form.category === 'vehiculos' && {
              vehicleSpecs: {
                year: form.year ?? new Date().getFullYear(),
                mileage: form.mileage ?? 0,
                hp: form.hp ?? undefined,
                zeroTo100: form.zeroTo100 ?? undefined,
                topSpeed: form.topSpeed ?? undefined,
              },
            }),
          };

          return this.hubMarketService.publish(item, user.id, user.displayName);
        }),
      )
      .subscribe({
        next: (created) => {
          this.isSubmitting.set(false);
          this.toast.show('Tu publicacion ya esta en Hub Market.');
          void this.router.navigate([created.detailRoute ?? '/hub-market']);
        },
        error: (error: Error) => {
          this.isSubmitting.set(false);
          this.toast.show(error.message || 'No pudimos publicar tu articulo.', 'error');
        },
      });
  }

  private handleFile(file: File): void {
    const problem = this.storage.validate(file);
    if (problem) {
      this.toast.show(problem, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result && !this.imagePreviews().includes(result)) {
        this.selectedFiles.update((files) => [...files, file]);
        this.imagePreviews.update((previews) => [...previews, result]);
      }
    };
    reader.readAsDataURL(file);
  }
}
