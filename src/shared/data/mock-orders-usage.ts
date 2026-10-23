import { CouponUsage } from '../utils/coupon-rules';

/** Dónde guarda el modo simulado sus pedidos (lo escribe `OrderService`). */
export const MOCK_ORDERS_STORAGE_KEY = 'x-autohub.mock-orders';

/** Lo mínimo de un pedido simulado que importa para contar usos de un cupón. */
interface StoredOrder {
  userId?: string | null;
  email?: string;
  view?: { couponCode?: string | null; status?: string };
}

/** Los pedidos simulados guardados, sin revivir fechas: aquí solo se cuentan. */
function readStoredOrders(): StoredOrder[] {
  try {
    const raw = localStorage.getItem(MOCK_ORDERS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as StoredOrder[]) : [];
  } catch {
    return [];
  }
}

/**
 * Cuántas veces se usó un cupón en el modo simulado: igual que `coupon_check()`, los
 * pedidos con ese cupón que **no** están cancelados, y de ellos los de esta persona (su
 * cuenta o su correo). Vive aparte para que `CouponService` pueda contar sin importar
 * `OrderService` (que a su vez usa a `CouponService`).
 */
export function mockCouponUsage(code: string, userId: string | null, email: string | null): CouponUsage {
  const used = readStoredOrders().filter(
    (o) => o.view?.couponCode === code && o.view?.status !== 'cancelled',
  );
  const wantedEmail = (email ?? '').trim().toLowerCase();

  return {
    total: used.length,
    byCustomer: used.filter(
      (o) =>
        (userId !== null && o.userId === userId) ||
        (wantedEmail !== '' && (o.email ?? '').trim().toLowerCase() === wantedEmail),
    ).length,
  };
}
