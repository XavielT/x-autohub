import { OrderStatus } from '../../core/supabase/database.types';
import { OrderHistoryEntry } from '../models/order.model';
import {
  acceptsProof,
  canMoveTo,
  isFinalStatus,
  nextStatuses,
  orderWhatsAppLink,
  orderWhatsAppMessage,
  timelineFor,
} from './order-status';

const at = (iso: string): Date => new Date(iso);
const h = (to: OrderStatus, iso: string, note: string | null = null): OrderHistoryEntry => ({
  fromStatus: null,
  toStatus: to,
  note,
  createdAt: at(iso),
});

/**
 * Esta mitad espeja lo que `set_order_status()` hace cumplir en Postgres
 * (migración 0018). `verify-migrations.sh` fija la otra: si cambia una, cambia la
 * otra.
 */
describe('nextStatuses', () => {
  it('un envío sigue awaiting_payment → paid → preparing → shipped → delivered', () => {
    expect(nextStatuses('awaiting_payment', 'shipping')).toEqual(['paid', 'cancelled']);
    expect(nextStatuses('paid', 'shipping')).toEqual(['preparing', 'cancelled']);
    expect(nextStatuses('preparing', 'shipping')).toEqual(['shipped', 'cancelled']);
    expect(nextStatuses('shipped', 'shipping')).toEqual(['delivered']);
  });

  it('un retiro termina en ready_for_pickup, no en shipped', () => {
    expect(nextStatuses('preparing', 'pickup')).toEqual(['ready_for_pickup', 'cancelled']);
    expect(nextStatuses('ready_for_pickup', 'pickup')).toEqual(['delivered']);
  });

  it('no se salta ningún paso: de awaiting_payment no se va a shipped, ni de paid a shipped', () => {
    expect(canMoveTo('awaiting_payment', 'shipped', 'shipping')).toBe(false);
    expect(canMoveTo('awaiting_payment', 'preparing', 'shipping')).toBe(false);
    expect(canMoveTo('paid', 'shipped', 'shipping')).toBe(false);
    expect(canMoveTo('paid', 'delivered', 'shipping')).toBe(false);
  });

  it('no se va hacia atrás', () => {
    expect(canMoveTo('paid', 'awaiting_payment', 'shipping')).toBe(false);
    expect(canMoveTo('shipped', 'preparing', 'shipping')).toBe(false);
  });

  it('cancelar solo se puede antes de que la pieza salga', () => {
    for (const s of ['pending', 'awaiting_payment', 'paid', 'preparing'] as const) {
      expect(canMoveTo(s, 'cancelled', 'shipping'), s).toBe(true);
    }
    for (const s of ['shipped', 'ready_for_pickup', 'delivered', 'cancelled'] as const) {
      expect(canMoveTo(s, 'cancelled', 'shipping'), s).toBe(false);
    }
  });

  it('entregado y cancelado son finales', () => {
    expect(nextStatuses('delivered', 'shipping')).toEqual([]);
    expect(nextStatuses('cancelled', 'pickup')).toEqual([]);
    expect(isFinalStatus('delivered')).toBe(true);
    expect(isFinalStatus('cancelled')).toBe(true);
    expect(isFinalStatus('paid')).toBe(false);
  });

  it('un pedido anterior a la 0018 (pending) se puede mover', () => {
    expect(nextStatuses('pending', 'shipping')).toEqual(['awaiting_payment', 'paid', 'cancelled']);
  });
});

