import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, model, signal } from '@angular/core';
import { ToastService } from '../../services/toast.service';
import { Lightbox } from '../../ui/lightbox/lightbox';
import { compressImage, imageInputProblem } from '../../utils/image-compress';

/** Máximo de fotos por publicación. */
export const UPLOADER_MAX = 8;

/**
 * Cargador de fotos: arrastrar o elegir, comprime cada una (1600 px, JPEG 85 %), miniaturas con la
 * primera como portada, reordenar (arrastrando o con las flechas), quitar y verla en grande.
 * Las fotos ya comprimidas quedan en `[(files)]`, en el orden en que se van a subir.
 */
@Component({
  selector: 'app-image-uploader',
  imports: [Lightbox],
  templateUrl: './image-uploader.html',
  styleUrl: './image-uploader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageUploader {
  private readonly toast = inject(ToastService);

  readonly files = model<File[]>([]);
  readonly max = input(UPLOADER_MAX);
  readonly invalid = input(false);

  readonly isDragOver = signal(false);
  /** Fotos que se están comprimiendo ahora mismo. */
  readonly processing = signal(0);
  readonly lightboxOpen = signal(false);
  readonly lightboxIndex = signal(0);
  private dragFrom: number | null = null;

  private readonly urls = new Map<File, string>();
  readonly previews = computed(() => this.files().map((file) => this.urlFor(file)));
  readonly isFull = computed(() => this.files().length >= this.max());

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const url of this.urls.values()) this.revoke(url);
      this.urls.clear();
    });
  }

  onPick(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.files?.length) void this.add(Array.from(target.files));
    target.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    // Mover una miniatura no es soltar archivos.
    if (this.dragFrom === null) this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
    const dropped = event.dataTransfer?.files;
    if (dropped?.length) void this.add(Array.from(dropped));
  }

  async add(incoming: File[]): Promise<void> {
    const room = this.max() - this.files().length;
    if (room <= 0) {
      this.toast.show(`Máximo ${this.max()} fotos por publicación.`, 'error');
      return;
    }

    const accepted: File[] = [];
    for (const file of incoming) {
      const problem = imageInputProblem(file);
      if (problem) this.toast.show(problem, 'error');
      else accepted.push(file);
    }
    if (accepted.length > room) {
      this.toast.show(`Máximo ${this.max()} fotos: se agregaron solo ${room}.`, 'error');
    }

    const batch = accepted.slice(0, room);
    if (batch.length === 0) return;
    this.processing.update((n) => n + batch.length);
    // `Promise.all` conserva el orden en que se eligieron.
    const done = await Promise.all(batch.map((file) => compressImage(file)));
    this.processing.update((n) => n - batch.length);
    this.files.update((current) => [...current, ...done].slice(0, this.max()));
  }

  remove(index: number): void {
    const gone = this.files()[index];
    this.files.update((current) => current.filter((_, i) => i !== index));
    const url = gone && this.urls.get(gone);
    if (url !== undefined) {
      this.revoke(url);
      this.urls.delete(gone);
    }
  }

  move(index: number, delta: number): void {
    const to = index + delta;
    const current = this.files();
    if (to < 0 || to >= current.length) return;
    const next = [...current];
    [next[index], next[to]] = [next[to], next[index]];
    this.files.set(next);
  }

  onThumbDragStart(index: number): void {
    this.dragFrom = index;
  }

  onThumbDrop(event: DragEvent, to: number): void {
    event.preventDefault();
    event.stopPropagation();
    const from = this.dragFrom;
    this.dragFrom = null;
    if (from === null || from === to) return;
    const next = [...this.files()];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    this.files.set(next);
  }

  onThumbDragEnd(): void {
    this.dragFrom = null;
  }

  openLightbox(index: number): void {
    this.lightboxIndex.set(index);
    this.lightboxOpen.set(true);
  }

  private urlFor(file: File): string {
    let url = this.urls.get(file);
    if (url === undefined) {
      // jsdom no trae `createObjectURL`: sin vista previa, pero sin romper.
      url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
      this.urls.set(file, url);
    }
    return url;
  }

  private revoke(url: string): void {
    if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
  }
}
