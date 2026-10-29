import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import {
  EMPTY_REVIEW_STATS,
  REVIEWS_PAGE_SIZE,
  REVIEW_COMMENT_MAX,
  ReviewModel,
  ReviewStats,
  ReviewTarget,
} from '../../models/review.model';
import { AuthService } from '../../services/auth.service';
import { ReviewService, validateReview } from '../../services/review.service';
import { ToastService } from '../../services/toast.service';

import { Skeleton } from '../../ui/skeleton/skeleton';
/**
 * El bloque de reseñas de una ficha (producto o servicio): promedio, distribución
 * 5→1, la lista (las de compra verificada primero) y el formulario.
 *
 * - **Sin sesión** se puede leer todo; escribir pide iniciar sesión.
 * - **Sin compra verificada también se puede reseñar**, pero sin la etiqueta. La
 *   etiqueta la pone la base de datos; aquí solo se explica cómo se consigue.
 * - **Una reseña por persona y objetivo.** Si ya escribió la suya, el formulario queda
 *   cerrado con la explicación y un botón para borrarla y escribir otra (no hay edición).
 * - Borra el autor, o un admin (moderación).
 */
@Component({
  selector: 'app-reviews',
  imports: [Skeleton, DatePipe, DecimalPipe, RouterLink],
  templateUrl: './reviews.html',
  styleUrl: './reviews.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Reviews {
  private readonly reviews = inject(ReviewService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  readonly target = input.required<ReviewTarget>();
  readonly targetId = input.required<number>();

  /** Avisa cada vez que se cargan las estadísticas: la ficha las usa para el JSON-LD. */
  readonly statsChange = output<ReviewStats>();

  readonly commentMax = REVIEW_COMMENT_MAX;
  readonly stars = [1, 2, 3, 4, 5] as const;
  readonly distributionRows = [5, 4, 3, 2, 1] as const;

  readonly stats = signal<ReviewStats>(EMPTY_REVIEW_STATS);
  readonly list = signal<ReviewModel[]>([]);
  readonly mine = signal<ReviewModel | null>(null);
  readonly isLoading = signal(true);
  readonly hasError = signal(false);
  readonly isLoadingMore = signal(false);

  readonly rating = signal(0);
  readonly comment = signal('');
  readonly isSending = signal(false);
  readonly formError = signal('');
  readonly confirmingId = signal<number | null>(null);

  /** Cuántas reseñas quedan por cargar. */
  readonly remaining = computed(() => Math.max(0, this.stats().total - this.list().length));

  readonly loginLink = computed(() => ({ returnUrl: this.router.url }));

  /** Qué se necesita para que la reseña salga como compra verificada. */
  readonly verifiedHint = computed(() =>
    this.target() === 'product'
      ? 'Si ya recibiste este producto en un pedido con nosotros, tu reseña saldrá como compra verificada.'
      : 'Si ya hicimos este trabajo en una cita tuya, tu reseña saldrá como compra verificada.',
  );

  /** Para descartar la respuesta de una carga vieja si cambió el objetivo mientras tanto. */
  private loadId = 0;

  constructor() {
    effect(() => {
      const target = this.target();
      const id = this.targetId();
      untracked(() => this.load(target, id));
    });

    // Al entrar o salir de la sesión cambia lo que esta persona puede hacer.
    effect(() => {
      this.auth.user();
      untracked(() => this.loadMine());
    });
  }

  starsText(rating: number): string {
    const full = Math.round(rating);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  percent(star: 1 | 2 | 3 | 4 | 5): number {
    const { total, distribution } = this.stats();
    return total === 0 ? 0 : Math.round((distribution[star] / total) * 100);
  }

  canDelete(review: ReviewModel): boolean {
    return review.userId === this.auth.user()?.id || this.auth.isAdmin();
  }

  private load(target: ReviewTarget, id: number): void {
    const run = ++this.loadId;
    this.isLoading.set(true);
    this.hasError.set(false);

    forkJoin({ stats: this.reviews.getStats(target, id), list: this.reviews.getReviews(target, id) }).subscribe({
      next: ({ stats, list }) => {
        if (run !== this.loadId) return;
        this.stats.set(stats);
        this.list.set(list);
        this.isLoading.set(false);
        this.statsChange.emit(stats);
      },
      error: () => {
        if (run !== this.loadId) return;
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });

    this.loadMine();
  }

  private loadMine(): void {
    const target = this.target();
    const id = this.targetId();
    this.reviews.getMine(target, id).subscribe({
      next: (review) => {
        // Si cambió el objetivo mientras llegaba la respuesta, no es de esta ficha.
        if (target === this.target() && id === this.targetId()) this.mine.set(review);
      },
      error: () => this.mine.set(null),
    });
  }

  loadMore(): void {
    if (this.isLoadingMore() || this.remaining() === 0) return;

    this.isLoadingMore.set(true);
    this.reviews.getReviews(this.target(), this.targetId(), this.list().length, REVIEWS_PAGE_SIZE).subscribe({
      next: (more) => {
        this.list.update((current) => [...current, ...more.filter((m) => !current.some((c) => c.id === m.id))]);
        this.isLoadingMore.set(false);
      },
      error: (error: Error) => {
        this.isLoadingMore.set(false);
        this.toast.show(error.message, 'error');
      },
    });
  }

  setRating(value: number): void {
    this.rating.set(value);
    // El aviso de "elige estrellas" ya no aplica: no se queda pegado hasta el próximo envío.
    this.formError.set('');
  }

  setComment(event: Event): void {
    this.comment.set((event.target as HTMLTextAreaElement).value);
    this.formError.set('');
  }

  submit(): void {
    if (this.isSending() || this.mine()) return;

    const invalid = validateReview(this.rating(), this.comment());
    if (invalid) {
      this.formError.set(invalid);
      return;
    }

    this.formError.set('');
    this.isSending.set(true);
    this.reviews.create(this.target(), this.targetId(), this.rating(), this.comment()).subscribe({
      next: () => {
        this.isSending.set(false);
        this.rating.set(0);
        this.comment.set('');
        this.toast.show('¡Gracias! Tu reseña quedó publicada.');
        this.load(this.target(), this.targetId());
      },
      error: (error: Error) => {
        this.isSending.set(false);
        this.formError.set(error.message);
      },
    });
  }

  /** El primer toque pide confirmar; el segundo borra. */
  remove(review: ReviewModel): void {
    if (this.confirmingId() !== review.id) {
      this.confirmingId.set(review.id);
      return;
    }

    this.reviews.remove(review.id).subscribe({
      next: () => {
        this.confirmingId.set(null);
        this.toast.show('Reseña borrada.');
        this.load(this.target(), this.targetId());
      },
      error: (error: Error) => {
        this.confirmingId.set(null);
        this.toast.show(error.message, 'error');
      },
    });
  }
}
