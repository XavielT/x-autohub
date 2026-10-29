import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HomeProductRow } from '../home-product-row/home-product-row';
import { ProductService } from '../../../shared/services/product.service';

/** Más vendidos, por `sold_count`. Sin ventas registradas, no hay sección. */
@Component({
  selector: 'app-home-bestsellers',
  imports: [HomeProductRow, Skeleton],
  templateUrl: './home-bestsellers.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeBestsellers {
  readonly products = toSignal(inject(ProductService).getBestSellers(4));
}
