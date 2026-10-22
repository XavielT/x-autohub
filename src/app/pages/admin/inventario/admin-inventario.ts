import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { forkJoin, map, switchMap } from 'rxjs';
import { AdminService } from '../../../../shared/services/admin.service';
import { AdminCatalogService } from '../../../../shared/services/admin-catalog.service';
import { ServiciosCardService } from '../../../../shared/services/servicios-card.service';
import { StorageService } from '../../../../shared/services/storage.service';
import { ToastService } from '../../../../shared/services/toast.service';
import {
  AdminNewsModel,
  AdminPartModel,
  AdminVehicleModel,
  CHASIS_OPTIONS,
  FUEL_OPTIONS,
  FitmentDraft,
  SCOPE_OPTIONS,
  TRACTION_OPTIONS,
} from '../../../../shared/models/admin-inventory.model';
import { ChasisType, FuelType, NewsScope, TractionType } from '../../../../core/supabase/database.types';
import { ProductCategoryModel, ProductFitmentType, ProductFulfillment } from '../../../../shared/models/product.model';
import { ServiciosCardModel } from '../../../../shared/models/servicios-card.model';
import { buildCategoryTree } from '../../../../shared/utils/category-tree';
import { LocationSelect } from '../../../../shared/ui/location-select/location-select';
import { AdminCategorias } from './admin-categorias/admin-categorias';
import { AdminMarcas } from './admin-marcas/admin-marcas';
import { FitmentEditor } from './fitment-editor/fitment-editor';
import { SpecsEditor } from './specs-editor/specs-editor';

type Tab = 'piezas' | 'vehiculos' | 'noticias' | 'categorias' | 'marcas';

/**
 * Reglas que cruzan dos campos del formulario de una pieza.
 *
 *   · La oferta (`compareAtPrice`) tiene que ser mayor que el precio: un "antes"
 *     igual o menor que el "ahora" no es una oferta, y la base lo rechaza.
 *   · Un artículo bajo pedido tiene que decir cuántos días tarda: es lo que se
 *     muestra en la tarjeta, la ficha y el checkout.
 *
 * Los mismos checks existen en Postgres; aquí solo se avisa antes de ir a la red.
 */
