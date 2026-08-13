import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { NewCardModel } from '../../../shared/models/new-card.model';
import { NewsService } from '../../../shared/services/news.service';

@Component({
  selector: 'app-new-details',
  imports: [RouterLink],
  templateUrl: './new-details.html',
  styleUrl: './new-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly newsService = inject(NewsService);

  readonly new = signal<NewCardModel | undefined>(undefined);
  readonly isLoading = signal(true);

  readonly slideIndex = signal(0);
  private touchStartX = 0;

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.slideIndex.set(0);
      this.isLoading.set(true);

      this.newsService.getById(id).subscribe({
        next: (item) => {
          this.new.set(item);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      });
    });
  }

  /** Portada + imágenes extra, sin duplicar URLs. */
  readonly gallerySlides = computed<string[]>(() => {
    const item = this.new();
    if (!item) return [];

    const seen = new Set<string>();
    const out: string[] = [];
    for (const url of [item.imageUrl, ...item.images]) {
      const trimmed = url?.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        out.push(trimmed);
      }
    }
    return out;
  });

  readonly carouselTrackTransform = computed(() => {
    const n = this.gallerySlides().length;
    return n === 0 ? 'none' : `translateX(-${(this.slideIndex() * 100) / n}%)`;
  });

  readonly slideBasisPercent = computed(() => {
    const n = this.gallerySlides().length;
    return n > 0 ? 100 / n : 100;
  });

  nextSlide(): void {
    const total = this.gallerySlides().length;
    if (total <= 1) return;
    this.slideIndex.update((i) => (i + 1) % total);
  }

  prevSlide(): void {
    const total = this.gallerySlides().length;
    if (total <= 1) return;
    this.slideIndex.update((i) => (i - 1 + total) % total);
  }

  goToSlide(i: number): void {
    if (i >= 0 && i < this.gallerySlides().length) {
      this.slideIndex.set(i);
    }
  }

  onCarouselTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0].clientX;
  }

  onCarouselTouchEnd(event: TouchEvent): void {
    const dx = event.changedTouches[0].clientX - this.touchStartX;
    const threshold = 48;
    if (dx < -threshold) this.nextSlide();
    else if (dx > threshold) this.prevSlide();
  }
}
