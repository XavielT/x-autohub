import { ProductFitmentModel, ProductModel, SelectedVehicle } from '../models/product.model';
import { fitsVehicle } from './product-search';

/**
 * Lo que la ficha le dice a quien se pregunta "¿le sirve a mi carro?".
 *
 *   · `universal` — sirve para cualquier vehículo.
 *   · `compatible` — hay vehículo elegido y un fitment lo cubre (el verde).
 *   · `incompatible` — hay vehículo elegido y ningún fitment lo cubre: no se dice
 *     "no sirve" (puede que sí y nadie lo cargó), se dice que no está declarado.
 *   · `list` — no hay vehículo elegido: se muestra la lista de lo que cubre.
 *   · `consult` — es específico y nadie cargó compatibilidad. Mejor "consultar"
 *     que mentir: nunca se muestra como compatible.
 */
export type Compatibility =
  | { kind: 'universal' }
  | { kind: 'compatible' }
  | { kind: 'incompatible' }
  | { kind: 'list' }
  | { kind: 'consult' };

export function compatibilityOf(
  product: ProductModel,
  fitments: readonly ProductFitmentModel[],
  vehicle: SelectedVehicle | null,
): Compatibility {
  if (product.fitmentType === 'universal') return { kind: 'universal' };

  const own = fitments.filter((f) => f.productId === product.id);
  if (own.length === 0) return { kind: 'consult' };
  if (vehicle === null) return { kind: 'list' };

  return fitsVehicle(product, own, vehicle) ? { kind: 'compatible' } : { kind: 'incompatible' };
}