describe('timelineFor', () => {
  const states = (status: OrderStatus, fulfillment: 'shipping' | 'pickup' = 'shipping') =>
    timelineFor({ status, fulfillment, history: [] }).map((s) => `${s.status}:${s.state}`);

  it('esperando pago: el primer paso en curso y los demás por venir', () => {
    expect(states('awaiting_payment')).toEqual([
      'awaiting_payment:current',
      'paid:upcoming',
      'preparing:upcoming',
      'shipped:upcoming',
      'delivered:upcoming',
    ]);
  });

  it('cada estado marca los anteriores como hechos y él como en curso', () => {
    expect(states('paid')).toEqual([
      'awaiting_payment:done',
      'paid:current',
      'preparing:upcoming',
      'shipped:upcoming',
      'delivered:upcoming',
    ]);
    expect(states('preparing')[2]).toBe('preparing:current');
    expect(states('shipped')[3]).toBe('shipped:current');
  });

  it('entregado: todo hecho, nada en curso', () => {
    expect(states('delivered').every((s) => s.endsWith(':done'))).toBe(true);
  });

  it('un retiro usa ready_for_pickup en lugar de shipped', () => {
    expect(states('ready_for_pickup', 'pickup')).toEqual([
      'awaiting_payment:done',
      'paid:done',
      'preparing:done',
      'ready_for_pickup:current',
      'delivered:upcoming',
    ]);
    expect(states('paid', 'pickup')).not.toContain('shipped:upcoming');
  });

  it('un pedido viejo en pending se pinta como el primer paso', () => {
    expect(states('pending')[0]).toBe('awaiting_payment:current');
  });

  it('un cancelado muestra solo lo que recorrió, y "Cancelado" al final', () => {
    const t = timelineFor({
      status: 'cancelled',
      fulfillment: 'shipping',
      history: [h('awaiting_payment', '2026-10-01T10:00:00Z'), h('cancelled', '2026-10-01T11:00:00Z', 'No hizo el pago')],
    });

    expect(t.map((s) => `${s.status}:${s.state}`)).toEqual(['awaiting_payment:done', 'cancelled:cancelled']);
    expect(t[1].note).toBe('No hizo el pago');
  });

  it('un cancelado después de pagar conserva el pago como hecho', () => {
    const t = timelineFor({
      status: 'cancelled',
      fulfillment: 'shipping',
      history: [h('awaiting_payment', '2026-10-01T10:00:00Z'), h('paid', '2026-10-01T12:00:00Z'), h('cancelled', '2026-10-02T09:00:00Z')],
    });

    expect(t.map((s) => s.status)).toEqual(['awaiting_payment', 'paid', 'cancelled']);
  });

  it('cada paso trae su fecha y su nota del historial', () => {
    const t = timelineFor({
      status: 'shipped',
      fulfillment: 'shipping',
      history: [
        h('awaiting_payment', '2026-10-01T10:00:00Z'),
        h('paid', '2026-10-01T12:00:00Z', 'Transferencia verificada'),
        h('preparing', '2026-10-01T13:00:00Z'),
        h('shipped', '2026-10-02T09:00:00Z', 'Vimenpaq, guía 123'),
      ],
    });

    expect(t[1].at).toEqual(at('2026-10-01T12:00:00Z'));
    expect(t[1].note).toBe('Transferencia verificada');
    expect(t[3].note).toBe('Vimenpaq, guía 123');
    expect(t[4].at).toBeNull(); // entregado todavía no llegó
  });
});

describe('acceptsProof', () => {
  it('solo un pedido por transferencia y sin pagar', () => {
    expect(acceptsProof({ status: 'awaiting_payment', paymentMethodId: 'transfer' })).toBe(true);
    expect(acceptsProof({ status: 'pending', paymentMethodId: 'transfer' })).toBe(true);
    expect(acceptsProof({ status: 'paid', paymentMethodId: 'transfer' })).toBe(false);
    expect(acceptsProof({ status: 'awaiting_payment', paymentMethodId: 'whatsapp' })).toBe(false);
  });
});

describe('WhatsApp del pedido', () => {
  it('lleva el número de pedido y el monto', () => {
    const msg = orderWhatsAppMessage(1042, 12050);

    expect(msg).toContain('#1042');
    expect(msg).toMatch(/RD\$ 12[.,]050/);
    expect(msg).toContain('xautohubrd.com');
  });

  it('el enlace va al número de la tienda, con el texto codificado', () => {
    const link = orderWhatsAppLink(1042, 12050);

    expect(link).toContain('wa.me/18099539782');
    expect(link).toContain(encodeURIComponent('#1042'));
  });
});
