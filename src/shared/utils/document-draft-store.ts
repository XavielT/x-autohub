import { DocumentDraft } from '../models/business-document.model';

/**
 * El borrador del editor de documentos que quedó sin guardar (se cerró la pestaña, se fue la luz…).
 * Vive solo en este navegador (`localStorage`): no toca la base. Un único borrador, el último.
 */
const KEY = 'x-autohub.documentDraft';

export interface StoredDocumentDraft {
  draft: DocumentDraft;
  /** Las secciones del editor, para reabrirlo igual. */
  titles: string[];
  savedAt: number;
}

export function saveDocumentDraft(draft: DocumentDraft, titles: readonly string[]): void {
  try {
    const value: StoredDocumentDraft = { draft, titles: [...titles], savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Sin storage (modo privado, cuota llena) simplemente no hay recuperación.
  }
}

export function clearDocumentDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nada que borrar.
  }
}

/** Lee el borrador guardado. Es texto de fuera (cualquiera puede editar `localStorage`): se valida lo mínimo. */
export function readDocumentDraft(): StoredDocumentDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredDocumentDraft> | null;
    const d = v?.draft as Partial<DocumentDraft> | undefined;
    if (!v || !d || typeof d !== 'object' || !Array.isArray(d.items) || typeof d.kind !== 'string') return null;
    return {
      draft: d as DocumentDraft,
      titles: Array.isArray(v.titles) ? v.titles.filter((t): t is string => typeof t === 'string') : [],
      savedAt: typeof v.savedAt === 'number' ? v.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}
