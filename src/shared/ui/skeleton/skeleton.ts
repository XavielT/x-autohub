import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Las formas de contenido que se pueden esperar. Cada una repite la silueta de lo que va a aparecer. */
export type SkeletonVariant =
  | 'product-card'
  | 'vehicle-card'
  | 'service-card'
  | 'row'
  | 'detail'
  | 'profile-header'
  | 'post';

/**
 * Esqueleto de carga: bloques grises con un brillo sutil (sin animación con
 * `prefers-reduced-motion`). Regla del sitio: nunca una pantalla vacía que de golpe se llena;
 * mientras llegan los datos se pinta la silueta del contenido, con las mismas medidas.
 *
 * `count` repite la forma (una grilla de tarjetas). Va con `role="status"` y un texto solo
 * para lectores de pantalla.
 */
@Component({
  selector: 'app-skeleton',
  templateUrl: './skeleton.html',
  styleUrl: './skeleton.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"sk sk--" + variant()', role: 'status', 'aria-busy': 'true' },
})
export class Skeleton {
  readonly variant = input<SkeletonVariant>('row');
  readonly count = input(1);
  /** Lo que lee un lector de pantalla mientras carga. */
  readonly label = input('Cargando…');

  readonly items = computed(() => Array.from({ length: Math.max(1, this.count()) }, (_, i) => i));
}
