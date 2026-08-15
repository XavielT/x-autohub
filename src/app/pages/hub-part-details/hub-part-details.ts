import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { forkJoin, of, switchMap } from 'rxjs';
import { HubPartModel } from '../../../shared/models/hub-part.model';
import { HubPartService } from '../../../shared/services/hub-part.service';
import { CartService } from '../../../shared/services/cart.service';
import { ToastService } from '../../../shared/services/toast.service';
import { CatalogoCard } from '../../../shared/components/catalogo-card/catalogo-card';
import { TestBadge } from '../../../shared/ui/test-badge/test-badge';

@Component({
  selector: 'app-hub-part-details',
  imports: [DecimalPipe, RouterLink, CatalogoCard, TestBadge],
  templateUrl: './hub-part-details.html',
  styleUrl: './hub-part-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubPartDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly hubPartService = inject(HubPartService);
  private readonly cartService = inject(CartService);
  private readonly toastService = inject(ToastService);

  readonly part = signal<HubPartModel | undefined>(undefined);
  readonly relatedParts = signal<HubPartModel[]>([]);
  readonly images = signal<string[]>([]);
  readonly currentImageIndex = signal(0);
  readonly isLoading = signal(true);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.isLoading.set(true);
      this.currentImageIndex.set(0);

      this.hubPartService
        .getById(id)
        .pipe(
          switchMap((part) =>
            forkJoin({
              part: of(part),
              // Sin pieza no hay categoría de la que sacar relacionados:
              // se muestran las primeras del catálogo como alternativa.
              related: part
                ? this.hubPartService.getByCategory(part.category)
                : this.hubPartService.getAll(),
            }),
          ),
        )
        .subscribe({
          next: ({ part, related }) => {
            this.part.set(part);
            this.images.set(part ? (part.images?.length ? part.images : [part.imgUrl]) : []);
            this.relatedParts.set(related.filter((item) => item.id !== id).slice(0, 4));
            this.isLoading.set(false);
          },
          error: () => this.isLoading.set(false),
        });
    });
  }

  addToCart(): void {
    const part = this.part();
    if (!part) return;

    try {
      this.cartService.addToCart(part);
      this.toastService.show(`${part.name} agregado al carrito`);
    } catch {
      this.toastService.show('No se pudo agregar el articulo', 'error');
    }
  }

  selectImage(index: number): void {
    this.currentImageIndex.set(index);
  }

  prevImage(): void {
    const total = this.images().length;
    if (total <= 1) return;
    this.currentImageIndex.update((i) => (i - 1 + total) % total);
  }

  nextImage(): void {
    const total = this.images().length;
    if (total <= 1) return;
    this.currentImageIndex.update((i) => (i + 1) % total);
  }
}
