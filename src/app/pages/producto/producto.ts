import { DOCUMENT, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { CatalogoCard } from '../../../shared/components/catalogo-card/catalogo-card';
import { FavoriteButton } from '../../../shared/components/favorite-button/favorite-button';
import { Reviews } from '../../../shared/components/reviews/reviews';
import { ImageGallery } from '../../../shared/ui/image-gallery/image-gallery';
import { TestBadge } from '../../../shared/ui/test-badge/test-badge';
import {
  ProductCategoryModel,
  ProductFitmentModel,
  ProductModel,
  ProductVariantModel,
} from '../../../shared/models/product.model';
import { ReviewStats } from '../../../shared/models/review.model';
import { ServiceModel } from '../../../shared/models/service.model';
import { CartService } from '../../../shared/services/cart.service';
import { CategoryService } from '../../../shared/services/category.service';
import { JsonLdService } from '../../../shared/services/json-ld.service';
import { SeoService } from '../../../shared/services/seo.service';
import { ProductService } from '../../../shared/services/product.service';
import { ServiceCatalogService } from '../../../shared/services/service-catalog.service';
import { ToastService } from '../../../shared/services/toast.service';
import { VehiclePickerService } from '../../../shared/services/vehicle-picker.service';
import { VehicleService } from '../../../shared/services/vehicle.service';
import { availabilityOf } from '../../../shared/utils/product-availability';
import { compatibilityOf } from '../../../shared/utils/product-compat';
import { storeWhatsAppLink } from '../../../shared/utils/contact';
import { productJsonLd } from '../../../shared/utils/structured-data';
import { variantGallery } from '../../../shared/utils/variant-gallery';

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
  imports: [DecimalPipe, RouterLink, CatalogoCard, ImageGallery, TestBadge, Reviews, FavoriteButton],
  templateUrl: './producto.html',
  styleUrl: './producto.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Producto {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly products = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly serviceCatalog = inject(ServiceCatalogService);
  private readonly vehicles = inject(VehicleService);
  private readonly picker = inject(VehiclePickerService);
  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);
  private readonly seo = inject(SeoService);
  private readonly document = inject(DOCUMENT);
  private readonly jsonLd = inject(JsonLdService);

  readonly product = signal<ProductModel | undefined>(undefined);
  readonly fitments = signal<ProductFitmentModel[]>([]);
  readonly fitmentLines = signal<FitmentLine[]>([]);
  readonly related = signal<ProductModel[]>([]);
  /** Las opciones activas (color, talla…); vacío si el producto no las tiene. */
  readonly variants = signal<ProductVariantModel[]>([]);
  private readonly selectedVariantId = signal<number | null>(null);
  readonly isLoading = signal(true);
  /** Las estadísticas de las reseñas reales; el bloque de reseñas las avisa al cargarlas. */
  readonly reviewStats = signal<ReviewStats | null>(null);

  private readonly categories = toSignal(this.categoryService.getAll(), {
    initialValue: [] as ProductCategoryModel[],
  });
  private readonly services = toSignal(this.serviceCatalog.getServices(), {
    initialValue: [] as ServiceModel[],
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

  /** La opción elegida, o `null` si no hay o el producto no tiene. */
  readonly selectedVariant = computed(
    () => this.variants().find((v) => v.id === this.selectedVariantId()) ?? null,
  );

  /** Qué enseña la galería: con una opción de dos o más fotos propias, solo las de esa opción (ver `variantGallery`). */
  readonly gallery = computed(() => variantGallery(this.images(), this.selectedVariant()));

  /** Cómo se llama lo que hay que elegir: "Color", "Talla"… */
  readonly variantLabel = computed(() => this.product()?.variantLabel || 'Opción');

  /** Falta elegir: el producto tiene opciones y todavía no se escogió ninguna. */
  readonly needsVariant = computed(() => (this.product()?.hasVariants ?? false) && !this.selectedVariant());

  /**
   * Con una opción elegida, la disponibilidad es la de esa opción; sin elegir, la del
   * producto (la suma de las opciones).
   */
  readonly availability = computed(() => {
    const p = this.product();
    return p ? availabilityOf(p, this.selectedVariant()) : undefined;
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

  /**
   * A dónde lleva "Agendar la instalación": a la agenda con el servicio ya elegido.
   * Si la pieza no tiene un servicio asociado (o está apagado) se cae a la lista del
   * taller, que es mejor que una agenda sin servicio.
   */
  readonly installLink = computed<{ path: string[]; query: Record<string, number> | null }>(() => {
    const service = this.installationService();
    return service
      ? { path: ['/servicios', 'agendar'], query: { service: service.id } }
      : { path: ['/servicios'], query: null };
  });

  /** El mensaje de WhatsApp: qué producto es, su SKU y dónde verlo; y el vehículo si hay uno. */
  readonly whatsappLink = computed(() => {
    const p = this.product();
    if (!p) return '';
    const origin = this.document.defaultView?.location.origin ?? 'https://xautohubrd.com';
    const vehicle = this.vehicleLabel();
    const ask = vehicle ? ` ¿Le sirve a mi ${vehicle}?` : '';
    const option = this.selectedVariant() ? ` en ${this.selectedVariant()?.name}` : '';
    return storeWhatsAppLink(`Hola X AutoHub, me interesa ${p.name}${option} (SKU ${p.sku}).${ask} ${origin}/tienda/p/${p.slug}`);
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.seo.reset();
      this.jsonLd.set('product', null);
    });

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
                    variants: product.hasVariants ? this.products.getVariants(product.id) : of([]),
                  })
                : of({ product: undefined, fitments: [], related: [], variants: [] }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: ({ product, fitments, related, variants }) => {
          this.product.set(product);
          // La opción elegida en el producto anterior no vale para este.
          this.variants.set(variants);
          this.selectedVariantId.set(null);
          // Las del producto anterior no valen para este: el bloque de reseñas las vuelve a avisar.
          this.reviewStats.set(null);
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

    // JSON-LD Product. Un producto de prueba no se anuncia a los buscadores.
    effect(() => {
      const product = this.product();
      const availability = this.availability();
      const stats = this.reviewStats();
      untracked(() =>
        this.jsonLd.set(
          'product',
          product && availability && !product.isTest ? productJsonLd(product, { availability, stats }) : null,
        ),
      );
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
      this.seo.reset();
      this.seo.set({
        title: 'Producto no encontrado | X AutoHub',
        description: 'Ese producto ya no está en la tienda.',
        path: '/tienda',
      });
      return;
    }
    const text = (product.shortDescription || product.description).trim();
    this.seo.set({
      title: `${product.name} | X AutoHub`,
      description: text.length > 155 ? `${text.slice(0, 152).trimEnd()}…` : text,
      path: `/tienda/p/${product.slug}`,
      image: product.images?.[0] || product.imgUrl,
      type: 'product',
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

  /** Elegir una opción. Una agotada de inventario propio no se puede elegir. */
  chooseVariant(variant: ProductVariantModel): void {
    if (!this.isVariantAvailable(variant)) return;
    this.selectedVariantId.set(variant.id);
  }

  /** ¿Se puede comprar esta opción? Lo bajo pedido nunca está agotado. */
  isVariantAvailable(variant: ProductVariantModel): boolean {
    return this.product()?.fulfillment === 'on_order' || variant.stock > 0;
  }

  addToCart(): boolean {
    const product = this.product();
    if (!product || !this.availability()?.canBuy) return false;

    // Un producto con opciones no se agrega sin elegir una: se dice cuál falta.
    if (this.needsVariant()) {
      this.toast.show(`Elige ${this.variantLabel().toLowerCase()} antes de agregarlo al carrito`, 'error');
      return false;
    }

    try {
      if (!this.cart.addToCart(product, this.selectedVariant())) return false;
      const option = this.selectedVariant() ? ` (${this.selectedVariant()?.name})` : '';
      this.toast.show(`${product.name}${option} agregado al carrito`);
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