function partRules(group: AbstractControl): ValidationErrors | null {
  const price = Number(group.get('price')?.value);
  const compareAt = group.get('compareAtPrice')?.value as number | null;
  const fulfillment = group.get('fulfillment')?.value as ProductFulfillment;
  const leadTime = group.get('leadTimeDays')?.value as number | null;

  const errors: ValidationErrors = {};
  if (compareAt !== null && compareAt !== undefined && !(compareAt > price)) {
    errors['compareAtLow'] = true;
  }
  if (fulfillment === 'on_order' && !(leadTime !== null && leadTime >= 1)) {
    errors['leadTimeMissing'] = true;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

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
  imports: [
    DecimalPipe,
    DatePipe,
    ReactiveFormsModule,
    LocationSelect,
    FitmentEditor,
    SpecsEditor,
    AdminCategorias,
    AdminMarcas,
  ],
  templateUrl: './admin-inventario.html',
  styleUrl: './admin-inventario.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminInventario implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly catalog = inject(AdminCatalogService);
  private readonly servicios = inject(ServiciosCardService);
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

  /** Todas las categorías, para el selector de la pieza y para mostrar su nombre. */
  readonly categories = signal<ProductCategoryModel[]>([]);
  /** Las activas en forma de árbol, que es como se ofrecen en el `<select>`. */
  readonly categoryTree = computed(() =>
    buildCategoryTree(this.categories().filter((c) => c.isActive)),
  );
  /** Servicios del taller, para ligar una pieza instalable a su instalación. */
  readonly services = signal<ServiciosCardModel[]>([]);
  /** Compatibilidad y especificaciones de la pieza abierta; el formulario las guarda aparte. */
  readonly fitments = signal<FitmentDraft[]>([]);
  readonly specs = signal<Record<string, string>>({});

  readonly fulfillmentOptions: readonly { value: ProductFulfillment; label: string }[] = [
    { value: 'stock', label: 'En stock (inventario propio)' },
    { value: 'on_order', label: 'Bajo pedido' },
  ];
  readonly fitmentOptions: readonly { value: ProductFitmentType; label: string }[] = [
    { value: 'specific', label: 'Solo para ciertos vehiculos' },
    { value: 'universal', label: 'Universal (sirve para cualquiera)' },
  ];

  readonly chasisOptions = CHASIS_OPTIONS;
  readonly tractionOptions = TRACTION_OPTIONS;
  readonly fuelOptions = FUEL_OPTIONS;
  readonly scopeOptions = SCOPE_OPTIONS;
  readonly maxYear = MAX_YEAR;

  readonly partForm = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.maxLength(120)]],
      brand: ['', Validators.required],
      categoryId: [null as number | null, Validators.required],
      // Vacío = lo genera la base al guardar (nombre-id), que es la única forma
      // de garantizar que no choque con otro.
      slug: ['', Validators.pattern(/^([a-z0-9]+(-[a-z0-9]+)*)?$/)],
      sku: ['', Validators.maxLength(40)],
      shortDescription: ['', Validators.maxLength(160)],
      description: [''],
      price: [0, [Validators.required, Validators.min(0)]],
      compareAtPrice: [null as number | null, Validators.min(0)],
      fulfillment: ['stock' as ProductFulfillment, Validators.required],
      stock: [0, [Validators.required, Validators.min(0)]],
      leadTimeDays: [null as number | null, Validators.min(1)],
      fitmentType: ['specific' as ProductFitmentType, Validators.required],
      installable: [false],
      installationServiceId: [null as number | null],
      isFeatured: [false],
      isActive: [true],
      isTest: [false],
    },
    { validators: partRules },
  );

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
    isTest: [false],
  });

  readonly newsForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    text: ['', Validators.required],
    textLarge: [''],
    scope: ['local' as NewsScope, Validators.required],
    author: [''],
    publishedAt: [new Date().toISOString().slice(0, 10), Validators.required],
    isPublished: [true],
    isTest: [false],
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

    // No bloquean la pantalla: solo alimentan los selectores del formulario de
    // la pieza, y sin ellos el resto del panel sirve igual.
    this.catalog.getCategories().subscribe({
      next: (v) => this.categories.set(v),
      error: (e: Error) => this.toast.show(e.message, 'error'),
    });
    this.servicios.getServicios().subscribe({
      next: (v) => this.services.set(v),
      error: () => undefined,
    });
  }

  /** El nombre de la categoría de una pieza, con el texto viejo de respaldo. */
  categoryName(part: AdminPartModel): string {
    return this.categories().find((c) => c.id === part.categoryId)?.name ?? part.category;
  }

  /** Error de grupo del formulario de la pieza (las reglas que cruzan campos). */
  partRuleError(code: 'compareAtLow' | 'leadTimeMissing'): boolean {
    const touched = this.partForm.touched || this.partForm.dirty;
    return touched && !!this.partForm.errors?.[code];
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
    this.resetForms();
  }

  /** Deja los cuatro formularios (y lo que cuelga de la pieza) como al principio. */
  private resetForms(): void {
    this.partForm.reset();
    this.vehicleForm.reset();
    this.newsForm.reset();
    this.fitments.set([]);
    this.specs.set({});
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
        // La ficha y su compatibilidad son dos lecturas; se abre el formulario
        // cuando llegan las dos, para no mostrarlo a medias.
        forkJoin({ part: this.admin.getPart(id), fitments: this.catalog.getFitments(id) }).subscribe({
          next: ({ part: p, fitments }) => {
            this.partForm.setValue({
              name: p.name,
              brand: p.brand,
              categoryId: p.categoryId,
              slug: p.slug,
              sku: p.sku,
              shortDescription: p.shortDescription,
              description: p.description,
              price: p.price,
              compareAtPrice: p.compareAtPrice,
              fulfillment: p.fulfillment,
              stock: p.stock,
              leadTimeDays: p.leadTimeDays,
              fitmentType: p.fitmentType,
              installable: p.installable,
              installationServiceId: p.installationServiceId,
              isFeatured: p.isFeatured,
              isActive: p.isActive,
              isTest: p.isTest,
            });
            this.fitments.set(fitments);
            this.specs.set(p.specs);
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
              isTest: v.isTest,
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
              isTest: n.isTest,
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
    this.resetForms();
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
            categoryId: form.categoryId,
            slug: form.slug,
            sku: form.sku,
            name: form.name,
            brand: form.brand,
            shortDescription: form.shortDescription,
            imgUrl: images[0],
            images,
            price: form.price,
            compareAtPrice: form.compareAtPrice,
            description: form.description,
            stock: form.stock,
            isFeatured: form.isFeatured,
            fulfillment: form.fulfillment,
            leadTimeDays: form.leadTimeDays,
            fitmentType: form.fitmentType,
            installable: form.installable,
            installationServiceId: form.installationServiceId,
            specs: this.specs(),
            isActive: form.isActive,
            isTest: form.isTest,
          };
          return (
            id === null ? this.admin.createPart(draft) : this.admin.updatePartFull(id, draft)
          ).pipe(
            // La compatibilidad se guarda con la pieza ya creada (hace falta su
            // id). Un producto universal no lleva ninguna: si antes era
            // específico, se limpia en vez de dejar filas que nadie ve.
            switchMap((saved) =>
              this.catalog
                .replaceFitments(saved.id, form.fitmentType === 'specific' ? this.fitments() : [])
                .pipe(map(() => saved)),
            ),
          );
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
            isTest: form.isTest,
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

  /**
   * Marca o desmarca desde la tabla, sin abrir el formulario.
   *
   * Es la acción que de verdad se usa: marcar algo como prueba es una decisión
   * de un segundo, y obligar a abrir el editor completo para un checkbox haría
   * que nadie lo usara. El formulario también lo trae, para el alta.
   */
  togglePartTest(part: AdminPartModel): void {
    this.savingId.set(`p${part.id}`);
    this.admin.updatePart(part.id, { isTest: !part.isTest }).subscribe({
      next: () => {
        this.savingId.set(null);
        this.parts.update((l) =>
          l.map((p) => (p.id === part.id ? { ...p, isTest: !part.isTest } : p)),
        );
        this.toast.show(
          part.isTest ? 'Ya no es un articulo de prueba.' : 'Marcada como articulo de prueba.',
        );
      },
      error: (e: Error) => { this.savingId.set(null); this.toast.show(e.message, 'error'); },
    });
  }

  toggleVehicleTest(v: AdminVehicleModel): void {
    this.savingId.set(`v${v.id}`);
    this.admin.updateVehicle(v.id, { isTest: !v.isTest }).subscribe({
      next: () => {
        this.savingId.set(null);
        this.vehicles.update((l) => l.map((x) => (x.id === v.id ? { ...x, isTest: !v.isTest } : x)));
        this.toast.show(
          v.isTest ? 'Ya no es un vehiculo de prueba.' : 'Marcado como vehiculo de prueba.',
        );
      },
      error: (e: Error) => { this.savingId.set(null); this.toast.show(e.message, 'error'); },
    });
  }

  toggleNewsTest(n: AdminNewsModel): void {
    this.savingId.set(`n${n.id}`);
    this.admin.updateNews(n.id, { isTest: !n.isTest }).subscribe({
      next: () => {
        this.savingId.set(null);
        this.news.update((l) => l.map((x) => (x.id === n.id ? { ...x, isTest: !n.isTest } : x)));
        this.toast.show(
          n.isTest ? 'Ya no es una noticia de prueba.' : 'Marcada como noticia de prueba.',
        );
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
    this.admin.updateNews(n.id, { isPublished: !n.isPublished }).subscribe({
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
