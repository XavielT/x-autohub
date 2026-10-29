import { ChangeDetectionStrategy, Component, HostListener, computed, input, model } from '@angular/core';

/** Cuánto hay que arrastrar (px) para que cuente como deslizar. */
const SWIPE_MIN = 50;

/**
 * Visor de fotos a pantalla completa: fondo negro, la imagen centrada, flechas, contador
 * ("2 / 5"), Escape, x, tocar fuera y deslizar en el teléfono. Sin librerías.
 *
 * Es un visor suelto: lo abre quien lo usa con `[(open)]` y `[(index)]`. (`ImageGallery`, de la
 * ficha de producto, trae el suyo propio con miniaturas.)
 */
@Component({
  selector: 'app-lightbox',
  templateUrl: './lightbox.html',
  styleUrl: './lightbox.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Lightbox {
  readonly images = input.required<readonly string[]>();
  readonly alt = input('');
  readonly open = model(false);
  readonly index = model(0);

  readonly current = computed(() => this.images()[this.index()] ?? '');
  readonly count = computed(() => this.images().length);
  readonly hasMany = computed(() => this.count() > 1);

  private startX: number | null = null;

  close(): void {
    this.open.set(false);
  }

  step(delta: number): void {
    const n = this.count();
    if (n < 2) return;
    this.index.set((this.index() + delta + n) % n);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (!this.open()) return;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.step(-1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.step(1);
        break;
    }
  }

  onPointerDown(event: PointerEvent): void {
    this.startX = event.clientX;
  }

  onPointerUp(event: PointerEvent): void {
    if (this.startX === null) return;
    const dx = event.clientX - this.startX;
    this.startX = null;
    if (Math.abs(dx) >= SWIPE_MIN) this.step(dx < 0 ? 1 : -1);
  }
}
