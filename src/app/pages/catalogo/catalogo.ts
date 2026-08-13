import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CatalogoCard } from '../../../shared/components/catalogo-card/catalogo-card';
import { HubPartModel } from '../../../shared/models/hub-part.model';
import { CartService } from '../../../shared/services/cart.service';
import { HubPartService } from '../../../shared/services/hub-part.service';

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

  /** Se recalcula solo cuando cambia el catálogo, la búsqueda o la categoría. */
  readonly filteredParts = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const category = this.selectedCategory();

    return this.allParts().filter((part) => {
      const matchesSearch =
        query.length === 0 ||
        part.name.toLowerCase().includes(query) ||
        part.brand.toLowerCase().includes(query);

      const matchesCategory = category ? part.category === category : true;

      return matchesSearch && matchesCategory;
    });
  });

  ngOnInit(): void {
    // La categoría puede venir del home (/catalogo?category=suspension).
    const categoryFromUrl = this.route.snapshot.queryParamMap.get('category');
    if (categoryFromUrl && this.categories.some((c) => c.value === categoryFromUrl)) {
      this.selectedCategory.set(categoryFromUrl);
    }

    this.hubPartService.getAll().subscribe({
      next: (parts) => {
        this.allParts.set(parts);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  onCategorySelect(category: string): void {
    this.selectedCategory.update((current) => (current === category ? '' : category));
  }

  openCart(): void {
    this.cartService.toggleCart();
  }
}
