import { AiProductDraftRow } from '../../core/supabase/database.types';

/** Un borrador de producto leído por IA (migración 0051) tal como lo ve la pantalla de revisión. */
export type DraftStatus = AiProductDraftRow['status'];
export type Confidence = 'alta' | 'media' | 'baja';

export interface DraftField {
  value: unknown;
  confidence: Confidence;
  source: string;
}

/** Una compatibilidad propuesta, ya resuelta contra marcas y modelos reales EN EL SERVIDOR. */
export interface DraftFitment {
  make_id: number;
  model_id: number | null;
  year_from: number | null;
  year_to: number | null;
  printed: boolean;
  selected: boolean;
  /** Viene de conocimiento general, no de la caja: hay que verificarla. */
  verify: boolean;
}

export interface ProductDraft {
  id: string;
  status: DraftStatus;
  sourceKind: 'article' | 'list';
  sourcePaths: string[];
  batchId: string | null;
  hint: string | null;
  fields: Record<string, DraftField>;
  unmatched: { text: string; printed: boolean }[];
  duplicateOf: number | null;
  duplicateConfirmed: boolean;
  error: string | null;
  costUsd: number;
  createdAt: Date;
}

/** Lo que el admin revisó y quiere guardar. `editedFields` dice qué cambió respecto a lo que propuso la IA. */
export interface ApproveInput {
  name: string;
  brand: string;
  categoryId: number | null;
  partNumber: string;
  crossRefs: string[];
  shortDescription: string;
  description: string;
  price: number;
  stock: number;
  specs: Record<string, string>;
  fitmentType: 'universal' | 'specific';
  fitments: { makeId: number; modelId: number | null; yearFrom: number | null; yearTo: number | null }[];
  aliases: string[];
  /** Índices de `sourcePaths` que se publican como fotos del producto, en orden (la primera es la portada). */
  photoIndices: number[];
  duplicateConfirmed: boolean;
  publish: boolean;
  editedFields: string[];
}

export interface FieldAccuracy {
  field: string;
  total: number;
  unchanged: number;
  pct: number;
}

export const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  brand: 'Marca',
  part_type: 'Tipo de pieza',
  part_number: 'Número de parte',
  cross_refs: 'Equivalencias',
  category_id: 'Categoría',
  short_description: 'Descripción corta',
  description: 'Descripción',
  specs: 'Especificaciones',
  aliases: 'Alias',
  fitment_type: 'Universal o por modelo',
  fitments: 'Compatibilidades',
  condition: 'Estado',
  weight_kg: 'Peso',
  dimensions: 'Medidas',
  price: 'Precio',
  stock: 'Cantidad',
  main_photo: 'Foto principal',
  photo_order: 'Orden de fotos',
  photo_alt: 'Texto alterno',
};
