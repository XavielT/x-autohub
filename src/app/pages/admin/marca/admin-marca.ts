import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { BrandedDestination, BrandedPhotosService } from '../../../../shared/services/branded-photos.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { PRESETS, badgeRect, fitEdge, outputName } from './badge-layout';

type Format = 'jpeg' | 'png';

interface Item {
  id: number;
  name: string;
  bitmap: ImageBitmap;
}

const LOGO_SRC = 'assets/imgs/autohub-logo.png';

/**
 * /admin/marca — le pone la insignia de X AutoHub a una foto y la deja lista para descargar.
 *
 * Todo ocurre en el navegador (canvas): la foto no se sube a ningún servidor ni se guarda.
 */
@Component({
  selector: 'app-admin-marca',
  templateUrl: './admin-marca.html',
  styleUrl: './admin-marca.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMarca {
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly handoff = inject(BrandedPhotosService);

  readonly presets = PRESETS;
  readonly items = signal<Item[]>([]);
  readonly selectedId = signal<number | null>(null);
  /** Posición de la insignia: fracción (0 a 1) del espacio libre. Arranca abajo a la derecha. */
  readonly fx = signal(1);
  readonly fy = signal(1);
  readonly sizePct = signal(14);
  readonly marginPct = signal(3);
  readonly opacityPct = signal(70);
  readonly backdrop = signal(false);
  readonly format = signal<Format>('jpeg');
  readonly busy = signal(false);

  readonly selected = computed(() => this.items().find((i) => i.id === this.selectedId()) ?? null);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('preview');

  private nextId = 1;
  private logo: Promise<HTMLImageElement> | null = null;

  constructor() {
    // La vista previa se vuelve a pintar cada vez que cambia la foto o un ajuste.
    effect(() => {
      const el = this.canvas()?.nativeElement;
      const item = this.selected();
      this.fx();
      this.fy();
      this.sizePct();
      this.marginPct();
      this.opacityPct();
      this.backdrop();
      this.format();
      if (el && item) void this.paint(el, item.bitmap).catch(() => this.toast.show('No se pudo dibujar la vista previa.'));
    });
  }

  private loadLogo(): Promise<HTMLImageElement> {
    this.logo ??= new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        this.logo = null;
        reject(new Error('No se pudo cargar el logo'));
      };
      img.src = LOGO_SRC;
    });
    return this.logo;
  }

  async onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const added: Item[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        this.toast.show(`«${file.name}» no es una imagen.`);
        continue;
      }
      try {
        added.push({ id: this.nextId++, name: file.name, bitmap: await createImageBitmap(file) });
      } catch {
        this.toast.show(`No pude leer «${file.name}».`);
      }
    }
    if (!added.length) return;
    this.items.update((list) => [...list, ...added]);
    if (this.selectedId() === null) this.selectedId.set(added[0].id);
  }

  select(id: number): void {
    this.selectedId.set(id);
  }

  remove(id: number): void {
    this.items().find((i) => i.id === id)?.bitmap.close();
    const rest = this.items().filter((i) => i.id !== id);
    this.items.set(rest);
    if (this.selectedId() === id) this.selectedId.set(rest[0]?.id ?? null);
  }

  /** El preset que coincide con la posición actual (null si se arrastró a otro lado). */
  readonly activePreset = computed(
    () => PRESETS.find((p) => Math.abs(p.fx - this.fx()) < 0.01 && Math.abs(p.fy - this.fy()) < 0.01)?.value ?? null,
  );

  applyPreset(fx: number, fy: number): void {
    this.fx.set(fx);
    this.fy.set(fy);
  }

  private drag: { x: number; y: number; fx: number; fy: number } | null = null;

  dragStart(e: PointerEvent): void {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.drag = { x: e.clientX, y: e.clientY, fx: this.fx(), fy: this.fy() };
  }

  dragMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const canvas = e.currentTarget as HTMLCanvasElement;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const scale = canvas.width / box.width; // píxeles de la imagen por píxel de pantalla
    const r = badgeRect(canvas.width, canvas.height, this.sizePct(), this.marginPct(), 0, 0);
    const m = r.x; // con fx = 0 la insignia queda en el margen
    const freeW = Math.max(1, canvas.width - r.w - 2 * m);
    const freeH = Math.max(1, canvas.height - r.h - 2 * m);
    const k = (n: number) => Math.min(1, Math.max(0, n));
    this.fx.set(k(d.fx + ((e.clientX - d.x) * scale) / freeW));
    this.fy.set(k(d.fy + ((e.clientY - d.y) * scale) / freeH));
  }

  dragEnd(): void {
    this.drag = null;
  }
  setSize(e: Event): void {
    this.sizePct.set(Number((e.target as HTMLInputElement).value));
  }
  setMargin(e: Event): void {
    this.marginPct.set(Number((e.target as HTMLInputElement).value));
  }
  setOpacity(e: Event): void {
    this.opacityPct.set(Number((e.target as HTMLInputElement).value));
  }
  setBackdrop(e: Event): void {
    this.backdrop.set((e.target as HTMLInputElement).checked);
  }
  setFormat(e: Event): void {
    this.format.set((e.target as HTMLSelectElement).value as Format);
  }

  /** Dibuja la foto con la insignia sobre `canvas`, a tamaño completo (con tope). */
  private async paint(canvas: HTMLCanvasElement, bitmap: ImageBitmap): Promise<void> {
    const logo = await this.loadLogo();
    const { width, height } = fitEdge(bitmap.width, bitmap.height);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Sin canvas 2D');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const r = badgeRect(width, height, this.sizePct(), this.marginPct(), this.fx(), this.fy());
    if (this.backdrop()) {
      const pad = Math.round(r.h * 0.22);
      ctx.fillStyle = 'rgba(18, 18, 18, 0.82)';
      ctx.beginPath();
      ctx.roundRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, Math.round(r.h * 0.3));
      ctx.fill();
    }
    ctx.save();
    ctx.globalAlpha = this.opacityPct() / 100;
    if (!this.backdrop()) {
      // Sombra suave: el blanco de «X AUTO» se sigue leyendo sobre cielos o paredes claras.
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = Math.round(r.h * 0.12);
    }
    ctx.drawImage(logo, r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  /** La foto con la insignia, ya codificada. */
  private async render(item: Item, png: boolean): Promise<Blob> {
    const canvas = document.createElement('canvas');
    await this.paint(canvas, item.bitmap);
    const blob = await new Promise<Blob | null>((ok) =>
      canvas.toBlob(ok, png ? 'image/png' : 'image/jpeg', 0.9),
    );
    if (!blob) throw new Error('toBlob vacío');
    return blob;
  }

  /**
   * Manda todas las fotos cargadas, con la insignia, al formulario de alta de inventario.
   * Siempre en JPG: el formulario rechaza archivos de más de 5 MB y un PNG de foto los pasa.
   */
  async useInListing(destination: BrandedDestination): Promise<void> {
    const items = this.items();
    if (!items.length) return;
    this.busy.set(true);
    try {
      const files: File[] = [];
      for (const item of items) {
        const blob = await this.render(item, false);
        files.push(new File([blob], `${outputName(item.name)}.jpg`, { type: 'image/jpeg' }));
      }
      this.handoff.offer({ destination, files });
      await this.router.navigate(['/admin/inventario']);
    } catch {
      this.toast.show('No se pudieron preparar las fotos.');
    } finally {
      this.busy.set(false);
    }
  }

  async download(item: Item): Promise<void> {
    this.busy.set(true);
    try {
      const png = this.format() === 'png';
      const blob = await this.render(item, png);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${outputName(item.name)}.${png ? 'png' : 'jpg'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      this.toast.show('No se pudo generar la imagen.');
    } finally {
      this.busy.set(false);
    }
  }

  async downloadAll(): Promise<void> {
    for (const item of this.items()) {
      await this.download(item);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}
