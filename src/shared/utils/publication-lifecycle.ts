import { HubMarketItemModel } from '../models/hub-market-item.model';

/** Lo que dura una publicación antes de vencer. Es el mismo plazo de la migración 0030. */
export const PUBLICATION_DAYS = 60;

/** Desde cuántos días antes de vencer se le ofrece renovarla a su dueño. */
export const RENEW_WARNING_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Las dos fechas de una publicación. Es lo que devuelven marcarla vendida y renovarla. */
export type Lifecycle = Pick<HubMarketItemModel, 'soldAt' | 'expiresAt'>;

export const isSold = (item: Lifecycle): boolean => !!item.soldAt;

/** Una publicación sin fecha (el contenido sembrado) no vence. */
export const isExpired = (item: Lifecycle, now = new Date()): boolean =>
  !!item.expiresAt && new Date(item.expiresAt).getTime() <= now.getTime();

/** A la venta y dentro de plazo: lo único que sale en los listados, el sitemap y el HTML prerenderizado. */
export const isLive = (item: Lifecycle, now = new Date()): boolean => !isSold(item) && !isExpired(item, now);

/** Días enteros que le quedan (0 si vence hoy), o `null` si no tiene plazo. Negativo, ya venció. */
export function daysLeft(item: Lifecycle, now = new Date()): number | null {
  if (!item.expiresAt) return null;
  return Math.floor((new Date(item.expiresAt).getTime() - now.getTime()) / DAY_MS);
}

/** La fecha de vencimiento de una publicación que nace hoy (el modo simulado no tiene la base). */
export const newExpiry = (now = new Date()): string => new Date(now.getTime() + PUBLICATION_DAYS * DAY_MS).toISOString();
