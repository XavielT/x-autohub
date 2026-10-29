import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { SocialPostModel } from '../../models/social-hub.model';
import { AuthService } from '../../services/auth.service';
import { SocialHubService } from '../../services/social-hub.service';
import { StorageService } from '../../services/storage.service';
import { ToastService } from '../../services/toast.service';
import { compressImage } from '../../utils/image-compress';
import { SOCIAL_MEDIA_MAX, isImageFile, socialMediaProblem } from '../../utils/social-media';

const TEXT_MAX = 1000;

/** Los `#hashtags` del texto, sin el `#`, sin repetir y como mucho 8. */
export function extractTags(text: string): string[] {
  const found = text.match(/#([\p{L}\p{N}_]{2,30})/gu) ?? [];
  return [...new Set(found.map((t) => t.slice(1)))].slice(0, 8);
}

/**
 * Para publicar en el feed: texto (los `#hashtags` se vuelven etiquetas) y hasta 4 fotos o videos.
 * Las fotos se reducen en el navegador antes de subirse; el video se sube tal cual (hasta 25 MB).
 */
@Component({
  selector: 'app-post-composer',
  imports: [FormsModule],
  templateUrl: './post-composer.html',
  styleUrl: './post-composer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostComposer {
  private readonly auth = inject(AuthService);
  private readonly social = inject(SocialHubService);
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);

  readonly published = output<SocialPostModel>();

  readonly textMax = TEXT_MAX;
  readonly mediaMax = SOCIAL_MEDIA_MAX;
  readonly text = signal('');
  readonly files = signal<File[]>([]);
  readonly isPreparing = signal(false);
  readonly isPublishing = signal(false);

  private readonly urls = new Map<File, string>();
  readonly previews = computed(() =>
    this.files().map((file) => ({ file, isImage: isImageFile(file), url: this.urlFor(file) })),
  );
  readonly canPublish = computed(
    () => this.text().trim().length > 0 && !this.isPreparing() && !this.isPublishing(),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const url of this.urls.values()) if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
    });
  }

  async onPick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';

    const room = SOCIAL_MEDIA_MAX - this.files().length;
    if (picked.length > room) this.toast.show(`Máximo ${SOCIAL_MEDIA_MAX} archivos por publicación.`, 'error');

    const accepted: File[] = [];
    for (const file of picked.slice(0, Math.max(room, 0))) {
      const problem = socialMediaProblem(file);
      if (problem) this.toast.show(problem, 'error');
      else accepted.push(file);
    }
    if (accepted.length === 0) return;

    this.isPreparing.set(true);
    const ready = await Promise.all(accepted.map((file) => (isImageFile(file) ? compressImage(file) : file)));
    this.isPreparing.set(false);
    this.files.update((current) => [...current, ...ready]);
  }

  remove(index: number): void {
    this.files.update((current) => current.filter((_, i) => i !== index));
  }

  publish(): void {
    const user = this.auth.user();
    const text = this.text().trim();
    if (!user || !text || this.isPublishing()) return;

    this.isPublishing.set(true);
    this.storage
      .uploadSocialMedia(this.files(), user.id)
      .pipe(
        switchMap((media) => this.social.publishPost({ text, tags: extractTags(text), media }, user.id, user.displayName)),
      )
      .subscribe({
        next: (created) => {
          this.isPublishing.set(false);
          this.text.set('');
          this.files.set([]);
          this.published.emit(created);
          this.toast.show('Publicado en la comunidad.');
        },
        error: (e: Error) => {
          this.isPublishing.set(false);
          this.toast.show(e.message || 'No pudimos publicar. Intenta de nuevo.', 'error');
        },
      });
  }

  private urlFor(file: File): string {
    let url = this.urls.get(file);
    if (url === undefined) {
      url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
      this.urls.set(file, url);
    }
    return url;
  }
}
