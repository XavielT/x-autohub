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

  /** id del artículo que se está editando; null cuando se está creando uno. */
  readonly editingId = signal<number | null>(null);
  /** true mientras se pide la fila completa al abrir el formulario de edición. */
  readonly isLoadingOne = signal(false);

  /**
   * Imágenes que la fila **ya tenía**. Van aparte de `previews`, que son las
   * nuevas: estas ya viven en Storage y no hay que volver a subirlas.
   */
  readonly existingImages = signal<string[]>([]);

  /**
   * Las que se quitaron durante la edición.
   *
   * No se borran en el momento: si se borraran al quitarlas y luego se cancelara
   * el formulario, la foto ya no existiría pero la fila seguiría apuntando a
   * ella. Se limpian de Storage **después** de que el guardado salga bien.
   */
  private removedImages: string[] = [];

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
    this.editingId.set(null);
    this.isCreating.set(true);
    this.clearImages();
    this.partForm.reset();
    this.vehicleForm.reset();
    this.newsForm.reset();
  }

  /**
   * Abre el formulario con los datos de un artículo existente.
   *
   * Pide la fila completa: el listado solo trae lo que la tabla muestra, no la
   * descripción ni las imágenes.
   */
  startEdit(id: number): void {
    this.isCreating.set(true);
    this.editingId.set(id);
    this.clearImages();
    this.isLoadingOne.set(true);

    const fail = (error: Error) => {
      this.isLoadingOne.set(false);
      this.cancelCreate();
      this.toast.show(error.message, 'error');
    };

    switch (this.tab()) {
      case 'piezas':
        this.admin.getPart(id).subscribe({
          next: (p) => {
            this.partForm.setValue({
              name: p.name,
              brand: p.brand,
              category: p.category,
              price: p.price,
              stock: p.stock,
              description: p.description,
              isActive: p.isActive,
            });
            this.existingImages.set(p.images.length ? p.images : [p.imgUrl].filter(Boolean));
            this.isLoadingOne.set(false);
          },
          error: fail,
        });
        break;

      case 'vehiculos':
        this.admin.getVehicle(id).subscribe({
          next: (v) => {
            this.vehicleForm.setValue({
              brand: v.brand,
              model: v.model,
              year: v.year,
              price: v.price,
              color: v.color,
              mileage: v.mileage,
              chasisType: v.chasisType,
              doors: v.doors,
              traction: v.traction,
              fuel: v.fuel,
              cylinders: v.cylinders,
              location: v.location,
              contact: v.contact,
              description: v.description,
              isAvailable: v.isAvailable,
            });
            this.existingImages.set(v.images);
            this.isLoadingOne.set(false);
          },
          error: fail,
        });
        break;

      case 'noticias':
        this.admin.getNews(id).subscribe({
          next: (n) => {
            this.newsForm.setValue({
              title: n.title,
              text: n.text,
              textLarge: n.textLarge,
              scope: n.scope,
              author: n.author ?? '',
              publishedAt: n.publishedAt,
              isPublished: n.isPublished,
            });
            this.existingImages.set(n.images.length ? n.images : [n.imageUrl].filter(Boolean));
            this.isLoadingOne.set(false);
          },
          error: fail,
        });
        break;
    }
  }

  cancelCreate(): void {
    this.isCreating.set(false);
    this.editingId.set(null);
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

  /** Quita una imagen nueva (todavía no subida). */
  removeImage(index: number): void {
    this.selectedFiles = this.selectedFiles.filter((_, i) => i !== index);
    this.previews.update((list) => list.filter((_, i) => i !== index));
  }

  /** Quita una imagen que la fila ya tenía. Se borra de Storage al guardar. */
  removeExistingImage(index: number): void {
    const url = this.existingImages()[index];
    if (url) this.removedImages = [...this.removedImages, url];
    this.existingImages.update((list) => list.filter((_, i) => i !== index));
  }

  private clearImages(): void {
    this.selectedFiles = [];
    this.previews.set([]);
    this.existingImages.set([]);
    this.removedImages = [];
  }

  /**
   * Limpia de Storage las imágenes que se quitaron.
   *
   * Se llama solo después de un guardado correcto, y su resultado no se espera:
   * el artículo ya quedó bien y una imagen huérfana no justifica mostrarle un
   * error al usuario.
   */
  private cleanUpRemovedImages(): void {
    if (this.removedImages.length === 0) return;
    this.storage.removeInventoryImages(this.removedImages).subscribe();
    this.removedImages = [];
  }

  // --- Guardar -------------------------------------------------------------

  submitPart(): void {
    if (!this.readyToSubmit(this.partForm)) return;
    const form = this.partForm.getRawValue();
    const id = this.editingId();

    this.isSubmitting.set(true);
    this.storage
      .uploadInventoryImages(this.selectedFiles, 'piezas')
      .pipe(
        switchMap((nuevas) => {
          // Las que se conservan van primero, y la primera de todas es la
          // portada: así reordenar es cuestión de quitar y volver a subir.
          const images = [...this.existingImages(), ...nuevas];
          const draft = {
            category: form.category,
            name: form.name,
            brand: form.brand,
            imgUrl: images[0],
            images,
            price: form.price,
            description: form.description,
            stock: form.stock,
            isActive: form.isActive,
          };
          return id === null
            ? this.admin.createPart(draft)
            : this.admin.updatePartFull(id, draft);
        }),
      )
      .subscribe({
        next: (saved) => {
          this.isSubmitting.set(false);
          this.parts.update((l) =>
            id === null ? [saved, ...l] : l.map((p) => (p.id === id ? saved : p)),
          );
          this.cleanUpRemovedImages();
          this.cancelCreate();
          this.toast.show(
            id === null ? `"${saved.name}" agregada al catalogo.` : `"${saved.name}" actualizada.`,
          );
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
    const id = this.editingId();

    this.isSubmitting.set(true);
    this.storage
      .uploadInventoryImages(this.selectedFiles, 'vehiculos')
      .pipe(
        switchMap((nuevas) => {
          const draft = { ...form, images: [...this.existingImages(), ...nuevas] };
          return id === null
            ? this.admin.createVehicle(draft)
            : this.admin.updateVehicleFull(id, draft);
        }),
      )
      .subscribe({
        next: (saved) => {
          this.isSubmitting.set(false);
          this.vehicles.update((l) =>
            id === null ? [saved, ...l] : l.map((v) => (v.id === id ? saved : v)),
          );
          this.cleanUpRemovedImages();
          this.cancelCreate();
          this.toast.show(
            id === null
              ? `${saved.brand} ${saved.model} agregado a Auto Hub.`
              : `${saved.brand} ${saved.model} actualizado.`,
          );
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
    const id = this.editingId();

    this.isSubmitting.set(true);
    this.storage
      .uploadInventoryImages(this.selectedFiles, 'noticias')
      .pipe(
        switchMap((nuevas) => {
          const images = [...this.existingImages(), ...nuevas];
          const draft = {
            title: form.title,
            text: form.text,
            textLarge: form.textLarge,
            imageUrl: images[0],
            images,
            scope: form.scope,
            author: form.author,
            publishedAt: form.publishedAt,
            isPublished: form.isPublished,
          };
          return id === null
            ? this.admin.createNews(draft)
            : this.admin.updateNewsFull(id, draft);
        }),
      )
      .subscribe({
        next: (saved) => {
          this.isSubmitting.set(false);
          this.news.update((l) =>
            id === null ? [saved, ...l] : l.map((n) => (n.id === id ? saved : n)),
          );
          this.cleanUpRemovedImages();
          this.cancelCreate();
          this.toast.show(
            id === null ? `"${saved.title}" publicada.` : `"${saved.title}" actualizada.`,
          );
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
   *
   * Cuentan las dos clases: las que la fila ya tenía y las nuevas. Al editar sin
   * tocar las fotos no hay archivos nuevos, y exigirlos obligaría a volver a
   * subir todo para cambiar un precio.
   */
  private readyToSubmit(form: { invalid: boolean; markAllAsTouched: () => void }): boolean {
    if (form.invalid) {
      form.markAllAsTouched();
      this.toast.show('Revisa los campos marcados.', 'error');
      return false;
    }
    if (this.existingImages().length + this.selectedFiles.length === 0) {
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
