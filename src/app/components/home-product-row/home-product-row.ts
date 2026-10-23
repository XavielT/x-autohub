import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogoCard } from '../../../shared/components/catalogo-card/catalogo-card';
import { ProductModel } from '../../../shared/models/product.model';

/**
 * Una fila de productos con su encabezado: es lo que dibujan Ofertas, Más
 * vendidos y Nuevos. Puramente presentacional; cada sección trae sus datos.
 *
 * `layout`:
 *   · `carousel` — una sola fila con scroll horizontal (Ofertas).
 *   · `grid` — las tarjetas se reparten en las filas que haga falta.
 *
 * El precio anterior y el porcentaje de descuento los dibuja la propia tarjeta.
 */
@Component({
  selector: 'app-home-product-row',
  imports: [CatalogoCard, RouterLink],
  templateUrl: './home-product-row.html',
  styleUrl: './home-product-row.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeProductRow {
  readonly eyebrow = input.required<string>();
  readonly title = input.required<string>();
  readonly linkLabel = input('Ver todo');
  readonly products = input.required<readonly ProductModel[]>();
  readonly layout = input<'carousel' | 'grid'>('grid');
  readonly alt = input(false);
}
