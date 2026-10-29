import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SocialCommentModel, SocialPostModel } from '../../models/social-hub.model';
import { AuthService } from '../../services/auth.service';
import { SocialInteractionService } from '../../services/social-interaction.service';
import { ToastService } from '../../services/toast.service';
import { Avatar } from '../../ui/avatar/avatar';
import { Lightbox } from '../../ui/lightbox/lightbox';
import { Skeleton } from '../../ui/skeleton/skeleton';
import { mediaOf } from '../../utils/social-media';

/** "hace 3 días" en vez de una fecha absoluta, que lee mejor en un feed. */
export function relativeTime(isoDate: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(isoDate).getTime()) / 60_000);
  if (minutes < 1) return 'ahora mismo';
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} ${days === 1 ? 'día' : 'días'}`;

  const months = Math.floor(days / 30);
  return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
}

/**
 * Una publicación del feed: autor, texto, fotos y video, etiquetas, me gusta y comentarios.
 * Los comentarios se piden la primera vez que se abren, no con cada tarjeta del feed.
 */
@Component({
  selector: 'app-social-post',
  imports: [DecimalPipe, DatePipe, FormsModule, Avatar, Lightbox, Skeleton],
  templateUrl: './social-post.html',
  styleUrl: './social-post.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SocialPost {
  private readonly auth = inject(AuthService);
  private readonly interactions = inject(SocialInteractionService);
  private readonly toast = inject(ToastService);

  readonly post = input.required<SocialPostModel>();

  readonly isLoggedIn = this.auth.isLoggedIn;
  readonly media = computed(() => mediaOf(this.post()));
  readonly images = computed(() => this.media().filter((m) => m.type === 'image').map((m) => m.url));

  readonly liked = computed(() => this.interactions.liked().has(this.post().id));
  readonly likes = computed(() => {
    // Lee `liked()` para que el número se recalcule al tocar el corazón.
    this.interactions.liked();
    return this.interactions.likeCount(this.post().id, this.post().likes);
  });

  /** Comentarios agregados o borrados aquí desde que cargó el feed. */
  private readonly commentDelta = signal(0);
  readonly commentCount = computed(() => Math.max(0, this.post().comments + this.commentDelta()));

  readonly showComments = signal(false);
  readonly comments = signal<SocialCommentModel[]>([]);
  readonly isLoadingComments = signal(false);
  readonly commentsFailed = signal(false);
  readonly draft = signal('');
  readonly isSending = signal(false);

  readonly lightboxOpen = signal(false);
  readonly lightboxIndex = signal(0);

  readonly time = computed(() => relativeTime(this.post().createdAt));

  openImage(url: string): void {
    this.lightboxIndex.set(Math.max(0, this.images().indexOf(url)));
    this.lightboxOpen.set(true);
  }

  toggleLike(): void {
    this.interactions.toggleLike(this.post().id).subscribe();
  }

  toggleComments(): void {
    const open = !this.showComments();
    this.showComments.set(open);
    if (open && this.comments().length === 0 && !this.isLoadingComments()) this.loadComments();
  }

  loadComments(): void {
    this.isLoadingComments.set(true);
    this.commentsFailed.set(false);
    this.interactions.getComments(this.post().id).subscribe({
      next: (list) => {
        this.comments.set(list);
        // El número del servidor ya incluye estos: se parte de cero.
        this.commentDelta.set(0);
        this.isLoadingComments.set(false);
      },
      error: () => {
        this.commentsFailed.set(true);
        this.isLoadingComments.set(false);
      },
    });
  }

  send(): void {
    const text = this.draft().trim();
    if (!text || this.isSending()) return;

    this.isSending.set(true);
    this.interactions.addComment(this.post().id, text).subscribe({
      next: (created) => {
        this.comments.update((all) => [...all, created]);
        this.commentDelta.update((n) => n + 1);
        this.draft.set('');
        this.isSending.set(false);
      },
      error: (e: Error) => {
        this.isSending.set(false);
        this.toast.show(e.message || 'No pudimos publicar tu comentario.', 'error');
      },
    });
  }

  canDelete(comment: SocialCommentModel): boolean {
    return comment.authorId === this.auth.user()?.id || this.auth.isAdmin();
  }

  remove(comment: SocialCommentModel): void {
    this.interactions.deleteComment(comment).subscribe({
      next: () => {
        this.comments.update((all) => all.filter((c) => c.id !== comment.id));
        this.commentDelta.update((n) => n - 1);
      },
      error: (e: Error) => this.toast.show(e.message, 'error'),
    });
  }
}
