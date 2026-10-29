import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of, switchMap, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toAppointment } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import {
  AppointmentModel,
  AppointmentStatus,
  BookedAppointment,
  BookingInput,
  Slot,
} from '../models/service.model';
import { BLACKOUTS_MOCK, SERVICES_MOCK } from '../data/service.mock';
import { AuthService } from './auth.service';
import { ServiceCatalogService } from './service-catalog.service';
import { OPEN_STATUSES, canCancel } from '../utils/appointment-rules';
import { computeSlots } from '../utils/slots';
import { localDate } from '../utils/service-time';

/** Dónde guarda el modo simulado sus citas entre recargas. */
const MOCK_STORAGE_KEY = 'x-autohub.mock-appointments';

/** El tope de citas abiertas por teléfono. Espeja `book_appointment()`. */
const MAX_OPEN_PER_PHONE = 3;

interface MockAppointment extends AppointmentModel {
  userId: string | null;
  contactPhone: string;
}

/** Los diez dígitos de la derecha: "+1 809 555 0134" y "809-555-0134" son el mismo teléfono. */
const digits = (phone: string): string => phone.replace(/\D/g, '').slice(-10);

/**
 * Agendar, y ver y cancelar las propias.
 *
 * **Quien decide es Postgres.** Las horas libres salen de `available_slots()` y
 * `book_appointment()` vuelve a validar el slot, el tope por teléfono y el vehículo
 * del garaje: lo que el navegador mostró hace un minuto puede haberse llenado. Lo
 * que hay aquí en el modo simulado **espeja** esas reglas (con los mismos mensajes)
 * para que el flujo de desarrollo no sea más permisivo que el de producción.
 *
 * Se puede agendar sin cuenta; cancelar solo lo hace quien la tiene y es dueño de la
 * cita (`cancel_appointment()`), con más de 24 horas de anticipación.
 */
