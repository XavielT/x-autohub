import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NewCardModel } from '../../../shared/models/new-card.model';
import { NEWS_MOCK } from '../../../shared/models/new-card.mock';

@Component({
  selector: 'app-new-details',
  imports: [CommonModule, RouterLink],
  templateUrl: './new-details.html',
  styleUrl: './new-details.scss',
})
export class NewDetails implements OnInit {
  new: NewCardModel | undefined;
  slideIndex = 0;
  private touchStartX = 0;
  //TODO: implements a real Api inyection in this component

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.new = NEWS_MOCK.find(n => n.id === id);
    this.slideIndex = 0;
  }

  /** Portada + imágenes extra, sin duplicar URLs. */
  get gallerySlides(): string[] {
    if (!this.new) {
      return [];
    }
    const merged = [this.new.imageUrl, ...this.new.images];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of merged) {
      const s = u?.trim();
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out.length ? out : this.new.imageUrl ? [this.new.imageUrl] : [];
  }

  get carouselTrackTransform(): string {
    const n = this.gallerySlides.length;
    if (n === 0) {
      return 'none';
    }
    return `translateX(-${(this.slideIndex * 100) / n}%)`;
  }

  get slideBasisPercent(): number {
    const n = this.gallerySlides.length;
    return n > 0 ? 100 / n : 100;
  }

  nextSlide(): void {
    const slides = this.gallerySlides;
    if (slides.length <= 1) {
      return;
    }
    this.slideIndex = (this.slideIndex + 1) % slides.length;
  }

  prevSlide(): void {
    const slides = this.gallerySlides;
    if (slides.length <= 1) {
      return;
    }
    this.slideIndex = (this.slideIndex - 1 + slides.length) % slides.length;
  }

  goToSlide(i: number): void {
    const slides = this.gallerySlides;
    if (i >= 0 && i < slides.length) {
      this.slideIndex = i;
    }
  }

  onCarouselTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0].clientX;
  }

  onCarouselTouchEnd(event: TouchEvent): void {
    const dx = event.changedTouches[0].clientX - this.touchStartX;
    const threshold = 48;
    if (dx < -threshold) {
      this.nextSlide();
    } else if (dx > threshold) {
      this.prevSlide();
    }
  }
}
