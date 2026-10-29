import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HomeProductRow } from '../home-product-row/home-product-row';
import { ProductService } from '../../../shared/services/product.service';

/** Ofertas: productos con precio anterior, en un carrusel. Sin ofertas, no hay sección. */
@Component({
  selector: 'app-home-offers',
  imports: [HomeProductRow, Skeleton],
  templateUrl: './home-offers.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeOffers {
  readonly products = toSignal(inject(ProductService).getOffers(12));
}