@Injectable({ providedIn: 'root' })
export class AppointmentService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(ServiceCatalogService);

  private mock: MockAppointment[] = readMock();

  /** Las franjas libres de un día (`YYYY-MM-DD`, en hora de Santo Domingo). */
  getSlots(serviceId: number, date: string): Observable<Slot[]> {
    if (this.supabase.shouldUseMockData()) {
      return this.slotsMock(serviceId, date);
    }

    return from(this.supabase.db.rpc('available_slots', { p_service_id: serviceId, p_date: date })).pipe(
      map((res) => unwrap(res).map((r) => ({ at: new Date(r.slot_at), remaining: r.remaining }))),
    );
  }

  /** Agenda la cita. La cita nace `requested`: la confirma el equipo. */
  book(input: BookingInput): Observable<BookedAppointment> {
    if (this.supabase.shouldUseMockData()) {
      return this.bookMock(input);
    }

    return from(
      this.supabase.db.rpc('book_appointment', {
        p_service_id: input.serviceId,
        p_scheduled_at: input.scheduledAt.toISOString(),
        p_contact_name: input.contactName,
        p_contact_phone: input.contactPhone,
        p_vehicle_text: input.vehicleText || null,
        p_profile_vehicle_id: input.profileVehicleId,
        p_order_id: input.orderId,
        p_notes: input.notes || null,
      }),
    ).pipe(
      map((res) => {
        const rows = unwrap(res);
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (!row) throw new Error('No pudimos agendar tu cita. Intenta de nuevo.');
        return {
          id: row.id,
          number: row.appointment_number,
          serviceId: row.service_id,
          scheduledAt: new Date(row.scheduled_at),
          status: row.status,
        };
      }),
    );
  }

  /** Las citas de quien tiene la sesión abierta, de la más nueva a la más vieja. */
  getMyAppointments(): Observable<AppointmentModel[]> {
    if (this.supabase.shouldUseMockData()) {
      const userId = this.auth.user()?.id ?? null;
      return of(
        this.mock
          .filter((a) => userId !== null && a.userId === userId)
          .map(({ userId: _u, contactPhone: _p, ...appointment }) => appointment)
          .sort((a, b) => +b.scheduledAt - +a.scheduledAt),
      );
    }

    return from(this.supabase.db.rpc('my_appointments')).pipe(
      map((res) => unwrap(res).map(toAppointment)),
    );
  }

  /** Cancela la propia, solo si faltan más de 24 horas. */
  cancel(id: string): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      const userId = this.auth.user()?.id ?? null;
      const found = this.mock.find((a) => a.id === id);

      if (!found || userId === null || found.userId !== userId) {
        return throwError(() => new Error('Esa cita no existe.'));
      }
      if (found.status !== 'requested' && found.status !== 'confirmed') {
        return throwError(() => new Error('Esta cita ya no se puede cancelar.'));
      }
      if (!canCancel(found)) {
        return throwError(
          () => new Error('Solo se puede cancelar con más de 24 horas de anticipacion. Escríbenos por WhatsApp.'),
        );
      }

      this.updateMock(id, { status: 'cancelled' as AppointmentStatus, statusNote: 'Cancelada por el cliente' });
      return of(undefined);
    }

    return from(this.supabase.db.rpc('cancel_appointment', { p_id: id })).pipe(
      map((res) => {
        if (res.error) unwrap({ data: null, error: res.error });
      }),
    );
  }

  // --- Modo simulado ---------------------------------------------------------

  private slotsMock(serviceId: number, date: string): Observable<Slot[]> {
    const service = SERVICES_MOCK.find((s) => s.id === serviceId);
    if (!service || !service.isActive || !service.isBookable) return of([]);

    return this.catalog.getAvailability().pipe(
      map((rules) =>
        computeSlots({
          date,
          rules,
          blackouts: BLACKOUTS_MOCK,
          taken: (at) =>
            this.mock.filter((a) => +a.scheduledAt === +at && OPEN_STATUSES.includes(a.status)).length,
          now: new Date(),
        }),
      ),
    );
  }

  private bookMock(input: BookingInput): Observable<BookedAppointment> {
    if (!input.contactName.trim()) return throwError(() => new Error('Escribe tu nombre.'));
    if (digits(input.contactPhone).length < 10) {
      return throwError(() => new Error('Escribe un teléfono válido: lo usamos para confirmar tu cita.'));
    }

    return this.slotsMock(input.serviceId, localDate(input.scheduledAt)).pipe(
      switchMap((slots) => {
        if (!slots.some((s) => +s.at === +input.scheduledAt)) {
          return throwError(() => new Error('Esa hora ya no está disponible. Elige otra.'));
        }

        const open = this.mock.filter(
          (a) =>
            digits(a.contactPhone) === digits(input.contactPhone) &&
            (a.status === 'requested' || a.status === 'confirmed') &&
            a.scheduledAt > new Date(),
        ).length;
        if (open >= MAX_OPEN_PER_PHONE) {
          return throwError(
            () => new Error('Ya tienes 3 citas abiertas con este teléfono. Escríbenos por WhatsApp para cambiarlas.'),
          );
        }

        const service = SERVICES_MOCK.find((s) => s.id === input.serviceId)!;
        const number = Math.max(2000, ...this.mock.map((a) => a.number)) + 1;
        const created: MockAppointment = {
          id: `demo-cita-${Date.now()}-${number}`,
          number,
          serviceId: service.id,
          serviceTitle: service.title,
          serviceSlug: service.slug,
          scheduledAt: input.scheduledAt,
          status: 'requested',
          vehicleText: input.vehicleText.trim() || null,
          statusNote: null,
          orderId: input.orderId,
          userId: this.auth.user()?.id ?? null,
          contactPhone: input.contactPhone.trim(),
        };

        this.mock = [created, ...this.mock];
        writeMock(this.mock);

        return of({
          id: created.id,
          number,
          serviceId: service.id,
          scheduledAt: input.scheduledAt,
          status: 'requested' as AppointmentStatus,
        });
      }),
    );
  }

  private updateMock(id: string, change: Partial<MockAppointment>): void {
    this.mock = this.mock.map((a) => (a.id === id ? { ...a, ...change } : a));
    writeMock(this.mock);
  }
}

// --- Persistencia del modo simulado ----------------------------------------------

function readMock(): MockAppointment[] {
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw, (key, value) =>
      key === 'scheduledAt' && typeof value === 'string' ? new Date(value) : value,
    ) as MockAppointment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMock(list: MockAppointment[]): void {
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Sin storage la cita vive lo que dure la pestaña.
  }
}

