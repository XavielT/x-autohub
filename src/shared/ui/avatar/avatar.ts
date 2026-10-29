import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * La foto de una persona: la subida o uno de los avatares del sitio (`avatarUrl`), y si no hay,
 * la inicial de su nombre sobre fondo ámbar. Redonda; el tamaño sale de `size` (px).
 */
@Component({
  selector: 'app-avatar',
  template: `
    @if (avatarUrl()) {
      <img class="av__img" [src]="avatarUrl()" [alt]="alt()" width="512" height="512" loading="lazy" />
    } @else {
      <span class="av__initial" aria-hidden="true">{{ initial() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 50%;
      background-color: var(--Hub);
      color: var(--main);
      font-family: var(--font-brand);
      font-weight: 700;
    }
    .av__img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .av__initial { line-height: 1; }
  `,
  host: {
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.45',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Avatar {
  readonly avatarUrl = input<string | null | undefined>(null);
  readonly name = input('');
  readonly size = input(40);
  /** Texto alternativo; vacío cuando el nombre ya está escrito al lado. */
  readonly alt = input('');

  readonly initial = computed(() => this.name().trim().charAt(0).toUpperCase() || 'X');
}
