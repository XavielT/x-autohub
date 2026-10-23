import { DOCUMENT, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { CatalogoCard } from '../../../shared/components/catalogo-card/catalogo-card';
import { ImageGallery } from '../../../shared/ui/image-gallery/image-gallery';
import { TestBadge } from '../../../shared/ui/test-badge/test-badge';
import { ProductCategoryModel, ProductFitmentModel, ProductModel } from '../../../shared/models/product.model';
import { ServiciosCardModel } from '../../../shared/models/servicios-card.model';
import { CartService } from '../../../shared/services/cart.service';
import { CategoryService } from '../../../shared/services/category.service';
import { ProductService } from '../../../shared/services/product.service';
import { ServiciosCardService } from '../../../shared/services/servicios-card.service';
import { ToastService } from '../../../shared/services/toast.service';
import { VehiclePickerService } from '../../../shared/services/vehicle-picker.service';
import { VehicleService } from '../../../shared/services/vehicle.service';
import { availabilityOf } from '../../../shared/utils/product-availability';
import { compatibilityOf } from '../../../shared/utils/product-compat';
import { storeWhatsAppLink } from '../../../shared/utils/contact';

/** El `description` que trae `index.html`: el que vuelve al salir de una ficha. */
const DEFAULT_DESCRIPTION =
  'Accesorios y piezas para tu carro, con taller propio, en Republica Dominicana. Encuentra lo que le sirve a tu vehiculo, instalalo con nosotros y mira ademas vehiculos y la comunidad automotriz.';

/** Una fila de compatibilidad con nombres: "Toyota Corolla · 2010–2020". */
export interface FitmentLine {
  id: number;
  text: string;
}

/**
 * La ficha de producto, `/tienda/p/:slug`.
 *
 * Dice sin rodeos lo que el cliente quiere saber: cuánto cuesta (con la oferta si
 * hay), si hay y cuándo llega, **si le sirve a su carro**, y cómo comprarlo, ya
 * sea con el carrito o preguntando por WhatsApp con el mensaje escrito.
 *
 * La compatibilidad nunca se afirma sin que alguien la haya declarado: un
 * producto específico sin compatibilidad cargada dice "Consultar compatibilidad".
 */
@Component({
  selector: 'app-producto',
  imports: [DecimalPipe, RouterLink, CatalogoCard, ImageGallery, TestBadge],
  templateUrl: './producto.html',
  styleUrl: './producto.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Producto {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly products = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly servicios = inject(ServiciosCardService);
  private readonly vehicles = inject(VehicleService);
  private readonly picker = inject(VehiclePickerService);
  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  readonly product = signal<ProductModel | undefined>(undefined);
  readonly fitments = signal<ProductFitmentModel[]>([]);
  readonly fitmentLines = signal<FitmentLine[]>([]);
  readonly related = signal<ProductModel[]>([]);
  readonly isLoading = signal(true);

  private readonly categories = toSignal(this.categoryService.getAll(), {
    initialValue: [] as ProductCategoryModel[],
  });
  private readonly services = toSignal(this.servicios.getServicios(), {
    initialValue: [] as ServiciosCardModel[],
  });

  readonly vehicleLabel = this.vehicles.selectedLabel;

  readonly category = computed(() => {
    const id = this.product()?.categoryId;
    return id === null || id === undefined ? undefined : this.categories().find((c) => c.id === id);
  });

  readonly images = computed(() => {
    const p = this.product();
    return p ? (p.images?.length ? p.images : [p.imgUrl]) : [];
  });

  readonly availability = computed(() => {
    const p = this.product();
    return p ? availabilityOf(p) : undefined;
  });

  readonly discount = computed(() => {
    const p = this.product();
    if (!p || p.compareAtPrice === null || p.compareAtPrice <= p.price) return 0;
    return Math.round(((p.compareAtPrice - p.price) / p.compareAtPrice) * 100);
  });

  /** Las cuatro (cinco) cosas que puede decir el bloque "¿Sirve para mi carro?". */
  readonly compat = computed(() => {
    const p = this.product();
    return p ? compatibilityOf(p, this.fitments(), this.vehicles.selected()) : undefined;
  });

  /** Las especificaciones como filas de la tabla. */
  readonly specs = computed(() => Object.entries(this.product()?.specs ?? {}));

  /** El servicio que instala este producto, si lo tiene y si se encuentra. */
  readonly installationService = computed(() => {
    const id = this.product()?.installationServiceId;
    return id === null || id === undefined ? undefined : this.services().find((s) => s.id === id);
  });

  /** El mensaje de WhatsApp: qué producto es, su SKU y dónde verlo; y el vehículo si hay uno. */
  readonly whatsappLink = computed(() => {
    const p = this.product();
    if (!p) return '';
    const origin = this.document.defaultView?.location.origin ?? 'https://xautohubrd.com';
    const vehicle = this.vehicleLabel();
    const ask = vehicle ? ` ¿Le sirve a mi ${vehicle}?` : '';
    return storeWhatsAppLink(`Hola X AutoHub, me interesa ${p.name} (SKU ${p.sku}).${ask} ${origin}/tienda/p/${p.slug}`);
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.meta.updateTag({ name: 'description', content: DEFAULT_DESCRIPTION }));

    this.route.paramMap
      .pipe(
        map((params) => params.get('slug') ?? ''),
        switchMap((slug) => {
          this.isLoading.set(true);
          return this.products.getBySlug(slug).pipe(
            switchMap((product) =>
              product
                ? forkJoin({
                    product: of(product),
                    fitments: this.products.getFitments(product.id),
                    related: this.products.getRelated(product, 8),
                  })
                : of({ product: undefined, fitments: [], related: [] }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: ({ product, fitments, related }) => {
          this.product.set(product);
          this.fitments.set(fitments);
          this.related.set(related);
          this.isLoading.set(false);
          this.applySeo(product);
        },
        error: () => {
          this.product.set(undefined);
          this.isLoading.set(false);
        },
      });

    // Los nombres de la marca y el modelo de cada fila de compatibilidad.
    effect(() => {
      const fitments = this.fitments();
      untracked(() => this.resolveFitmentLines(fitments));
    });
  }

  /** El título y la descripción de la ficha: lo que ve la pestaña y lo que indexan los buscadores. */
  private applySeo(product: ProductModel | undefined): void {
    if (!product) {
      this.title.setTitle('Producto no encontrado | X AutoHub');
      return;
    }
    this.title.setTitle(`${product.name} | X AutoHub`);
    const text = (product.shortDescription || product.description).trim();
    this.meta.updateTag({
      name: 'description',
      content: text.length > 155 ? `${text.slice(0, 152).trimEnd()}…` : text,
    });
  }

  private resolveFitmentLines(fitments: ProductFitmentModel[]): void {
    if (fitments.length === 0) {
      this.fitmentLines.set([]);
      return;
    }

    const makeIds = [...new Set(fitments.map((f) => f.makeId))];
    forkJoin({
      makes: this.vehicles.getMakes(),
      models: forkJoin(makeIds.map((id) => this.vehicles.getModels(id))),
    }).subscribe({
      next: ({ makes, models }) => {
        const allModels = models.flat();
        this.fitmentLines.set(
          fitments.map((f) => {
            const make = makes.find((m) => m.id === f.makeId)?.name ?? 'Marca';
            const model = f.modelId === null ? 'todos los modelos' : (allModels.find((m) => m.id === f.modelId)?.name ?? 'modelo');
            return { id: f.id, text: `${make} ${model} · ${yearsText(f.yearFrom, f.yearTo)}` };
          }),
        );
      },
      error: () => this.fitmentLines.set([]),
    });
  }

  addToCart(): boolean {
    const product = this.product();
    if (!product || !this.availability()?.canBuy) return false;

    try {
      this.cart.addToCart(product);
      this.toast.show(`${product.name} agregado al carrito`);
      return true;
    } catch {
      this.toast.show('No se pudo agregar el articulo', 'error');
      return false;
    }
  }

  /** "Comprar ahora": agrega y va directo al checkout. */
  buyNow(): void {
    if (this.addToCart()) void this.router.navigate(['/checkout']);
  }

  pickVehicle(): void {
    this.picker.open();
  }
}

/** "2010–2020", "desde 2015", "hasta 2012", "2014" o "todos los años". */
export function yearsText(from: number | null, to: number | null): string {
  if (from !== null && to !== null) return from === to ? `${from}` : `${from}–${to}`;
  if (from !== null) return `desde ${from}`;
  if (to !== null) return `hasta ${to}`;
  return 'todos los años';
}
