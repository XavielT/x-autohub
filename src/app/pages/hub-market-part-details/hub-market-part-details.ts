import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { forkJoin, of, switchMap } from 'rxjs';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketCard } from '../../../shared/components/hub-market-card/hub-market-card';

@Component({
  selector: 'app-hub-market-part-details',
  imports: [DecimalPipe, RouterLink, HubMarketCard],
  templateUrl: './hub-market-part-details.html',
  styleUrl: './hub-market-part-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubMarketPartDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly hubMarketService = inject(HubMarketService);

  readonly part = signal<HubMarketItemModel | undefined>(undefined);
  readonly relatedParts = signal<HubMarketItemModel[]>([]);
  readonly images = signal<string[]>([]);
  readonly currentImageIndex = signal(0);
  readonly isLoading = signal(true);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.isLoading.set(true);
      this.currentImageIndex.set(0);

      this.hubMarketService
        .getById(id)
        .pipe(
          switchMap((part) =>
            forkJoin({
              part: of(part),
              related: this.hubMarketService.getByCategory(part?.category ?? 'piezas'),
            }),
          ),
        )
        .subscribe({
          next: ({ part, related }) => {
            this.part.set(part);
            this.images.set(part?.images ?? []);
            this.relatedParts.set(related.filter((item) => item.id !== id).slice(0, 4));
            this.isLoading.set(false);
          },
          error: () => this.isLoading.set(false),
        });
    });
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
