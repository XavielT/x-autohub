/**
 * El estado de la republicación del sitio (migraciones 0026 y 0027): si hay cambios del
 * catálogo que todavía no están en las páginas prerenderizadas.
 */
export interface SiteRebuildStatus {
  /** Desde cuándo hay cambios sin publicar (ISO). `null` = el sitio está al día. */
  pendingSince: string | null;
  /** Cuándo fue el último cambio anotado (ISO), o `null` si nunca hubo. */
  lastChangeAt: string | null;
  /** Cuándo se pidió el último despliegue (ISO), o `null` si nunca. */
  lastFiredAt: string | null;
  /** Cuántos despliegues ha pedido la base. */
  fireCount: number;
  /** El enlace del deploy hook está cargado en el Vault. Sin él nada se publica solo. */
  hookConfigured: boolean;
}

/**
 * Qué pasó al pedir "Publicar ahora": `requested` (se pidió), `too_soon` (ya se pidió hace
 * menos de un minuto) o `no_hook` (falta el enlace en el Vault).
 */
export type SiteRebuildResult = 'requested' | 'too_soon' | 'no_hook';
