import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { switchMap } from 'rxjs';
import { AdminService } from '../../../../shared/services/admin.service';
import { StorageService } from '../../../../shared/services/storage.service';
import { ToastService } from '../../../../shared/services/toast.service';
import {
  AdminNewsModel,
  AdminPartModel,
  AdminVehicleModel,
  CHASIS_OPTIONS,
  FUEL_OPTIONS,
  PART_CATEGORIES,
  SCOPE_OPTIONS,
  TRACTION_OPTIONS,
} from '../../../../shared/models/admin-inventory.model';
import { ChasisType, FuelType, NewsScope, TractionType } from '../../../../core/supabase/database.types';

type Tab = 'piezas' | 'vehiculos' | 'noticias';

/** Año máximo razonable para un modelo: el que viene, no 2100. */
const MAX_YEAR = new Date().getFullYear() + 1;

/**
 * Inventario propio de X AutoHub: catálogo de piezas, vehículos oficiales y
 * noticias. Nada de Hub Market — eso lo publica la comunidad y cada quien
 * administra lo suyo.
 *
 * Cubre las dos cosas: dar de alta artículos nuevos y ajustar lo que ya existe
 * (precio, existencias, visibilidad).
 *
 * Las tres listas piden también lo desactivado, que el sitio público no muestra:
 * la política de cada tabla es `using (is_active or public.is_admin())`.
 *
 * **Las imágenes se suben antes de insertar la fila.** Si se hiciera al revés y
 * la subida fallara, quedaría un artículo en el catálogo apuntando a fotos que no
 * existen. Van al bucket `inventory`, cuya escritura solo permite `is_admin()`.
 */
