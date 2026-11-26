import { ChangeDetectionStrategy, Component, ElementRef, HostListener, effect, input, output, signal, viewChild } from '@angular/core';
import { Handle, Rect, dragRect, fitRect, outputSize } from '../../utils/image-edit';

/** Las proporciones que se ofrecen; `null` es recorte libre. */
export const RATIOS: ReadonlyArray<{ id: string; label: string; value: number | null }> = [
  { id: 'free', label: 'Libre', value: null },
  { id: '1', label: '1:1', value: 1 },
  { id: '4-3', label: '4:3', value: 4 / 3 },
  { id: '16-9', label: '16:9', value: 16 / 9 },
];

const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/**
 * Editor de fotos en una ventana: girar, voltear y recortar (libre o con proporción). Trabaja sobre
 * la foto que se le pasa (`src`: una URL o una `blob:`/`data:`) y devuelve un archivo nuevo en
 * `applied`; no sube nada. El resultado se achica a 1600px de lado largo, como el resto de las fotos.
 */
@Component({
  selector: 'app-image-editor',
  templateUrl: './image-editor.html',
  styleUrl: './image-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageEditor {
  readonly src = input.required<string>();
  /** Nombre del archivo que se devuelve. */
  readonly fileName = input('foto.jpg');
  readonly applied = output<File>();
  readonly closed = output<void>();

  readonly ratios = RATIOS;
  readonly handles = HANDLES;

  readonly ready = signal(false);
  readonly failed = signal(false);
  readonly view = signal({ w: 0, h: 0 });
  readonly crop = signal<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  readonly ratio = signal<number | null>(null);
  /** Cuartos de vuelta a la derecha (0 a 3) y si está volteada. */
  readonly turns = signal(0);
  readonly flipped = signal(false);
  /** Para repintar el lienzo cuando cambia la imagen base. */
  private readonly rev = signal(0);

  private readonly stage = viewChild<ElementRef<HTMLCanvasElement>>('stage');
  private original: HTMLImageElement | null = null;
  private base: HTMLCanvasElement | null = null;
  private drag: { handle: Handle; x: number; y: number; start: Rect } | null = null;

  constructor() {
    effect(() => {
      const url = this.src();
      void this.load(url);
    });
    effect(() => {
      this.rev();
      const canvas = this.stage()?.nativeElement;
      if (canvas) this.paint(canvas);
    });
  }

  private async load(url: string): Promise<void> {
    this.ready.set(false);
    this.failed.set(false);
    try {
      // Las fotos ya subidas viven en otro origen: se bajan como archivo para poder dibujarlas y
      // volver a exportarlas (un lienzo "manchado" por otro origen no se puede leer).
      const source = url.startsWith('http') ? URL.createObjectURL(await (await fetch(url)).blob()) : url;
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('No se pudo leer la foto.'));
        img.src = source;
      });
      if (source !== url) URL.revokeObjectURL(source);
      this.original = img;
      this.rebuild();
      this.ready.set(true);
    } catch {
      this.failed.set(true);
    }
  }

  /** Vuelve a armar la imagen base (girada y volteada) y reinicia el recorte a toda la foto. */
  private rebuild(): void {
    const img = this.original;
    if (!img) return;
    const turns = this.turns();
    const sideways = turns % 2 === 1;
    const w = sideways ? img.naturalHeight : img.naturalWidth;
    const h = sideways ? img.naturalWidth : img.naturalHeight;
    const base = document.createElement('canvas');
    base.width = w;
    base.height = h;
    const ctx = base.getContext('2d');
    if (!ctx) return;
    ctx.translate(w / 2, h / 2);
    ctx.rotate((turns * Math.PI) / 2);
    if (this.flipped()) ctx.scale(-1, 1);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    this.base = base;

    const maxW = Math.min(typeof window === 'undefined' ? 720 : window.innerWidth - 56, 720);
    const maxH = Math.min(typeof window === 'undefined' ? 480 : window.innerHeight - 280, 520);
    const scale = Math.min(1, maxW / w, maxH / h);
    const view = { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
    this.view.set(view);
    this.crop.set(fitRect(view.w, view.h, this.ratio()));
    this.rev.update((n) => n + 1);
  }

  private paint(canvas: HTMLCanvasElement): void {
    const { w, h } = this.view();
    const ctx = canvas.getContext('2d');
    if (!ctx || !this.base || w === 0) return;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(this.base, 0, 0, w, h);
  }

  rotate(direction: 1 | -1): void {
    this.turns.update((t) => (t + direction + 4) % 4);
    this.rebuild();
  }

  flip(): void {
    this.flipped.update((f) => !f);
    this.rebuild();
  }

  setRatio(value: number | null): void {
    this.ratio.set(value);
    const { w, h } = this.view();
    this.crop.set(fitRect(w, h, value));
  }

  resetCrop(): void {
    this.setRatio(this.ratio());
  }

  // --- Arrastre ---------------------------------------------------------------

  down(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    const handle = (target.dataset['h'] as Handle | undefined) ?? 'move';
    this.drag = { handle, x: event.clientX, y: event.clientY, start: this.crop() };
    target.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  move(event: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const { w, h } = this.view();
    this.crop.set(dragRect(d.start, d.handle, event.clientX - d.x, event.clientY - d.y, w, h, this.ratio()));
  }

  up(): void {
    this.drag = null;
  }

  // --- Salida -----------------------------------------------------------------

  async apply(): Promise<void> {
    const base = this.base;
    if (!base) return;
    const { w } = this.view();
    const f = base.width / w;
    const c = this.crop();
    const size = outputSize(c.w * f, c.h * f);
    const out = document.createElement('canvas');
    out.width = size.width;
    out.height = size.height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(base, c.x * f, c.y * f, c.w * f, c.h * f, 0, 0, size.width, size.height);

    const png = /\.png$/i.test(this.fileName());
    const type = png ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, type, 0.9));
    if (!blob) {
      this.failed.set(true);
      return;
    }
    this.applied.emit(new File([blob], this.fileName(), { type }));
  }

  close(): void {
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
