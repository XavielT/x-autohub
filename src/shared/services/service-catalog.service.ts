import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toAvailabilityRule, toService, toServiceWork } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import { AvailabilityRule, ServiceModel, ServiceWorkModel } from '../models/service.model';
import { AVAILABILITY_MOCK, SERVICES_MOCK, WORKS_MOCK } from '../data/service.mock';

/**
 * Los textos de un `select` de supabase-js tienen que ser **una sola cadena
 * literal**: el tipo de la fila sale de leerlos, y armarlos con `'a, ' + 'b'` los
 * ensancha a `string` (ver CLAUDE.md).
 */
const SERVICE_COLUMNS =
  'id, slug, icon, title, description, long_description, category, price_from, duration_minutes, is_bookable, images, sort_order, is_active';

const WORK_COLUMNS =
  'id, service_id, title, description, before_image, after_image, vehicle_text, done_at, is_published, created_at';

/**
 * El catálogo público del taller: servicios, horario y trabajos realizados.
 *
 * Todo es de lectura pública; la política de cada tabla ya esconde lo que no toca
 * (servicios apagados, trabajos sin publicar). Escribirlos es del panel
 * (`AdminServicesService`).
 */
@Injectable({ providedIn: 'root' })
export class ServiceCatalogService {
  private readonly supabase = inject(SupabaseService);

  /** Los servicios activos, en el orden del panel. */
  getServices(): Observable<ServiceModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(SERVICES_MOCK.filter((s) => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder));
    }

    return from(
      this.supabase.db
        .from('services')
        .select(SERVICE_COLUMNS)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ).pipe(map((res) => unwrap(res).map(toService)));
  }

  /** Un servicio por su slug, o `undefined` si no existe o está apagado. */
  getBySlug(slug: string): Observable<ServiceModel | undefined> {
    if (this.supabase.shouldUseMockData()) {
      return of(SERVICES_MOCK.find((s) => s.slug === slug && s.isActive));
    }

    return from(
      this.supabase.db
        .from('services')
        .select(SERVICE_COLUMNS)
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle(),
    ).pipe(
      map((res) => {
        if (res.error) unwrap({ data: null, error: res.error });
        return res.data ? toService(res.data) : undefined;
      }),
    );
  }

  /** Un servicio por su id (la ficha de producto y el pedido lo conocen por id). */
  getById(id: number): Observable<ServiceModel | undefined> {
    if (this.supabase.shouldUseMockData()) {
      return of(SERVICES_MOCK.find((s) => s.id === id && s.isActive));
    }

    return from(
      this.supabase.db
        .from('services')
        .select(SERVICE_COLUMNS)
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle(),
    ).pipe(
      map((res) => {
        if (res.error) unwrap({ data: null, error: res.error });
        return res.data ? toService(res.data) : undefined;
      }),
    );
  }

  /** Cuándo abre el taller. Sirve para pintar el horario y para el modo simulado. */
  getAvailability(): Observable<AvailabilityRule[]> {
    if (this.supabase.shouldUseMockData()) {
      return of([...AVAILABILITY_MOCK]);
    }

    return from(
      this.supabase.db
        .from('service_availability')
        .select('id, weekday, opens_at, closes_at, slot_minutes, capacity, is_example')
        .order('weekday', { ascending: true })
        .order('opens_at', { ascending: true }),
    ).pipe(map((res) => unwrap(res).map(toAvailabilityRule)));
  }

  /**
   * Los trabajos publicados, del más reciente al más viejo. Con `serviceId`, solo los
   * de ese servicio. Sin publicados la lista llega vacía y la página no pinta la
   * sección.
   */
  getWorks(serviceId?: number, limit = 12): Observable<ServiceWorkModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(
        WORKS_MOCK.filter((w) => w.isPublished && (serviceId === undefined || w.serviceId === serviceId))
          .sort((a, b) => +b.doneAt - +a.doneAt)
          .slice(0, limit),
      );
    }

    const query = this.supabase.db
      .from('service_works')
      .select(WORK_COLUMNS)
      .eq('is_published', true)
      .order('done_at', { ascending: false })
      .limit(limit);

    return from(serviceId === undefined ? query : query.eq('service_id', serviceId)).pipe(
      map((res) => unwrap(res).map(toServiceWork)),
    );
  }
}
