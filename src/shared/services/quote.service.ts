import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from, map, of, switchMap, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { ServiceQuoteRequestRow } from '../../core/supabase/database.types';
import { unwrap } from '../../core/supabase/supabase-error';
import { normalizeDrPhone } from '../utils/phone';
import { compressImage } from '../utils/image-compress';

export const QUOTE_PHOTOS_BUCKET = 'quote-photos';
export const MAX_QUOTE_PHOTOS = 3;

export type QuoteStatus = ServiceQuoteRequestRow['status'];
export type QuoteUrgency = 'normal' | 'pronto' | 'seguridad';

export interface NewQuote {
  name: string;
  phone: string;
  description: string;
  vehicleText: string;
  profileVehicleId?: number | null;
  serviceId?: number | null;
  /** Hasta 3 fotos; se bajan a 1600 px y se suben como JPEG. */
  photos: File[];
  /** Honeypot: un campo que una persona no ve. Lleno = un bot. */
  website: string;
}

export interface QuoteTriage {
  services: { slug: string; title: string; price_from: number | null }[];
  summary: string;
  missing_info: string[];
  checklist: string[];
  checklist_note: string;
  can_quote_without_inspection: boolean;
}

/** Una solicitud de cotización tal como la ve el equipo. */
export interface QuoteRequest {
  id: string;
  code: string;
  name: string;
  phone: string;
  vehicleText: string | null;
  serviceId: number | null;
  description: string;
  photos: string[];
  status: QuoteStatus;
  urgency: QuoteUrgency | null;
  triage: QuoteTriage | null;
  createdAt: Date;
}

export const QUOTE_STATUS_FLOW: readonly { value: QuoteStatus; label: string }[] = [
  { value: 'nueva', label: 'Nueva' },
  { value: 'vista', label: 'Vista' },
  { value: 'respondida', label: 'Respondida' },
  { value: 'agendada', label: 'Agendada' },
  { value: 'cerrada', label: 'Cerrada' },
  { value: 'spam', label: 'Spam' },
];

/**
 * Las solicitudes de cotización del taller (migración 0055). El cliente (con o sin cuenta) crea la suya con `create()`: las fotos se suben de verdad a un
 * bucket privado y la solicitud se guarda con su código `XAH-C-0001`. El equipo las ve, las atiende y cambia su estado desde el panel. El triage de la IA
 * lo escribe la edge; aquí solo se lee.
 */
@Injectable({ providedIn: 'root' })
export class QuoteService {
  private readonly supabase = inject(SupabaseService);

  private mockSeq = 0;

  /** Sube las fotos y crea la solicitud. Devuelve su código. En modo simulado no guarda nada y da un código de prueba. */
  create(quote: NewQuote): Observable<{ id: string; code: string }> {
    const phone = normalizeDrPhone(quote.phone);
    if (!phone) return throwError(() => new Error('Escribe un teléfono dominicano válido (809, 829 o 849…).'));

    if (this.supabase.shouldUseMockData()) {
      this.mockSeq += 1;
      return of({ id: `mock-${this.mockSeq}`, code: `XAH-C-${String(this.mockSeq).padStart(4, '0')}` });
    }

    const token = crypto.randomUUID();
    const files = quote.photos.slice(0, MAX_QUOTE_PHOTOS);

    return this.uploadPhotos(token, files).pipe(
      switchMap((paths) =>
        from(
          this.supabase.db.rpc('create_quote_request', {
            p_name: quote.name.trim(),
            p_phone: phone,
            p_description: quote.description.trim(),
            p_vehicle_text: quote.vehicleText.trim() || undefined,
            p_profile_vehicle_id: quote.profileVehicleId ?? undefined,
            p_service_id: quote.serviceId ?? undefined,
            p_token: paths.length > 0 ? token : undefined,
            p_photos: paths,
            p_website: quote.website,
          }),
        ),
      ),
      map((res) => {
        const row = unwrap(res)[0];
        return { id: row.id, code: row.code };
      }),
    );
  }

  /** (Admin) Las solicitudes, las más nuevas primero; con un estado, solo de ese estado. */
  list(status?: QuoteStatus): Observable<QuoteRequest[]> {
    if (this.supabase.shouldUseMockData()) return of([]);

    let query = this.supabase.db
      .from('service_quote_requests')
      .select('id, code, contact_name, contact_phone, vehicle_text, service_id, description, photos, status, urgency, ai_triage, created_at');
    if (status) query = query.eq('status', status);
    return from(query.order('created_at', { ascending: false }).limit(100)).pipe(map((res) => unwrap(res).map(toQuoteRequest)));
  }

  /** (Admin) Cambia el estado y deja anotado quién la atiende. */
  setStatus(id: string, status: QuoteStatus, adminId: string | null): Observable<void> {
    if (this.supabase.shouldUseMockData()) return of(undefined);
    return from(this.supabase.db.from('service_quote_requests').update({ status, handled_by: adminId }).eq('id', id)).pipe(
      map((res) => {
        unwrap(res);
      }),
    );
  }

  /** (Admin) Enlaces firmados (1 hora) de las fotos, por ruta. El bucket es privado. */
  photoUrls(paths: string[]): Observable<Record<string, string>> {
    if (this.supabase.shouldUseMockData() || paths.length === 0) return of({});
    return from(this.supabase.client()).pipe(
      switchMap((client) => from(client.storage.from(QUOTE_PHOTOS_BUCKET).createSignedUrls(paths, 3600))),
      map((res) => Object.fromEntries((res.data ?? []).flatMap((e) => (e.signedUrl && e.path ? [[e.path, e.signedUrl] as [string, string]] : [])))),
    );
  }

  private uploadPhotos(token: string, files: File[]): Observable<string[]> {
    if (files.length === 0) return of([]);
    return from(this.supabase.client()).pipe(
      switchMap((client) =>
        forkJoin(
          files.map((file, i) =>
            from(compressImage(file)).pipe(
              switchMap((ready) => {
                // La política de Storage acepta `<uuid>/<0-2>.jpg|webp` y nada más.
                const ext = ready.type === 'image/webp' ? 'webp' : 'jpg';
                const path = `${token}/${i}.${ext}`;
                return from(client.storage.from(QUOTE_PHOTOS_BUCKET).upload(path, ready, { upsert: false, contentType: ext === 'webp' ? 'image/webp' : 'image/jpeg' })).pipe(
                  map((res) => {
                    if (res.error) throw new Error('No pudimos subir una de las fotos. Intenta de nuevo o mándalas por WhatsApp.');
                    return res.data.path;
                  }),
                );
              }),
            ),
          ),
        ),
      ),
    );
  }
}

export function toQuoteRequest(row: Pick<ServiceQuoteRequestRow, 'id' | 'code' | 'contact_name' | 'contact_phone' | 'vehicle_text' | 'service_id' | 'description' | 'photos' | 'status' | 'urgency' | 'ai_triage' | 'created_at'>): QuoteRequest {
  return {
    id: row.id,
    code: row.code,
    name: row.contact_name,
    phone: row.contact_phone,
    vehicleText: row.vehicle_text,
    serviceId: row.service_id,
    description: row.description,
    photos: row.photos ?? [],
    status: row.status,
    urgency: row.urgency,
    triage: row.ai_triage,
    createdAt: new Date(row.created_at),
  };
}
