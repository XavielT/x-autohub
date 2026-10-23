import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CatalogoCard } from '../../../shared/components/catalogo-card/catalogo-card';
import { HubPartModel } from '../../../shared/models/hub-part.model';
import { CartService } from '../../../shared/services/cart.service';
import { HubPartService } from '../../../shared/services/hub-part.service';
import { CategoryService } from '../../../shared/services/category.service';
import { ProductCategoryModel } from '../../../shared/models/product.model';
import { STORE_PHONE_DISPLAY, storeWhatsAppLink } from '../../../shared/utils/contact';

interface CategoryOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-catalogo',
  imports: [FormsModule, CatalogoCard],
  templateUrl: './catalogo.html',
  styleUrl: './catalogo.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Catalogo implements OnInit {
  private readonly cartService = inject(CartService);
  private readonly hubPartService = inject(HubPartService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly categoryService = inject(CategoryService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly allParts = signal<HubPartModel[]>([]);

  readonly isLoading = signal(true);
  readonly searchQuery = signal('');
  readonly selectedCategory = signal('');

  readonly categories: readonly CategoryOption[] = [
    { value: 'frenos', label: 'Frenos' },
    { value: 'suspension', label: 'Suspensión y Chassis' },
    { value: 'motor', label: 'Motor' },
    { value: 'escape', label: 'Escape / Mufflers' },
    { value: 'filtros', label: 'Filtros' },
    { value: 'luces', label: 'Luces' },
    { value: 'electrico', label: 'Eléctrico' },
    { value: 'refrigeracion', label: 'Refrigeración' },
    { value: 'transmision', label: 'Transmisión' },
    { value: 'llantas', label: 'Aros y Gomas' },
    { value: 'bateria', label: 'Batería' },
    { value: 'audio', label: 'Audio' },
    { value: 'interior', label: 'Interior' },
    { value: 'exterior', label: 'Exterior' },
    { value: 'aceites', label: 'Aceites' },
    { value: 'detailing', label: 'Detailing' },
    { value: 'herramientas', label: 'Herramientas' },
  ];

  /**
   * Las categorías nuevas (migración 0017), para los enlaces del menú, del home y
   * del footer (`/tienda?categoria=<slug>`). El filtro de la izquierda sigue siendo
   * el de las 17 categorías de texto; la fase 3 lo reemplaza por el árbol.
   */
  private readonly allCategories = signal<ProductCategoryModel[]>([]);
  /** El slug de la categoría nueva que pide la URL, o vacío. */
  readonly categorySlug = signal('');

  /** La categoría activa por slug y sus hijas: lo que el filtro acepta. */
  private readonly categoryIds = computed<ReadonlySet<number> | null>(() => {
    const slug = this.categorySlug();
    if (!slug) return null;
    const root = this.allCategories().find((c) => c.slug === slug);
    if (!root) return new Set();
    return new Set([root.id, ...this.allCategories().filter((c) => c.parentId === root.id).map((c) => c.id)]);
  });

  readonly activeCategoryName = computed(
    () => this.allCategories().find((c) => c.slug === this.categorySlug())?.name ?? '',
  );

  readonly whatsappHelpLink = storeWhatsAppLink('Hola X AutoHub, tengo una duda sobre una pieza');
  readonly phone = STORE_PHONE_DISPLAY;

  /** Se recalcula solo cuando cambia el catálogo, la búsqueda o la categoría. */
  readonly filteredParts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const category = this.selectedCategory();
    const ids = this.categoryIds();

    return this.allParts().filter((part) => {
      if (ids && (part.categoryId === null || !ids.has(part.categoryId))) return false;

      const matchesSearch =
        query.length === 0 ||
        part.name.toLowerCase().includes(query) ||
        part.brand.toLowerCase().includes(query);

      const matchesCategory = category ? part.category === category : true;

      return matchesSearch && matchesCategory;
    });
  });

  ngOnInit(): void {
    this.categoryService.getAll().subscribe((all) => this.allCategories.set(all));

    // Los parámetros se escuchan (no se leen una vez): ir de `/buscar?q=a` a
    // `/buscar?q=b` desde el buscador del navbar reutiliza este mismo componente.
    //   · `q`: el texto del buscador.
    //   · `categoria`: slug de una categoría nueva (menú, home, footer).
    //   · `category`: la categoría de texto de antes (/catalogo?category=...).
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.searchQuery.set(params.get('q') ?? '');
      this.categorySlug.set(params.get('categoria') ?? '');

      const categoryFromUrl = params.get('category');
      this.selectedCategory.set(
        categoryFromUrl && this.categories.some((c) => c.value === categoryFromUrl) ? categoryFromUrl : '',
      );
    });

    this.hubPartService.getAll().subscribe({
      next: (parts) => {
        this.allParts.set(parts);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  /** Quita el filtro de la categoría nueva y deja el resto de la URL como está. */
  clearCategorySlug(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { categoria: null },
      queryParamsHandling: 'merge',
    });
  }

  onCategorySelect(category: string): void {
    this.selectedCategory.update((current) => (current === category ? '' : category));
  }

  openCart(): void {
    this.cartService.toggleCart();
  }
}
