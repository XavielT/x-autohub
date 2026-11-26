import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, map, of, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { BusinessCustomerRow } from '../../core/supabase/database.types';
import { translateDbError, unwrap } from '../../core/supabase/supabase-error';
import { BusinessCustomer, CustomerDraft, CustomerVehicle, DocumentDraft } from '../models/business-document.model';
import { customerEnrichedBy, customerFromSource, customerKey, hasVehicleData } from '../utils/document-customers';
import { assertTouched } from './admin.service';

/** Una sola cadena literal: ver `PRODUCT_COLUMNS` en `product.service.ts`. */
const CUSTOMER_COLUMNS = 'id, name, name_key, phone, email, rnc, address, notes, vehicles, created_by, created_at, updated_at';

const MOCK_STORAGE_KEY = 'x-autohub.business-customers';

export function toBusinessCustomer(row: BusinessCustomerRow): BusinessCustomer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    rnc: row.rnc,
    address: row.address,
    notes: row.notes,
    vehicles: (row.vehicles ?? []).map((v) => ({
      text: v.text ?? '',
      plate: v.plate ?? '',
      mileage: v.mileage ?? '',
      vin: v.vin ?? '',
    })),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/** Lo que se guarda de los vehículos: sin espacios de sobra y sin los renglones vacíos. */
const cleanVehicles = (vehicles: readonly CustomerVehicle[]): CustomerVehicle[] =>
  vehicles
    .map((v) => ({ text: v.text.trim(), plate: v.plate.trim(), mileage: v.mileage.trim(), vin: v.vin.trim() }))
    .filter(hasVehicleData);

export function validateCustomer(draft: CustomerDraft): string | null {
  if (!draft.name.trim()) return 'Escribe el nombre del cliente.';
  return null;
}

/**
 * Los clientes desde el panel (`/admin/clientes`): crear, editar y borrar. Solo un admin los lee y escribe (RLS, 0065).
 *
 * Una cotización o factura guarda **su propia copia** de los datos del cliente: editar o borrar a un cliente no
 * cambia lo que ya se le entregó. En modo simulado viven en `localStorage`, como los documentos.
 */
@Injectable({ providedIn: 'root' })
export class BusinessCustomerService {
  private readonly supabase = inject(SupabaseService);

  /** Por orden alfabético. */
  list(): Observable<BusinessCustomer[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.readMock().sort((a, b) => customerKey(a.name).localeCompare(customerKey(b.name), 'es')));
    }

    return from(this.supabase.db.from('business_customers').select(CUSTOMER_COLUMNS).order('name_key')).pipe(
      map((res) => unwrap(res).map(toBusinessCustomer)),
    );
  }

  /** Crea o actualiza (según `draft.id`). Devuelve el cliente guardado. */
  save(draft: CustomerDraft): Observable<BusinessCustomer> {
    const invalid = validateCustomer(draft);
    if (invalid) return throwError(() => new Error(invalid));

    const fields = {
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      rnc: draft.rnc.trim(),
      address: draft.address.trim(),
      notes: draft.notes.trim(),
      vehicles: cleanVehicles(draft.vehicles),
    };

    if (this.supabase.shouldUseMockData()) {
      const all = this.readMock();
      const previous = all.find((c) => c.id === draft.id);
      const now = new Date();
      const saved: BusinessCustomer = {
        ...fields,
        id: previous?.id ?? `mock-c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
      this.writeMock(previous ? all.map((c) => (c.id === saved.id ? saved : c)) : [...all, saved]);
      return of(saved);
    }

    const request =
      draft.id === null
        ? this.supabase.db.from('business_customers').insert(fields).select(CUSTOMER_COLUMNS).single()
        : this.supabase.db.from('business_customers').update(fields).eq('id', draft.id).select(CUSTOMER_COLUMNS).single();

    return from(request).pipe(
      map((res) => {
        if (res.error) throw new Error(translateDbError(res.error));
        return toBusinessCustomer(res.data);
      }),
    );
  }

  /** Borra al cliente. Sus documentos se quedan con los datos que ya tenían. */
  delete(customer: BusinessCustomer): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.writeMock(this.readMock().filter((c) => c.id !== customer.id));
      return of(undefined);
    }

    return from(this.supabase.db.from('business_customers').delete().eq('id', customer.id).select('id')).pipe(
      map((res) => assertTouched(unwrap(res))),
    );
  }

  /**
   * Deja al cliente de un documento en la tabla antes de guardarlo, y devuelve su id:
   *   · si el documento ya tiene cliente (o su nombre coincide con uno), le completa lo que le falte y le suma el
   *     vehículo nuevo; **nunca le pisa un dato**;
   *   · si no hay ninguno, lo crea.
   * Es un extra: si falla, el documento se guarda igual (sin vínculo) y no se pierde nada.
   */
  resolveForDocument(draft: DocumentDraft, customers: readonly BusinessCustomer[]): Observable<string | null> {
    if (!draft.customerName.trim()) return of(null);

    const known =
      customers.find((c) => c.id === draft.customerId) ??
      customers.find((c) => customerKey(c.name) === customerKey(draft.customerName));

    if (!known) {
      const fresh = customerFromSource(draft);
      return this.save({ ...fresh, id: null }).pipe(
        map((c) => c.id),
        catchError(() => of(null)),
      );
    }

    const enriched = customerEnrichedBy(known, draft);
    if (!enriched) return of(known.id);

    return this.save(enriched).pipe(
      map((c) => c.id),
      catchError(() => of(known.id)),
    );
  }

  // --- Modo simulado -------------------------------------------------------

  private readMock(): BusinessCustomer[] {
    try {
      const raw = localStorage.getItem(MOCK_STORAGE_KEY);
      if (!raw) return [];
      return (JSON.parse(raw) as BusinessCustomer[]).map((c) => ({
        ...c,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
      }));
    } catch {
      return [];
    }
  }

  private writeMock(customers: BusinessCustomer[]): void {
    try {
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(customers));
    } catch {
      // Modo privado o storage lleno: el modo simulado no persiste, el resto sigue.
    }
  }
}
