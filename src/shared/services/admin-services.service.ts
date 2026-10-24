import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from, map, of, switchMap, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import {
  toAdminAppointment,
  toAvailabilityRule,
  toBlackout,
  toService,
  toServiceWork,
} from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import {
  AdminAppointmentModel,
  AppointmentStatus,
  AvailabilityRule,
  Blackout,
  ServiceCategory,
  ServiceModel,
  ServiceWorkModel,
} from '../models/service.model';
import { AVAILABILITY_MOCK, BLACKOUTS_MOCK, SERVICES_MOCK, WORKS_MOCK } from '../data/service.mock';
import { StorageService } from './storage.service';
import { nextAppointmentStatuses } from '../utils/appointment-rules';
import { addDays, localDate, slotInstant } from '../utils/service-time';

/** Un servicio mientras se edita. `id` nulo = uno nuevo. */
export interface ServiceDraft {
  id: number | null;
  title: string;
  /** Vacío = lo arma Postgres a partir del título. */
  slug: string;
  icon: string;
  description: string;
  longDescription: string;
  category: ServiceCategory;
  priceFrom: number | null;
  durationMinutes: number;
  isBookable: boolean;
  images: string[];
  sortOrder: number;
  isActive: boolean;
}

/** Un trabajo mientras se edita. `id` nulo = uno nuevo. */
export interface WorkDraft {
  id: number | null;
  title: string;
  description: string;
  serviceId: number | null;
  beforeImage: string | null;
  afterImage: string | null;
  vehicleText: string;
  /** `YYYY-MM-DD`. */
  doneAt: string;
  isPublished: boolean;
}

/** Un día de la semana del horario. Un solo tramo por día en el panel. */
export interface DayDraft {
  weekday: number;
  open: boolean;
  opensAt: string;
  closesAt: string;
  slotMinutes: number;
  capacity: number;
  /** La regla que ya existe para ese día, para actualizarla en vez de duplicarla. */
  ruleId: number | null;
}

const SERVICE_COLUMNS =
  'id, slug, icon, title, description, long_description, category, price_from, duration_minutes, is_bookable, images, sort_order, is_active';

const WORK_COLUMNS =
  'id, service_id, title, description, before_image, after_image, vehicle_text, done_at, is_published, created_at';

const APPOINTMENT_COLUMNS =
  'id, appointment_number, user_id, service_id, order_id, profile_vehicle_id, vehicle_text, contact_name, contact_phone, scheduled_at, status, notes, status_note, created_at, updated_at, services(title, slug)';

/**
 * El taller desde el panel: servicios, horario, cierres, citas y trabajos.
 *
 * Escribir cualquiera de estas tablas es solo de un admin (RLS), y las citas **no se
 * escriben con un `update`**: cambian por `set_appointment_status()`, que comprueba el
 * orden. Los guards del panel son comodidad de interfaz; la seguridad real está en la
 * base.
 *
 * En modo simulado cada pantalla trabaja sobre su propia copia en memoria: lo que se
 * cambia aquí no se ve en las páginas públicas hasta que se conecta Supabase.
 */
@Injectable({ providedIn: 'root' })
export class AdminServicesService {
  private readonly supabase = inject(SupabaseService);
  private readonly storage = inject(StorageService);

  private mockServices: ServiceModel[] = SERVICES_MOCK.map((s) => ({ ...s }));
  private mockRules: AvailabilityRule[] = AVAILABILITY_MOCK.map((r) => ({ ...r }));
  private mockBlackouts: Blackout[] = [...BLACKOUTS_MOCK];
  private mockWorks: ServiceWorkModel[] = WORKS_MOCK.map((w) => ({ ...w }));
  private mockAppointments: AdminAppointmentModel[] = mockAppointments(SERVICES_MOCK);
  private mockSeq = 1000;

  // --- Servicios ---------------------------------------------------------------

