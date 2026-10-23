import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SearchBox } from '../../../shared/components/search-box/search-box';

/**
 * Lo primero que se ve en el home: el buscador grande sobre fondo oscuro, con
 * una línea que dice para qué es el sitio. Nada de video ni de hero de pantalla
 * completa: el visitante tiene que saber qué hacer en el primer vistazo.
 */
@Component({
  selector: 'app-home-search',
  imports: [SearchBox],
  templateUrl: './home-search.html',
  styleUrl: './home-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeSearch {}
