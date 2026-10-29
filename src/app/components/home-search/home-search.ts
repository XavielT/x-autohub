import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SearchBox } from '../../../shared/components/search-box/search-box';

/**
 * Lo primero que se ve en el home: el buscador grande sobre el video del Citroën C3
 * (el mismo asset de `home-welcome`, no el mismo componente), con una línea que dice
 * para qué es el sitio.
 *
 * El video **no se descarga** en teléfonos (hasta 768px) ni con
 * `prefers-reduced-motion`, ni al prerenderizar: ahí queda solo el póster, que es
 * un fondo CSS y por eso siempre está.
 */
@Component({
  selector: 'app-home-search',
  imports: [SearchBox],
  templateUrl: './home-search.html',
  styleUrl: './home-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeSearch {
  readonly showVideo = isPlatformBrowser(inject(PLATFORM_ID)) && wantsVideo();
}

function wantsVideo(): boolean {
  if (typeof matchMedia !== 'function') return false;
  return !matchMedia('(max-width: 768px)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}