  /** Todos, **incluidos los apagados**: es justo lo que la página pública no muestra. */
  getServices(): Observable<ServiceModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of([...this.mockServices].sort((a, b) => a.sortOrder - b.sortOrder));
    }

    return from(
      this.supabase.db.from('services').select(SERVICE_COLUMNS).order('sort_order', { ascending: true }),
    ).pipe(map((res) => unwrap(res).map(toService)));
  }

  saveService(draft: ServiceDraft): Observable<ServiceModel> {
    const invalid = validateService(draft);
    if (invalid) return throwError(() => new Error(invalid));

    if (this.supabase.shouldUseMockData()) {
      const slug = draft.slug.trim() || slugify(draft.title);
      if (this.mockServices.some((s) => s.slug === slug && s.id !== draft.id)) {
        return throwError(() => new Error('Ese registro ya existe.'));
      }

      const saved: ServiceModel = {
        id: draft.id ?? ++this.mockSeq,
        slug,
        icon: draft.icon.trim(),
        title: draft.title.trim(),
        description: draft.description.trim(),
        longDescription: draft.longDescription.trim(),
        category: draft.category,
        priceFrom: draft.priceFrom,
        durationMinutes: draft.durationMinutes,
        isBookable: draft.isBookable,
        images: draft.images,
        sortOrder: draft.sortOrder,
        isActive: draft.isActive,
      };
      this.mockServices =
        draft.id === null
          ? [...this.mockServices, saved]
          : this.mockServices.map((s) => (s.id === draft.id ? saved : s));
      return of(saved);
    }

    const row = {
      title: draft.title.trim(),
      slug: draft.slug.trim(),
      icon: draft.icon.trim(),
      description: draft.description.trim(),
      long_description: draft.longDescription.trim(),
      category: draft.category,
      price_from: draft.priceFrom,
      duration_minutes: draft.durationMinutes,
      is_bookable: draft.isBookable,
      images: draft.images,
      sort_order: draft.sortOrder,
      is_active: draft.isActive,
    };

    const request =
      draft.id === null
        ? this.supabase.db.from('services').insert(row).select(SERVICE_COLUMNS).single()
        : this.supabase.db.from('services').update(row).eq('id', draft.id).select(SERVICE_COLUMNS).single();

    return from(request).pipe(map((res) => toService(unwrap(res))));
  }

  /** Sube fotos de un servicio al bucket de inventario. Devuelve sus URLs públicas. */
  uploadServiceImages(files: File[]): Observable<string[]> {
    return this.storage.uploadInventoryImages(files, 'servicios');
  }

  // --- Horario -----------------------------------------------------------------

  getAvailability(): Observable<AvailabilityRule[]> {
    if (this.supabase.shouldUseMockData()) return of([...this.mockRules]);

    return from(
      this.supabase.db
        .from('service_availability')
        .select('id, weekday, opens_at, closes_at, slot_minutes, capacity, is_example')
        .order('weekday', { ascending: true })
        .order('opens_at', { ascending: true }),
    ).pipe(map((res) => unwrap(res).map(toAvailabilityRule)));
  }

  /**
   * Guarda la semana: cada día abierto actualiza su regla (o la crea), y cada día
   * cerrado borra las suyas. Lo que se guarda aquí deja de ser "de ejemplo".
   */
  saveWeek(days: readonly DayDraft[]): Observable<void> {
    for (const d of days.filter((x) => x.open)) {
      if (d.closesAt <= d.opensAt) return throwError(() => new Error('El taller tiene que cerrar después de abrir.'));
      if (d.slotMinutes < 5 || d.capacity < 1) {
        return throwError(() => new Error('Cada franja necesita al menos 5 minutos y 1 cupo.'));
      }
    }

    if (this.supabase.shouldUseMockData()) {
      this.mockRules = days
        .filter((d) => d.open)
        .map((d, i) => ({
          id: d.ruleId ?? i + 1,
          weekday: d.weekday,
          opensAt: d.opensAt,
          closesAt: d.closesAt,
          slotMinutes: d.slotMinutes,
          capacity: d.capacity,
          isExample: false,
        }));
      return of(undefined);
    }

    const ops = days.map((d) => {
      if (!d.open) {
        return from(this.supabase.db.from('service_availability').delete().eq('weekday', d.weekday)).pipe(
          map((res) => {
            if (res.error) unwrap({ data: null, error: res.error });
          }),
        );
      }

      const row = {
        weekday: d.weekday,
        opens_at: d.opensAt,
        closes_at: d.closesAt,
        slot_minutes: d.slotMinutes,
        capacity: d.capacity,
        is_example: false,
      };
      const request =
        d.ruleId === null
          ? this.supabase.db.from('service_availability').insert(row)
          : this.supabase.db.from('service_availability').update(row).eq('id', d.ruleId);

      return from(request).pipe(
        map((res) => {
          if (res.error) unwrap({ data: null, error: res.error });
        }),
      );
    });

    return forkJoin(ops).pipe(map(() => undefined));
  }

  // --- Cierres -----------------------------------------------------------------

  getBlackouts(): Observable<Blackout[]> {
    if (this.supabase.shouldUseMockData()) {
      return of([...this.mockBlackouts].sort((a, b) => +a.startsAt - +b.startsAt));
    }

    return from(
      this.supabase.db
        .from('service_blackouts')
        .select('id, starts_at, ends_at, reason')
        .order('starts_at', { ascending: true }),
    ).pipe(map((res) => unwrap(res).map(toBlackout)));
  }

  addBlackout(input: { startsAt: Date; endsAt: Date; reason: string }): Observable<Blackout> {
    if (input.endsAt <= input.startsAt) {
      return throwError(() => new Error('El cierre tiene que terminar después de empezar.'));
    }

    if (this.supabase.shouldUseMockData()) {
      const created: Blackout = { id: ++this.mockSeq, ...input, reason: input.reason.trim() };
      this.mockBlackouts = [...this.mockBlackouts, created];
      return of(created);
    }

    return from(
      this.supabase.db
        .from('service_blackouts')
        .insert({
          starts_at: input.startsAt.toISOString(),
          ends_at: input.endsAt.toISOString(),
          reason: input.reason.trim(),
        })
        .select('id, starts_at, ends_at, reason')
        .single(),
    ).pipe(map((res) => toBlackout(unwrap(res))));
  }

  removeBlackout(id: number): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.mockBlackouts = this.mockBlackouts.filter((b) => b.id !== id);
      return of(undefined);
    }

    return from(this.supabase.db.from('service_blackouts').delete().eq('id', id)).pipe(
      map((res) => {
        if (res.error) unwrap({ data: null, error: res.error });
      }),
    );
  }

  // --- Citas -------------------------------------------------------------------

  /** Las citas desde `from` en adelante (o todas), de la más próxima a la más lejana. */
  getAppointments(from_?: Date): Observable<AdminAppointmentModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(
        this.mockAppointments
          .filter((a) => !from_ || a.scheduledAt >= from_)
          .sort((a, b) => +a.scheduledAt - +b.scheduledAt),
      );
    }

    let query = this.supabase.db.from('service_appointments').select(APPOINTMENT_COLUMNS).order('scheduled_at', { ascending: true });
    if (from_) query = query.gte('scheduled_at', from_.toISOString());

    return from(query).pipe(map((res) => unwrap(res).map(toAdminAppointment)));
  }

  /**
   * Mueve una cita. Va por `set_appointment_status()` y no por un `update`: la función
   * comprueba el orden (no se salta de `requested` a `done`) y la tabla no tiene
   * política de escritura. La nota **la ve el cliente** en "Mis citas".
   */
  setAppointmentStatus(id: string, to: AppointmentStatus, note?: string): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      const found = this.mockAppointments.find((a) => a.id === id);
      if (!found) return throwError(() => new Error('Esa cita no existe.'));
      if (!nextAppointmentStatuses(found.status).includes(to)) {
        return throwError(() => new Error(`Una cita ${found.status} no puede pasar a ${to}.`));
      }
      this.mockAppointments = this.mockAppointments.map((a) =>
        a.id === id ? { ...a, status: to, statusNote: note?.trim() || null } : a,
      );
      return of(undefined);
    }

    return from(
      this.supabase.db.rpc('set_appointment_status', { p_id: id, p_to: to, p_note: note?.trim() || null }),
    ).pipe(
      map((res) => {
        if (res.error) unwrap({ data: null, error: res.error });
        // El aviso al cliente lo pide la base (trigger `notify_status_change()`, migración 0028).
      }),
    );
  }

  // --- Trabajos ----------------------------------------------------------------

  /** Todos, **incluidos los sin publicar**. */
  getWorks(): Observable<ServiceWorkModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of([...this.mockWorks].sort((a, b) => +b.doneAt - +a.doneAt));
    }

    return from(
      this.supabase.db.from('service_works').select(WORK_COLUMNS).order('done_at', { ascending: false }),
    ).pipe(map((res) => unwrap(res).map(toServiceWork)));
  }

  saveWork(draft: WorkDraft): Observable<ServiceWorkModel> {
    if (!draft.title.trim()) return throwError(() => new Error('Escribe el título del trabajo.'));
    // Publicar sin foto de después no tiene sentido: es la que se ve en la galería.
    if (draft.isPublished && !draft.afterImage) {
      return throwError(() => new Error('Para publicar un trabajo hace falta al menos la foto del después.'));
    }

    if (this.supabase.shouldUseMockData()) {
      const saved: ServiceWorkModel = {
        id: draft.id ?? ++this.mockSeq,
        serviceId: draft.serviceId,
        title: draft.title.trim(),
        description: draft.description.trim(),
        beforeImage: draft.beforeImage,
        afterImage: draft.afterImage,
        vehicleText: draft.vehicleText.trim() || null,
        doneAt: new Date(`${draft.doneAt}T12:00:00`),
        isPublished: draft.isPublished,
      };
      this.mockWorks =
        draft.id === null ? [saved, ...this.mockWorks] : this.mockWorks.map((w) => (w.id === draft.id ? saved : w));
      return of(saved);
    }

    const row = {
      service_id: draft.serviceId,
      title: draft.title.trim(),
      description: draft.description.trim(),
      before_image: draft.beforeImage,
      after_image: draft.afterImage,
      vehicle_text: draft.vehicleText.trim() || null,
      done_at: draft.doneAt,
      is_published: draft.isPublished,
    };

    const request =
      draft.id === null
        ? this.supabase.db.from('service_works').insert(row).select(WORK_COLUMNS).single()
        : this.supabase.db.from('service_works').update(row).eq('id', draft.id).select(WORK_COLUMNS).single();

    return from(request).pipe(map((res) => toServiceWork(unwrap(res))));
  }

  deleteWork(id: number): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.mockWorks = this.mockWorks.filter((w) => w.id !== id);
      return of(undefined);
    }

    return from(this.supabase.db.from('service_works').delete().eq('id', id)).pipe(
      map((res) => {
        if (res.error) unwrap({ data: null, error: res.error });
      }),
    );
  }

  uploadWorkImage(file: File): Observable<string> {
    return this.storage.uploadServiceWorkImage(file);
  }

  /** Para encadenar una subida y un guardado sin anidar suscripciones. */
  saveWorkWithImages(
    draft: WorkDraft,
    files: { before?: File; after?: File },
  ): Observable<ServiceWorkModel> {
    const before$ = files.before ? this.uploadWorkImage(files.before) : of(draft.beforeImage);
    const after$ = files.after ? this.uploadWorkImage(files.after) : of(draft.afterImage);

    return forkJoin([before$, after$]).pipe(
      switchMap(([beforeImage, afterImage]) => this.saveWork({ ...draft, beforeImage, afterImage })),
    );
  }
}