@Component({
  selector: 'app-admin-inventario',
  imports: [DecimalPipe, DatePipe, ReactiveFormsModule],
  templateUrl: './admin-inventario.html',
  styleUrl: './admin-inventario.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminInventario implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly tab = signal<Tab>('piezas');
  readonly isLoading = signal(true);
  readonly savingId = signal<string | null>(null);

  readonly parts = signal<AdminPartModel[]>([]);
  readonly vehicles = signal<AdminVehicleModel[]>([]);
  readonly news = signal<AdminNewsModel[]>([]);

  // --- Alta ----------------------------------------------------------------

  readonly isCreating = signal(false);
  readonly isSubmitting = signal(false);
  /** Vistas previas en data URL, para ver lo que se va a subir antes de subirlo. */
  readonly previews = signal<string[]>([]);
  private selectedFiles: File[] = [];

  readonly categories = PART_CATEGORIES;
  readonly chasisOptions = CHASIS_OPTIONS;
  readonly tractionOptions = TRACTION_OPTIONS;
  readonly fuelOptions = FUEL_OPTIONS;
  readonly scopeOptions = SCOPE_OPTIONS;
  readonly maxYear = MAX_YEAR;

  readonly partForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    brand: ['', Validators.required],
    category: ['frenos', Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    stock: [0, [Validators.required, Validators.min(0)]],
    description: [''],
    isActive: [true],
  });

  readonly vehicleForm = this.fb.nonNullable.group({
    brand: ['', Validators.required],
    model: ['', Validators.required],
    year: [MAX_YEAR - 1, [Validators.required, Validators.min(1900), Validators.max(2100)]],
    price: [0, [Validators.required, Validators.min(0)]],
    color: ['', Validators.required],
    mileage: [0, [Validators.required, Validators.min(0)]],
    chasisType: ['sedan' as ChasisType, Validators.required],
    doors: [4, [Validators.required, Validators.min(1), Validators.max(8)]],
    traction: ['fwd' as TractionType, Validators.required],
    fuel: ['gasoline' as FuelType, Validators.required],
    cylinders: [4, [Validators.required, Validators.min(0), Validators.max(16)]],
    location: ['Santo Domingo', Validators.required],
    contact: ['', Validators.required],
    description: [''],
    isAvailable: [true],
  });

  readonly newsForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    text: ['', Validators.required],
    textLarge: [''],
    scope: ['local' as NewsScope, Validators.required],
    author: [''],
    publishedAt: [new Date().toISOString().slice(0, 10), Validators.required],
    isPublished: [true],
  });

  ngOnInit(): void {
    this.loadAll();
  }

  /**
   * Carga las tres listas de una vez.
   *
   * Son tablas pequeñas (decenas de filas) y así cambiar de pestaña es
   * instantáneo, sin un salto de carga cada vez.
   */
  private loadAll(): void {
    this.isLoading.set(true);
    let pending = 3;
    const done = () => {
      if (--pending === 0) this.isLoading.set(false);
    };
    const fail = (error: Error) => {
      this.toast.show(error.message, 'error');
      done();
    };

    this.admin.getInventoryParts().subscribe({
      next: (v) => { this.parts.set(v); done(); },
      error: fail,
    });
    this.admin.getInventoryVehicles().subscribe({
      next: (v) => { this.vehicles.set(v); done(); },
      error: fail,
    });
    this.admin.getInventoryNews().subscribe({
      next: (v) => { this.news.set(v); done(); },
      error: fail,
    });
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    // Cerrar el formulario al cambiar de pestaña: seguir mostrando el de piezas
    // mientras se ven vehículos haría creer que se está editando lo de abajo.
    this.cancelCreate();
  }

  startCreate(): void {
    this.isCreating.set(true);
    this.clearImages();
  }

  cancelCreate(): void {
    this.isCreating.set(false);
    this.clearImages();
    this.partForm.reset();
    this.vehicleForm.reset();
    this.newsForm.reset();
  }

  /**
   * Solo se muestra el error cuando el campo ya fue tocado.
   *
   * El grupo se anota como `FormGroup` a secas: los tres formularios tienen
   * tipos distintos, y con la unión de los tres TypeScript no resuelve la firma
   * de `.get()`. Buscar por nombre no necesita el tipo fuerte.
   */
  showError(form: 'part' | 'vehicle' | 'news', field: string): boolean {
    const group: FormGroup =
      form === 'part' ? this.partForm : form === 'vehicle' ? this.vehicleForm : this.newsForm;
    const control = group.get(field);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  // --- Imagenes ------------------------------------------------------------

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;

    const accepted: File[] = [];
    for (const file of files) {
      const problem = this.storage.validate(file);
      if (problem) {
        this.toast.show(`${file.name}: ${problem}`, 'error');
        continue;
      }
      accepted.push(file);
    }

    this.selectedFiles = [...this.selectedFiles, ...accepted];
    for (const file of accepted) {
      const reader = new FileReader();
      reader.onload = () => this.previews.update((list) => [...list, reader.result as string]);
      reader.readAsDataURL(file);
    }

    // Permite volver a elegir el mismo archivo si el usuario lo quitó y cambió de idea.
    input.value = '';
  }

  removeImage(index: number): void {
    this.selectedFiles = this.selectedFiles.filter((_, i) => i !== index);
    this.previews.update((list) => list.filter((_, i) => i !== index));
  }

  private clearImages(): void {
    this.selectedFiles = [];
    this.previews.set([]);
  }

  // --- Guardar -------------------------------------------------------------

  submitPart(): void {
    if (!this.readyToSubmit(this.partForm)) return;
    const form = this.partForm.getRawValue();

    this.isSubmitting.set(true);
    this.storage
      .uploadInventoryImages(this.selectedFiles, 'piezas')
      .pipe(
        switchMap((urls) =>
          this.admin.createPart({
            category: form.category,
            name: form.name,
            brand: form.brand,
            // La primera imagen es la portada del catálogo.
            imgUrl: urls[0],
            images: urls,
            price: form.price,
            description: form.description,
            stock: form.stock,
            isActive: form.isActive,
          }),
        ),
      )
      .subscribe({
        next: (created) => {
          this.isSubmitting.set(false);
          this.parts.update((l) => [created, ...l]);
          this.cancelCreate();
          this.toast.show(`"${created.name}" agregada al catalogo.`);
        },
        error: (error: Error) => {
          this.isSubmitting.set(false);
          this.toast.show(error.message, 'error');
        },
      });
  }

  submitVehicle(): void {
    if (!this.readyToSubmit(this.vehicleForm)) return;
    const form = this.vehicleForm.getRawValue();

    this.isSubmitting.set(true);
    this.storage
      .uploadInventoryImages(this.selectedFiles, 'vehiculos')
      .pipe(switchMap((urls) => this.admin.createVehicle({ ...form, images: urls })))
      .subscribe({
        next: (created) => {
          this.isSubmitting.set(false);
          this.vehicles.update((l) => [created, ...l]);
          this.cancelCreate();
          this.toast.show(`${created.brand} ${created.model} agregado a Auto Hub.`);
        },
        error: (error: Error) => {
          this.isSubmitting.set(false);
          this.toast.show(error.message, 'error');
        },
      });
  }

  submitNews(): void {
    if (!this.readyToSubmit(this.newsForm)) return;
    const form = this.newsForm.getRawValue();

    this.isSubmitting.set(true);
    this.storage
      .uploadInventoryImages(this.selectedFiles, 'noticias')
      .pipe(
        switchMap((urls) =>
          this.admin.createNews({
            title: form.title,
            text: form.text,
            textLarge: form.textLarge,
            imageUrl: urls[0],
            images: urls,
            scope: form.scope,
            author: form.author,
            publishedAt: form.publishedAt,
            isPublished: form.isPublished,
          }),
        ),
      )
      .subscribe({
        next: (created) => {
          this.isSubmitting.set(false);
          this.news.update((l) => [created, ...l]);
          this.cancelCreate();
          this.toast.show(`"${created.title}" publicada.`);
        },
        error: (error: Error) => {
          this.isSubmitting.set(false);
          this.toast.show(error.message, 'error');
        },
      });
  }

  /**
   * Valida el formulario y exige al menos una imagen.
   *
   * La imagen no es opcional: `hub_parts.img_url` y `news.image_url` son
   * `not null` en el esquema, así que sin foto el insert fallaría con un error de
   * base de datos en vez de un mensaje entendible. Para un vehículo no lo exige
   * la base, pero un vehículo sin foto no se vende.
   */
  private readyToSubmit(form: { invalid: boolean; markAllAsTouched: () => void }): boolean {
    if (form.invalid) {
      form.markAllAsTouched();
      this.toast.show('Revisa los campos marcados.', 'error');
      return false;
    }
    if (this.selectedFiles.length === 0) {
      this.toast.show('Agrega al menos una imagen.', 'error');
      return false;
    }
    return true;
  }

  // --- Ajustes sobre lo existente ------------------------------------------

  togglePart(part: AdminPartModel): void {
    this.savingId.set(`p${part.id}`);
    this.admin.updatePart(part.id, { isActive: !part.isActive }).subscribe({
      next: () => {
        this.savingId.set(null);
        this.parts.update((l) =>
          l.map((p) => (p.id === part.id ? { ...p, isActive: !part.isActive } : p)),
        );
        this.toast.show(part.isActive ? 'Pieza oculta del catalogo.' : 'Pieza visible.');
      },
      error: (e: Error) => { this.savingId.set(null); this.toast.show(e.message, 'error'); },
    });
  }

  savePartField(part: AdminPartModel, field: 'price' | 'stock', event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = Number(raw);

    if (!Number.isFinite(value) || value < 0) {
      this.toast.show('Ese valor no es valido.', 'error');
      return;
    }
    if (value === part[field]) return;

    this.savingId.set(`p${part.id}`);
    this.admin.updatePart(part.id, { [field]: value }).subscribe({
      next: () => {
        this.savingId.set(null);
        this.parts.update((l) => l.map((p) => (p.id === part.id ? { ...p, [field]: value } : p)));
        this.toast.show('Guardado.');
      },
      error: (e: Error) => { this.savingId.set(null); this.toast.show(e.message, 'error'); },
    });
  }

  toggleVehicle(v: AdminVehicleModel): void {
    this.savingId.set(`v${v.id}`);
    this.admin.updateVehicle(v.id, { isAvailable: !v.isAvailable }).subscribe({
      next: () => {
        this.savingId.set(null);
        this.vehicles.update((l) =>
          l.map((x) => (x.id === v.id ? { ...x, isAvailable: !v.isAvailable } : x)),
        );
        this.toast.show(v.isAvailable ? 'Vehiculo marcado como vendido.' : 'Vehiculo disponible.');
      },
      error: (e: Error) => { this.savingId.set(null); this.toast.show(e.message, 'error'); },
    });
  }

  saveVehiclePrice(v: AdminVehicleModel, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value) || value < 0) {
      this.toast.show('Ese precio no es valido.', 'error');
      return;
    }
    if (value === v.price) return;

    this.savingId.set(`v${v.id}`);
    this.admin.updateVehicle(v.id, { price: value }).subscribe({
      next: () => {
        this.savingId.set(null);
        this.vehicles.update((l) => l.map((x) => (x.id === v.id ? { ...x, price: value } : x)));
        this.toast.show('Precio actualizado.');
      },
      error: (e: Error) => { this.savingId.set(null); this.toast.show(e.message, 'error'); },
    });
  }

  toggleNews(n: AdminNewsModel): void {
    this.savingId.set(`n${n.id}`);
    this.admin.updateNews(n.id, !n.isPublished).subscribe({
      next: () => {
        this.savingId.set(null);
        this.news.update((l) =>
          l.map((x) => (x.id === n.id ? { ...x, isPublished: !n.isPublished } : x)),
        );
        this.toast.show(n.isPublished ? 'Noticia despublicada.' : 'Noticia publicada.');
      },
      error: (e: Error) => { this.savingId.set(null); this.toast.show(e.message, 'error'); },
    });
  }
}
