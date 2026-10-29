import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HomeProductRow } from '../home-product-row/home-product-row';
import { ProductService } from '../../../shared/services/product.service';

/** Nuevos: lo último que entró al catálogo. Catálogo vacío, no hay sección. */
@Component({
  selector: 'app-home-new-arrivals',
  imports: [HomeProductRow, Skeleton],
  templateUrl: './home-new-arrivals.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeNewArrivals {
  readonly products = toSignal(inject(ProductService).getNewArrivals(4));
}
