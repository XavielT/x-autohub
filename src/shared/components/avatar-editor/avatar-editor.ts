import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/storage.service';
import { ToastService } from '../../services/toast.service';
import { Avatar } from '../../ui/avatar/avatar';
import { SITE_AVATARS, cropRect, renderAvatar, siteAvatarUrl } from '../../utils/avatar';
import { imageInputProblem } from '../../utils/image-compress';

/** Lado (px) del recuadro donde se acomoda la foto. */
const VIEW = 240;

/**
 * Foto de perfil: subir una (se acomoda y recorta a un cuadrado de 512×512, JPEG) o elegir uno de
 * los 8 avatares del sitio. Guarda al instante, aparte del formulario del nombre.
 */
@Component({
  selector: 'app-avatar-editor',
  imports: [Avatar],
  templateUrl: './avatar-editor.html',
  styleUrl: './avatar-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarEditor {
  private readonly auth = inject(AuthService);
  private readonly storage = inject(StorageService);
  private readonly toast = inject(ToastService);

  readonly user = this.auth.user;
  readonly avatars = SITE_AVATARS.map((a) => ({ ...a, url: siteAvatarUrl(a.id) }));
  readonly view = VIEW;

  readonly isSaving = signal(false);
  /** La foto que se está acomodando, o null. */
  readonly file = signal<File | null>(null);
  readonly previewUrl = signal('');
  readonly natural = signal({ width: 1, height: 1 });
  readonly zoom = signal(1);
  private readonly center = signal({ x: 0, y: 0 });
  private drag: { x: number; y: number } | null = null;

  readonly rect = computed(() => {
    const { width, height } = this.natural();
    const { x, y } = this.center();
    return cropRect(width, height, this.zoom(), x, y);
  });

  /** Posición y tamaño de la foto dentro del recuadro, para que lo que se ve sea lo que se guarda. */
  readonly imgStyle = computed(() => {
    const { width, height } = this.natural();
    const r = this.rect();
    const scale = VIEW / r.size;
    return {
      width: `${width * scale}px`,
      height: `${height * scale}px`,
      left: `${-r.sx * scale}px`,
      top: `${-r.sy * scale}px`,
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.releasePreview());
  }

  async onPick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) return;

    const problem = imageInputProblem(picked);
    if (problem) {
      this.toast.show(problem, 'error');
      return;
    }

    try {
      const bitmap = await createImageBitmap(picked);
      const { width, height } = bitmap;
      bitmap.close?.();
      this.releasePreview();
      this.previewUrl.set(URL.createObjectURL(picked));
      this.natural.set({ width, height });
      this.center.set({ x: width / 2, y: height / 2 });
      this.zoom.set(1);
      this.file.set(picked);
    } catch {
      this.toast.show('No pudimos abrir esa imagen. Prueba con otra.', 'error');
    }
  }

  onZoom(event: Event): void {
    this.zoom.set(Number((event.target as HTMLInputElement).value));
  }

  onPointerDown(event: PointerEvent): void {
    this.drag = { x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.drag) return;
    const scale = VIEW / this.rect().size;
    const dx = (event.clientX - this.drag.x) / scale;
    const dy = (event.clientY - this.drag.y) / scale;
    this.drag = { x: event.clientX, y: event.clientY };
    const { width, height } = this.natural();
    const r = this.rect();
    // Arrastrar la foto hacia la derecha mueve el recorte hacia la izquierda.
    const next = cropRect(width, height, this.zoom(), r.sx + r.size / 2 - dx, r.sy + r.size / 2 - dy);
    this.center.set({ x: next.sx + next.size / 2, y: next.sy + next.size / 2 });
  }

  onPointerUp(): void {
    this.drag = null;
  }

  cancelCrop(): void {
    this.file.set(null);
    this.releasePreview();
  }

  async saveCrop(): Promise<void> {
    const file = this.file();
    const user = this.user();
    if (!file || !user) return;

    this.isSaving.set(true);
    try {
      const { x, y } = this.center();
      const avatar = await renderAvatar(file, this.zoom(), x, y);
      this.storage.uploadAvatar(avatar, user.id).subscribe({
        next: (url) => this.persist(url, 'Foto de perfil actualizada.', () => this.cancelCrop()),
        error: () => this.fail('No pudimos subir la foto. Intenta de nuevo.'),
      });
    } catch {
      this.fail('No pudimos preparar la foto. Prueba con otra.');
    }
  }

  chooseSite(url: string): void {
    this.persist(url, 'Avatar actualizado.');
  }

  remove(): void {
    this.persist(null, 'Quitamos tu foto.');
  }

  private persist(avatarUrl: string | null, message: string, done?: () => void): void {
    const user = this.user();
    if (!user) return;
    this.isSaving.set(true);
    this.auth
      .updateProfile({ displayName: user.displayName, phone: user.phone, location: user.location, avatarUrl })
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.toast.show(message);
          done?.();
        },
        error: (error: Error) => this.fail(error.message),
      });
  }

  private fail(message: string): void {
    this.isSaving.set(false);
    this.toast.show(message, 'error');
  }

  private releasePreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set('');
  }
}
