import { OrderStatus } from '../../core/supabase/database.types';

/**
 * Resumen de un pedido, como lo ve su dueño en su perfil.
 *
 * Es una vista reducida a propósito: la actividad del perfil solo lista fecha,
 * cantidad de artículos, total y estado. El detalle completo con las líneas vive
 * en el panel de administración (`AdminOrderModel`), que es quien lo gestiona.
 */
export interface UserOrderModel {
  id: string;
  createdAt: Date;
  /** Suma de las cantidades, no el número de líneas. */
  itemCount: number;
  total: number;
  status: OrderStatus;
}

/** Etiqueta en español de cada estado, para mostrarla sin repetir el mapa. */
export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};
