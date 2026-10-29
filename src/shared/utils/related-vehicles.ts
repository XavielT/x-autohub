/** Lo mínimo que hace falta de un vehículo para decir si se parece a otro. */
export interface Comparable {
  id: number;
  price: number;
  brand?: string | null;
  /** Carrocería (`sedan`, `suv`…). Hub Market no la trae: ahí solo cuenta la marca. */
  body?: string | null;
}

/** Cuánto puede variar el precio entre un vehículo y uno "relacionado". */
export const PRICE_TOLERANCE = 0.3;
export const RELATED_MAX = 6;

const same = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Vehículos relacionados: la misma marca o la misma carrocería, con un precio dentro de ±30 %,
 * sin el actual y como máximo 6. Los más cercanos en precio primero. Sin ninguno, `[]` (la
 * sección se oculta).
 */
export function relatedVehicles<T extends Comparable>(current: Comparable, all: readonly T[], max = RELATED_MAX): T[] {
  const low = current.price * (1 - PRICE_TOLERANCE);
  const high = current.price * (1 + PRICE_TOLERANCE);
  return all
    .filter((v) => v.id !== current.id)
    .filter((v) => same(v.brand, current.brand) || same(v.body, current.body))
    .filter((v) => v.price >= low && v.price <= high)
    .sort((a, b) => Math.abs(a.price - current.price) - Math.abs(b.price - current.price))
    .slice(0, max);
}
