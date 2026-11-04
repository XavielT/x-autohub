import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, map, of, switchMap } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { VehicleMaintenanceItemRow, VehicleMaintenanceTemplateRow } from '../../core/supabase/database.types';
import { unwrap } from '../../core/supabase/supabase-error';
import { ProfileVehicleModel } from '../models/product.model';
import { AiService } from './ai.service';

export type MaintenanceStatus = VehicleMaintenanceItemRow['status'];

/** Un renglón de mantenimiento de un vehículo del garaje (migración 0058). */
export interface MaintenanceItem {
  id: number;
  label: string;
  everyKm: number | null;
  everyMonths: number | null;
  lastDoneOn: string | null;
  lastDoneKm: number | null;
  dueOn: string | null;
  dueKm: number | null;
  status: MaintenanceStatus;
  /** 'ia' = de la guía general; 'usuario' = lo registró o agregó la persona; 'taller' = lo registró el taller al terminar una cita. */
  source: VehicleMaintenanceItemRow['source'];
  categorySlug: string | null;
  serviceSlug: string | null;
}

/** Una guía general por revisar (la ve el admin). */
export interface MaintenanceTemplate {
  id: number;
  makeId: number;
  modelId: number;
  yearFrom: number;
  yearTo: number;
  engineNote: string | null;
  items: VehicleMaintenanceTemplateRow['items'];
  source: 'ia' | 'admin';
  reviewed: boolean;
}

export type GuideResult = 'ok' | 'sin_modelo' | 'no_disponible';

const ORDER: Record<MaintenanceStatus, number> = { vencido: 0, pronto: 1, ok: 2 };
const NOT_AVAILABLE = 'El mantenimiento necesita la base real: en modo de prueba no está disponible.';

const ITEM_COLUMNS =
  'id, profile_vehicle_id, template_key, label, every_km, every_months, last_done_on, last_done_km, due_on, due_km, status, source, category_slug, service_slug, created_at, updated_at';

/**
 * Garaje y mantenimiento (migración 0058). La guía general de cada vehículo (solo intervalos) la arma la IA una sola vez por marca, modelo y rango de años y se
 * guarda para todos; aquí se copia al vehículo de la persona y se le lleva la cuenta (última vez, próxima, estado, kilometraje). El estado lo calcula la base.
 */
@Injectable({ providedIn: 'root' })
export class MaintenanceService {
  private readonly supabase = inject(SupabaseService);
  private readonly ai = inject(AiService);

  private readonly mock = (): boolean => this.supabase.shouldUseMockData();

