import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { BusinessDocumentRow } from '../../core/supabase/database.types';
import { translateDbError, unwrap } from '../../core/supabase/supabase-error';
import {
  BusinessDocument,
  DocumentDraft,
  DocumentKind,
  DocumentLine,
  DocumentStatus,
  LineKind,
  TemplateId,
  Verdict,
} from '../models/business-document.model';
import { computeTotals, documentCode, todayIso } from '../utils/document-totals';
import { newLineUid, validateDraft } from '../utils/document-templates';

/** Una sola cadena literal: ver `PRODUCT_COLUMNS` en `product.service.ts`. */
const DOCUMENT_COLUMNS =
  'id, kind, number, template, status, customer_name, customer_phone, customer_email, customer_rnc, vehicle, issue_date, valid_until, items, discount_type, discount_value, apply_itbis, itbis_rate, paid, notes, terms, source_id, subtotal, itbis, total, created_by, created_at, updated_at';

const MOCK_STORAGE_KEY = 'x-autohub.business-documents';

export function toBusinessDocument(row: BusinessDocumentRow): BusinessDocument {
  return {
    id: row.id,
    kind: row.kind,
    number: row.number,
    code: documentCode(row.kind, row.number),
    template: row.template as TemplateId,
    status: row.status as DocumentStatus,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    customerRnc: row.customer_rnc,
    vehicle: {
      text: row.vehicle?.text ?? '',
      plate: row.vehicle?.plate ?? '',
      mileage: row.vehicle?.mileage ?? '',
      vin: row.vehicle?.vin ?? '',
      verdict: (row.vehicle?.verdict ?? '') as Verdict,
    },
    issueDate: row.issue_date,
    validUntil: row.valid_until,
    items: (row.items ?? []).map((i) => ({
      uid: newLineUid(),
      section: i.section ?? '',
      kind: i.kind as LineKind,
      description: i.description,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
    })),
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    applyItbis: row.apply_itbis,
    itbisRate: Number(row.itbis_rate),
    paid: Number(row.paid),
    notes: row.notes,
    terms: row.terms,
    sourceId: row.source_id,
    subtotal: Number(row.subtotal),
    itbis: Number(row.itbis),
    total: Number(row.total),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/** Las líneas tal como se guardan: sin `uid` y sin las que quedaron vacías. */
const cleanItems = (items: readonly DocumentLine[]) =>
  items
    .filter((i) => i.description.trim())
    .map((i) => ({
      section: i.section.trim(),
      kind: i.kind,
      description: i.description.trim(),
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    }));

/**
 * Cotizaciones y facturas desde el panel (`/admin/documentos`).
 *
 * Solo un admin las lee y las escribe (RLS, migración 0063). El navegador **no** manda número ni
 * totales: el consecutivo y los montos los pone Postgres al guardar. En modo simulado viven en
 * `localStorage` (como los ajustes), para que guardar y recargar se comporte igual que con la base.
 */
@Injectable({ providedIn: 'root' })
export class BusinessDocumentService {
  private readonly supabase = inject(SupabaseService);

  /** Del más nuevo al más viejo. */
  list(): Observable<BusinessDocument[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.readMock().sort((a, b) => +b.createdAt - +a.createdAt));
    }

    return from(
      this.supabase.db.from('business_documents').select(DOCUMENT_COLUMNS).order('created_at', { ascending: false }),
    ).pipe(map((res) => unwrap(res).map(toBusinessDocument)));
  }

  /** Crea o actualiza (según `draft.id`). Devuelve el documento guardado, con su número y totales. */
  save(draft: DocumentDraft): Observable<BusinessDocument> {
    const invalid = validateDraft(draft);
    if (invalid) return throwError(() => new Error(invalid));

    const fields = {
      template: draft.template,
      status: draft.status,
      customer_name: draft.customerName.trim(),
      customer_phone: draft.customerPhone.trim(),
      customer_email: draft.customerEmail.trim(),
      customer_rnc: draft.customerRnc.trim(),
      vehicle: {
        text: draft.vehicle.text.trim(),
        plate: draft.vehicle.plate.trim(),
        mileage: draft.vehicle.mileage.trim(),
        vin: draft.vehicle.vin.trim(),
        verdict: draft.vehicle.verdict,
      },
      issue_date: draft.issueDate,
      valid_until: draft.kind === 'cotizacion' ? draft.validUntil || null : null,
      items: cleanItems(draft.items),
      discount_type: draft.discountType,
      discount_value: draft.discountValue,
      apply_itbis: draft.applyItbis,
      itbis_rate: draft.itbisRate,
      paid: draft.kind === 'factura' ? draft.paid : 0,
      notes: draft.notes.trim(),
      terms: draft.terms.trim(),
      source_id: draft.sourceId,
    };

    if (this.supabase.shouldUseMockData()) {
      const all = this.readMock();
      const previous = all.find((d) => d.id === draft.id);
      const number =
        previous?.number ?? Math.max(0, ...all.filter((d) => d.kind === draft.kind).map((d) => d.number)) + 1;
      const totals = computeTotals({ ...fields, discountType: draft.discountType, discountValue: draft.discountValue, applyItbis: draft.applyItbis, itbisRate: draft.itbisRate, items: fields.items });
      const now = new Date();
      const saved: BusinessDocument = {
        ...draft,
        id: previous?.id ?? `mock-${Date.now().toString(36)}`,
        kind: previous?.kind ?? draft.kind,
        number,
        code: documentCode(previous?.kind ?? draft.kind, number),
        customerName: fields.customer_name,
        items: fields.items.map((i) => ({ ...i, uid: newLineUid() })),
        paid: fields.paid,
        subtotal: totals.subtotal,
        itbis: totals.itbis,
        total: totals.total,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
      this.writeMock(previous ? all.map((d) => (d.id === saved.id ? saved : d)) : [...all, saved]);
      return of(saved);
    }

    const request =
      draft.id === null
        ? this.supabase.db
            .from('business_documents')
            .insert({ ...fields, kind: draft.kind })
            .select(DOCUMENT_COLUMNS)
            .single()
        : this.supabase.db.from('business_documents').update(fields).eq('id', draft.id).select(DOCUMENT_COLUMNS).single();

    return from(request).pipe(
      map((res) => {
        if (res.error) throw new Error(translateDbError(res.error));
        return toBusinessDocument(res.data);
      }),
    );
  }

  /** Cambia solo el estado (por ejemplo, marcar una factura como pagada) sin abrir el formulario. */
  setStatus(doc: BusinessDocument, status: DocumentStatus): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.writeMock(this.readMock().map((d) => (d.id === doc.id ? { ...d, status, updatedAt: new Date() } : d)));
      return of(undefined);
    }

    return from(this.supabase.db.from('business_documents').update({ status }).eq('id', doc.id).select('id')).pipe(
      map((res) => {
        if (unwrap(res).length === 0) throw new Error('No tienes permiso para hacer esto.');
      }),
    );
  }

  /** Solo un borrador se borra; lo emitido se anula. La base lo vuelve a exigir. */
  delete(doc: BusinessDocument): Observable<void> {
    if (doc.status !== 'borrador') {
      return throwError(() => new Error('Solo un borrador se puede borrar. Lo demás se anula.'));
    }

    if (this.supabase.shouldUseMockData()) {
      this.writeMock(this.readMock().filter((d) => d.id !== doc.id));
      return of(undefined);
    }

    return from(this.supabase.db.from('business_documents').delete().eq('id', doc.id).select('id')).pipe(
      map((res) => {
        if (unwrap(res).length === 0) throw new Error('No se pudo borrar el documento.');
      }),
    );
  }

  /** Copia un documento como borrador nuevo (mismo cliente y líneas, fecha de hoy). */
  duplicate(doc: BusinessDocument, kind: DocumentKind = doc.kind): DocumentDraft {
    const today = todayIso();
    return {
      id: null,
      kind,
      template: doc.template,
      status: 'borrador',
      customerName: doc.customerName,
      customerPhone: doc.customerPhone,
      customerEmail: doc.customerEmail,
      customerRnc: doc.customerRnc,
      vehicle: { ...doc.vehicle },
      issueDate: today,
      validUntil: null,
      items: doc.items.map((i) => ({ ...i, uid: newLineUid() })),
      discountType: doc.discountType,
      discountValue: doc.discountValue,
      applyItbis: doc.applyItbis,
      itbisRate: doc.itbisRate,
      paid: 0,
      notes: doc.notes,
      terms: doc.terms,
      sourceId: kind === doc.kind ? null : doc.id,
    };
  }

  // --- Modo simulado -------------------------------------------------------

  private readMock(): BusinessDocument[] {
    try {
      const raw = localStorage.getItem(MOCK_STORAGE_KEY);
      if (!raw) return [];
      return (JSON.parse(raw) as BusinessDocument[]).map((d) => ({
        ...d,
        createdAt: new Date(d.createdAt),
        updatedAt: new Date(d.updatedAt),
      }));
    } catch {
      return [];
    }
  }

  private writeMock(docs: BusinessDocument[]): void {
    try {
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(docs));
    } catch {
      // Modo privado o storage lleno: el modo simulado no persiste, el resto sigue.
    }
  }
}
