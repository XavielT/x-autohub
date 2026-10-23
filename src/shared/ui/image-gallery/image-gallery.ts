import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';

/**
 * Galería de imágenes con miniaturas y zoom al tocar.
 *
 * Es la primera de las galerías que no se copia: cada página de detalle de Hub
 * Market y Auto Hub todavía trae su propio carrusel (ver ROADMAP, "Unificar las
 * páginas de detalle"). Esta nace para la ficha de producto y es la que esas
 * páginas van a usar cuando se unifiquen.
 *
 * Tocar la imagen la abre a pantalla completa; ahí las flechas del teclado
 * recorren las fotos y Escape cierra.
 */
@Component({
  selector: 'app-image-gallery',
  templateUrl: './image-gallery.html',
  styleUrl: './image-gallery.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'closeZoom()',
    '(document:keydown.arrowleft)': 'onArrow(-1)',
    '(document:keydown.arrowright)': 'onArrow(1)',
  },
})
export class ImageGallery {
  readonly images = input.required<readonly string[]>();
  readonly alt = input('');
  /**
   * Una foto a la que saltar (la de la opción elegida). Si no está entre las de la galería, o es
   * nula, no hace nada: la galería se queda donde estaba.
   */
  readonly focus = input<string | null>(null);

  readonly index = signal(0);
  readonly isZoomed = signal(false);

  readonly current = computed(() => this.images()[this.index()] ?? '');
  readonly hasMany = computed(() => this.images().length > 1);

  constructor() {
    // Si cambian las fotos (otra pieza en la misma página), se vuelve a la primera.
    effect(() => {
      this.images();
      untracked(() => {
        this.index.set(0);
        this.isZoomed.set(false);
      });
    });
  }

  // Va aparte del efecto de arriba: cambiar de opción no es cambiar de producto, y no debe volver a la primera.
  private readonly focusEffect = effect(() => {
    const target = this.focus();
    const images = this.images();
    if (!target) return;
    const found = images.indexOf(target);
    if (found >= 0) untracked(() => this.index.set(found));
  });

  select(index: number): void {
    if (index >= 0 && index < this.images().length) this.index.set(index);
  }

  step(direction: -1 | 1): void {
    const total = this.images().length;
    if (total <= 1) return;
    this.index.update((i) => (i + direction + total) % total);
  }

  openZoom(): void {
    if (this.current()) this.isZoomed.set(true);
  }

  closeZoom(): void {
    if (this.isZoomed()) this.isZoomed.set(false);
  }

  /** Las flechas del teclado solo mueven la galería mientras está a pantalla completa. */
  onArrow(direction: -1 | 1): void {
    if (this.isZoomed()) this.step(direction);
  }
}
