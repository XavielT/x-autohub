import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { Icon, IconName } from '../icon/icon';

/**
 * La miniatura que acompaña a un renglón de una lista del panel, para reconocer el artículo de un vistazo.
 *
 * Tres niveles, del más al menos específico:
 *   1. `src`: la foto del artículo. Si no existe o no carga, pasa al siguiente.
 *   2. `mask`: un SVG de los del sitio (los de `assets/icons/categories`, que son de trazo `currentColor` y
 *      por eso se pintan como máscara, no como imagen: de otro modo saldrían negros sobre el fondo oscuro).
 *   3. `icon`: un icono genérico del tipo de cosa que es.
 *
 * Es decorativa (`alt` vacío): el nombre del artículo va escrito al lado.
 */
@Component({
  selector: 'app-thumb',
  imports: [Icon],
  templateUrl: './thumb.html',
  styleUrl: './thumb.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.width.px]': 'size()', '[style.height.px]': 'size()' },
})
export class Thumb {
  /** Foto del artículo. Vacío o nulo = sin foto. */
  readonly src = input<string | null | undefined>(null);
  /** SVG del sitio (ruta de `assets/...`) que se pinta como máscara cuando no hay foto. */
  readonly mask = input<string | null | undefined>(null);
  readonly icon = input<IconName>('package');
  readonly size = input(48);

  /** La foto que ya falló, para no volver a intentarla (y volver a intentar si `src` cambia). */
  private readonly failed = signal<string | null>(null);

  protected readonly photo = computed(() => {
    const src = this.src();
    return src && src !== this.failed() ? src : null;
  });

  protected readonly maskVar = computed(() => (this.mask() ? `url(${this.mask()})` : null));
  protected readonly iconSize = computed(() => Math.round(this.size() * 0.5));

  protected onError(): void {
    this.failed.set(this.src() ?? null);
  }
}