// --- Validación y datos de ejemplo -------------------------------------------------

/** Lo mínimo que un servicio necesita, con el mensaje de lo que falta. */
export function validateService(draft: ServiceDraft): string | null {
  if (!draft.title.trim()) return 'Escribe el nombre del servicio.';
  if (!draft.icon.trim()) return 'Elige un icono.';
  if (!draft.description.trim()) return 'Escribe la descripción corta.';
  if (!Number.isFinite(draft.durationMinutes) || draft.durationMinutes <= 0 || draft.durationMinutes > 1440) {
    return 'La duración tiene que estar entre 1 minuto y 24 horas.';
  }
  if (draft.priceFrom !== null && (!Number.isFinite(draft.priceFrom) || draft.priceFrom < 0)) {
    return 'El precio no puede ser negativo.';
  }
  return null;
}

/** Igual que `xah_slugify()` en Postgres: minúsculas, sin acentos, con guiones. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Tres citas de ejemplo en los próximos días: una por confirmar, una confirmada y una vieja hecha. */
function mockAppointments(services: readonly ServiceModel[]): AdminAppointmentModel[] {
  const today = localDate(new Date());
  const title = (id: number) => services.find((s) => s.id === id)?.title ?? 'Servicio';
  const slug = (id: number) => services.find((s) => s.id === id)?.slug ?? '';
  const base = {
    statusNote: null,
    orderId: null,
    notes: null,
  };

  return [
    {
      ...base,
      id: 'mock-cita-1',
      number: 2003,
      serviceId: 4,
      serviceTitle: title(4),
      serviceSlug: slug(4),
      scheduledAt: slotInstant(addDays(today, 2), '09:00'),
      status: 'requested',
      vehicleText: 'Toyota Corolla 2015',
      contactName: 'Ana Pérez',
      contactPhone: '8095550003',
      userId: 'u-1',
      notes: 'Hace ruido al frenar',
    },
    {
      ...base,
      id: 'mock-cita-2',
      number: 2002,
      serviceId: 2,
      serviceTitle: title(2),
      serviceSlug: slug(2),
      scheduledAt: slotInstant(addDays(today, 2), '10:00'),
      status: 'confirmed',
      vehicleText: 'Honda Civic 2018',
      contactName: 'Luis Martínez',
      contactPhone: '8295550004',
      userId: null,
      statusNote: 'Te esperamos',
    },
    {
      ...base,
      id: 'mock-cita-3',
      number: 2001,
      serviceId: 9,
      serviceTitle: title(9),
      serviceSlug: slug(9),
      scheduledAt: slotInstant(addDays(today, -3), '11:00'),
      status: 'done',
      vehicleText: 'Hyundai Tucson 2020',
      contactName: 'María Rodríguez',
      contactPhone: '8495550005',
      userId: null,
    },
  ];
}
