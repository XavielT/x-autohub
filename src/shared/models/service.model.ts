import {
  AppointmentStatusDb,
  ServiceCategoryDb,
} from '../../core/supabase/database.types';

export type ServiceCategory = ServiceCategoryDb;
export type AppointmentStatus = AppointmentStatusDb;

/** Las categorías, en el orden en que se muestran en /servicios. */
export const SERVICE_CATEGORIES: readonly ServiceCategory[] = [
  'instalacion',
  'mantenimiento',
  'mecanica',
  'electrico',
  'aire_acondicionado',
  'diagnostico',
];

export const SERVICE_CATEGORY_LABELS: Readonly<Record<ServiceCategory, string>> = {
  instalacion: 'Instalación',
  mantenimiento: 'Mantenimiento',
  mecanica: 'Mecánica ligera',
  electrico: 'Eléctrico',
  aire_acondicionado: 'Aire acondicionado',
  diagnostico: 'Diagnóstico y revisión',
};

/** Un servicio del taller (tabla `services`, migraciones 0001 y 0019). */
export interface ServiceModel {
  id: number;
  slug: string;
  icon: string;
  title: string;
  /** La línea corta de la tarjeta. */
  description: string;
  /** El texto del detalle. Puede estar vacío en un servicio cargado a mano. */
  longDescription: string;
  category: ServiceCategory;
  /** "Desde RD$ X". `null` = a cotizar: el precio lo pone el taller, no el código. */
  priceFrom: number | null;
  durationMinutes: number;
  /** Si se puede agendar. Uno que no se agenda se cotiza por WhatsApp. */
  isBookable: boolean;
  images: string[];
  sortOrder: number;
  isActive: boolean;
}

/** Cuándo abre el taller. `weekday`: 0 = domingo … 6 = sábado. Horas `HH:mm` de Santo Domingo. */
export interface AvailabilityRule {
  id: number;
  weekday: number;
  opensAt: string;
  closesAt: string;
  slotMinutes: number;
  /** Citas simultáneas que el taller atiende en la franja (de cualquier servicio). */
  capacity: number;
  /** Valor de ejemplo que dejó la migración. */
  isExample: boolean;
}

export interface Blackout {
  id: number;
  startsAt: Date;
  endsAt: Date;
  reason: string;
}

/** Una franja libre de un día, con los cupos que le quedan. */
export interface Slot {
  at: Date;
  remaining: number;
}

/** Lo que el cliente llena al agendar. El instante lo valida Postgres, no esto. */
export interface BookingInput {
  serviceId: number;
  scheduledAt: Date;
  contactName: string;
  contactPhone: string;
  /** El vehículo como texto ("Toyota Corolla 2015"): se guarda siempre. */
  vehicleText: string;
  /** Si lo eligió de su garaje. */
  profileVehicleId: number | null;
  /** Si viene de la instalación de un pedido. */
  orderId: string | null;
  notes: string;
}

/** Lo que devuelve `book_appointment()`. */
export interface BookedAppointment {
  id: string;
  number: number;
  serviceId: number;
  scheduledAt: Date;
  status: AppointmentStatus;
}

/** Una cita como la ve su dueño en "Mis citas". */
export interface AppointmentModel {
  id: string;
  number: number;
  serviceId: number;
  serviceTitle: string;
  serviceSlug: string;
  scheduledAt: Date;
  status: AppointmentStatus;
  vehicleText: string | null;
  /** Lo que escribió el equipo al moverla. La ve el cliente. */
  statusNote: string | null;
  orderId: string | null;
}

/** Una cita como la ve el panel: con quién es y para qué. */
export interface AdminAppointmentModel extends AppointmentModel {
  contactName: string;
  contactPhone: string;
  notes: string | null;
  /** Nulo = la agendó un invitado. */
  userId: string | null;
}

/** Un trabajo realizado, antes y después. */
export interface ServiceWorkModel {
  id: number;
  serviceId: number | null;
  title: string;
  description: string;
  beforeImage: string | null;
  afterImage: string | null;
  vehicleText: string | null;
  doneAt: Date;
  isPublished: boolean;
}
