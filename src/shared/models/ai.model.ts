/** Las funciones de IA del sitio. La clave es la misma de `ai_feature_<clave>` en `site_settings` (migración 0050). */
export type AiFeatureKey =
  | 'catalog_ingest'
  | 'proof_check'
  | 'moderation'
  | 'digest'
  | 'search'
  | 'quote_triage'
  | 'maintenance'
  | 'review_summary'
  | 'seo'
  | 'reply_draft'
  | 'address';

export interface AiFeatureInfo {
  key: AiFeatureKey;
  label: string;
  hint: string;
}

export const AI_FEATURES: readonly AiFeatureInfo[] = [
  { key: 'catalog_ingest', label: 'Catálogo asistido', hint: 'Lee las fotos de una pieza y llena la ficha para que la revises.' },
  { key: 'proof_check', label: 'Comprobantes de transferencia', hint: 'Compara el comprobante con el pedido. Solo anota: no confirma pagos.' },
  { key: 'moderation', label: 'Moderación asistida', hint: 'Sugiere el riesgo de publicaciones, comentarios y reseñas.' },
  { key: 'search', label: 'Búsqueda inteligente', hint: 'Entiende "faros Corolla 2015". Abierta a visitantes.' },
  { key: 'quote_triage', label: 'Cotizaciones del taller', hint: 'Resume el caso para el mecánico. Nunca da precios.' },
  { key: 'digest', label: 'Resumen diario', hint: 'Redacta "Hoy en el negocio" con números de la base.' },
  { key: 'review_summary', label: 'Resumen de reseñas', hint: 'Solo con reseñas verificadas.' },
  { key: 'seo', label: 'SEO de fichas', hint: 'Título, descripción y texto alterno, solo en campos vacíos.' },
  { key: 'maintenance', label: 'Guía de mantenimiento', hint: 'Intervalos generales por marca, modelo y año.' },
  { key: 'reply_draft', label: 'Borradores de WhatsApp', hint: 'Redacta; tú envías.' },
  { key: 'address', label: 'Direcciones informales', hint: 'Normaliza direcciones dominicanas en el checkout.' },
];

export type AiTier = 'ok' | 'aviso' | 'sin_publico' | 'apagado';

export interface AiBudget {
  spentUsd: number;
  capUsd: number;
  pct: number;
  tier: AiTier;
}

/** Lo que enseña /admin/ajustes → Inteligencia artificial. */
export interface AiOverview {
  budget: AiBudget & { publicSpentUsd: number; publicOk: boolean };
  maps: AiBudget;
  byFeature: { feature: string; calls: number; errors: number; costUsd: number }[];
  byDay: { day: string; calls: number; costUsd: number }[];
  errors: { feature: string; errorCode: string; createdAt: string }[];
}

/** La respuesta de una Edge Function de IA. Un fallo nunca bloquea un flujo: el front sigue por su camino de siempre. */
export type AiOutcome<T> = { ok: true; data: T } | { ok: false; code: 'ia_no_disponible' };

export const AI_UNAVAILABLE = { ok: false, code: 'ia_no_disponible' } as const;

// --- Comprobantes de transferencia (migración 0052) ---------------------------------------------------

export type ProofVerdict = 'coincide' | 'revisar' | 'ilegible' | 'no_es_comprobante';

/** La última lectura de un comprobante. La IA solo anota: lo decide una persona. */
export interface ProofCheck {
  orderId: string;
  verdict: ProofVerdict;
  /** Qué no coincidió, en el vocabulario de `ai_proof_compare()` (monto_distinto, destino_distinto…). */
  flags: string[];
  reason: string | null;
  read: {
    amount: number | null;
    currency: string | null;
    originBank: string | null;
    destBank: string | null;
    destLast4: string | null;
    date: string | null;
    time: string | null;
  };
  referenceLast4: string | null;
  createdAt: Date;
}

/** Lo que X AutoHub esperaba recibir: el total del pedido y las cuentas (solo los últimos 4 dígitos). */
export interface ProofExpected {
  total: number;
  accounts: { bank: string; last4: string }[];
}

export const PROOF_VERDICT_LABELS: Record<ProofVerdict, string> = {
  coincide: 'Coincide',
  revisar: 'Revisar',
  ilegible: 'Ilegible',
  no_es_comprobante: 'No parece un comprobante',
};

export const PROOF_FLAG_LABELS: Record<string, string> = {
  monto_distinto: 'El monto no es el del pedido',
  monto_ilegible: 'No se leyó el monto',
  moneda_distinta: 'La moneda no es pesos dominicanos',
  destino_distinto: 'La cuenta de destino no es de X AutoHub',
  destino_ilegible: 'No se leyó la cuenta de destino',
  fecha_anterior_al_pedido: 'La fecha es anterior al pedido',
  fecha_futura: 'La fecha es futura',
  fecha_ilegible: 'No se leyó la fecha',
  referencia_ausente: 'No se leyó la referencia',
  referencia_repetida: 'La referencia ya se usó en otro pedido',
  parece_editada: 'La imagen muestra señales de edición',
};
