import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
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
 * Con `showDeal`, debajo de cada tarjeta va el precio anterior y el porcentaje
 * de descuento. Es provisional: en la fase 3 la propia tarjeta de producto lo
 * dibuja, y esto desaparece.
 */
@Component({
  selector: 'app-home-product-row',
  imports: [CatalogoCard, RouterLink, DecimalPipe],
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
  readonly showDeal = input(false);
  readonly alt = input(false);

  /** Porcentaje de descuento, redondeado; 0 si no hay oferta. */
  discount(product: ProductModel): number {
    const before = product.compareAtPrice;
    if (before === null || before <= product.price) return 0;
    return Math.round(((before - product.price) / before) * 100);
  }
}