  /** Lo de un vehículo, lo vencido primero. */
  getItems(vehicleId: number): Observable<MaintenanceItem[]> {
    if (this.mock()) return of([]);
    return from(this.supabase.db.from('vehicle_maintenance_items').select(ITEM_COLUMNS).eq('profile_vehicle_id', vehicleId)).pipe(
      map((res) => unwrap(res).map(toItem).sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') || a.label.localeCompare(b.label))),
    );
  }

  /** "Armar mi guía": la edge la crea (o encuentra la que ya existe) y se copia al vehículo. Nunca falla: dice qué pasó. */
  createGuide(vehicleId: number): Observable<GuideResult> {
    if (this.mock()) return of('no_disponible');
    return this.ai.call<{ template_id: number }>('ai-maintenance-template', { profile_vehicle_id: vehicleId }).pipe(
      switchMap((out) => {
        if (!out.ok) return of<GuideResult>('no_disponible');
        return from(this.supabase.db.rpc('adopt_maintenance_template', { p_profile_vehicle_id: vehicleId })).pipe(
          map((res): GuideResult => (res.error ? 'no_disponible' : 'ok')),
        );
      }),
      catchError(() => of<GuideResult>('no_disponible')),
    );
  }

  /** ¿La guía de este vehículo ya la revisó un admin? `null` si no hay una. Sin revisar se rotula "generada con IA". */
  getTemplateReviewed(vehicle: ProfileVehicleModel): Observable<boolean | null> {
    if (this.mock() || vehicle.modelId === null) return of(null);
    return from(
      this.supabase.db
        .from('vehicle_maintenance_templates')
        .select('reviewed, year_from, year_to')
        .eq('make_id', vehicle.makeId)
        .eq('model_id', vehicle.modelId)
        .lte('year_from', vehicle.year)
        .gte('year_to', vehicle.year)
        .order('year_from', { ascending: false })
        .limit(1),
    ).pipe(map((res) => (res.error ? null : (res.data?.[0]?.reviewed ?? null))), catchError(() => of(null)));
  }

  setOdometer(vehicleId: number, km: number): Observable<void> {
    return this.rpc(() => this.supabase.db.rpc('set_vehicle_odometer', { p_profile_vehicle_id: vehicleId, p_km: km }));
  }

  /** "Registrar servicio hecho": la fecha (hoy si no se da) y el kilometraje (el último conocido si no se da). */
  logDone(itemId: number, date?: string, km?: number): Observable<void> {
    return this.rpc(() => this.supabase.db.rpc('log_maintenance_done', { p_item_id: itemId, p_date: date, p_km: km }));
  }

  setReminders(vehicleId: number, on: boolean): Observable<void> {
    return this.rpc(() => this.supabase.db.rpc('set_vehicle_reminders', { p_profile_vehicle_id: vehicleId, p_on: on }));
  }

  /** Un renglón propio ("Cambio de plumillas, cada 20,000 km"). */
  addCustom(vehicleId: number, label: string, everyKm: number | null, everyMonths: number | null): Observable<void> {
    if (this.mock()) return throwMock();
    return from(
      this.supabase.db.from('vehicle_maintenance_items').insert({ profile_vehicle_id: vehicleId, label: label.trim(), every_km: everyKm ?? undefined, every_months: everyMonths ?? undefined, source: 'usuario' }),
    ).pipe(map((res) => void unwrap(res)));
  }

  remove(itemId: number): Observable<void> {
    if (this.mock()) return throwMock();
    return from(this.supabase.db.from('vehicle_maintenance_items').delete().eq('id', itemId)).pipe(map((res) => void unwrap(res)));
  }

  // --- Admin: las guías por revisar -----------------------------------------------------------

  getPendingTemplates(): Observable<MaintenanceTemplate[]> {
    if (this.mock()) return of([]);
    return from(
      this.supabase.db
        .from('vehicle_maintenance_templates')
        .select('id, make_id, model_id, year_from, year_to, engine_note, items, source, reviewed, model, created_at')
        .eq('reviewed', false)
        .order('created_at', { ascending: false })
        .limit(50),
    ).pipe(map((res) => unwrap(res).map(toTemplate)));
  }

  markReviewed(templateId: number): Observable<void> {
    return from(this.supabase.db.from('vehicle_maintenance_templates').update({ reviewed: true }).eq('id', templateId)).pipe(map((res) => void unwrap(res)));
  }

  /** Borrar una guía mala: la siguiente persona con ese vehículo dispara una nueva. */
  deleteTemplate(templateId: number): Observable<void> {
    return from(this.supabase.db.from('vehicle_maintenance_templates').delete().eq('id', templateId)).pipe(map((res) => void unwrap(res)));
  }

  /** La llamada se arma solo si hay base real: en modo simulado ni se toca el cliente. */
  private rpc(call: () => PromiseLike<{ error: { message: string } | null }>): Observable<void> {
    if (this.mock()) return throwMock();
    return from(call()).pipe(map((res) => void unwrap(res as never)));
  }
}

function throwMock(): Observable<never> {
  return new Observable((s) => s.error(new Error(NOT_AVAILABLE)));
}

export function toItem(row: VehicleMaintenanceItemRow): MaintenanceItem {
  return {
    id: row.id,
    label: row.label,
    everyKm: row.every_km,
    everyMonths: row.every_months,
    lastDoneOn: row.last_done_on,
    lastDoneKm: row.last_done_km,
    dueOn: row.due_on,
    dueKm: row.due_km,
    status: row.status,
    source: row.source,
    categorySlug: row.category_slug,
    serviceSlug: row.service_slug,
  };
}

export function toTemplate(row: Pick<VehicleMaintenanceTemplateRow, 'id' | 'make_id' | 'model_id' | 'year_from' | 'year_to' | 'engine_note' | 'items' | 'source' | 'reviewed'>): MaintenanceTemplate {
  return { id: row.id, makeId: row.make_id, modelId: row.model_id, yearFrom: row.year_from, yearTo: row.year_to, engineNote: row.engine_note, items: row.items ?? [], source: row.source, reviewed: row.reviewed };
}

/** "Cada 5,000 km o 4 meses". */
export function intervalText(item: Pick<MaintenanceItem, 'everyKm' | 'everyMonths'>): string {
  const parts = [item.everyKm ? `${item.everyKm.toLocaleString('en-US')} km` : '', item.everyMonths ? `${item.everyMonths} ${item.everyMonths === 1 ? 'mes' : 'meses'}` : ''].filter(Boolean);
  return parts.length ? `Cada ${parts.join(' o ')}` : '';
}
