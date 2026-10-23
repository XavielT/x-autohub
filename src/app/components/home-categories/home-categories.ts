import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CategoryService } from '../../../shared/services/category.service';

/**
 * Las categorías de primer nivel como chips, con scroll horizontal en el
 * teléfono. Si no hay categorías (la base todavía no las tiene) la sección se
 * oculta sola.
 *
 * El icono es la inicial de la categoría en un círculo: hoy no hay assets de
 * iconos de categoría y no se referencia uno que no existe (TODO: iconografía).
 */
@Component({
  selector: 'app-home-categories',
  imports: [RouterLink],
  templateUrl: './home-categories.html',
  styleUrl: './home-categories.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeCategories {
  readonly categories = toSignal(inject(CategoryService).getTree(), { initialValue: [] });
}
