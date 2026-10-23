import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, from, map, of, switchMap } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toProfileVehicle, toVehicleMake, toVehicleModel } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import {
  ProfileVehicleModel,
  SelectedVehicle,
  VehicleMakeModel,
  VehicleModelModel,
} from '../models/product.model';
import { VEHICLE_MAKES_MOCK, VEHICLE_MODELS_MOCK } from '../data/vehicle.mock';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

/** Dónde recuerda el navegador el vehículo de quien no tiene sesión. */
export const GUEST_VEHICLE_KEY = 'x-autohub.vehicle';

/** Lee el vehículo guardado. Cualquier cosa que no tenga la forma exacta se descarta. */
function readGuestVehicle(): SelectedVehicle | null {
  try {
    const raw = localStorage.getItem(GUEST_VEHICLE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SelectedVehicle> | null;
    if (
      v &&
      Number.isInteger(v.makeId) &&
      Number.isInteger(v.modelId) &&
      Number.isInteger(v.year)
    ) {
      return { makeId: v.makeId as number, modelId: v.modelId as number, year: v.year as number };
    }
  } catch {
    // Sin almacenamiento o JSON roto: se trata como si no hubiera nada guardado.
  }
  return null;
}

/**
 * Marcas y modelos, y el vehículo que la persona eligió para filtrar la tienda.
 *
 * **Dónde vive el vehículo elegido:**
 *   · Sin sesión, en `localStorage` (`x-autohub.vehicle`).
 *   · Con sesión, en su garaje (`profile_vehicles`), como el vehículo por
 *     defecto: así le sigue de un teléfono a otro.
 *
 * Al iniciar sesión la señal pasa a ser el vehículo por defecto del garaje. Si el
 * garaje está vacío no se toca lo que el visitante ya había elegido; llevarlo al
 * garaje es trabajo de la fase 3.
 *
 * Las marcas y modelos son de lectura pública. Agregarlas es del panel
 * (`AdminCatalogService`).
 */
@Injectable({ providedIn: 'root' })
export class VehicleService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  private readonly _selected = signal<SelectedVehicle | null>(readGuestVehicle());
  /** El vehículo elegido, o `null`. Lo que filtra la tienda. */
  readonly selected = this._selected.asReadonly();

  private readonly _selectedLabel = signal<string | null>(null);
  /**
   * El vehículo elegido con nombre ("Toyota Corolla 2015"), o `null`. Es lo que
   * dice el chip "Mi vehículo" del navbar; `selected` solo trae ids.
   */
  readonly selectedLabel = this._selectedLabel.asReadonly();

  /** El garaje en modo mock: no hay tabla, y no tiene que sobrevivir a la sesión. */
  private mockGarage: ProfileVehicleModel[] = [];
  private mockGarageSeq = 1;

  constructor() {
    // Con cada cambio de sesión se vuelve a decidir de dónde sale el vehículo.
    effect(() => {
      const user = this.auth.user();
      untracked(() => this.syncWithSession(user?.id ?? null));
    });

    // El nombre se vuelve a resolver cada vez que cambia el vehículo elegido.
    effect(() => {
      const vehicle = this._selected();
      untracked(() => this.resolveLabel(vehicle));
    });
  }

  // --- Marcas y modelos ------------------------------------------------------

  getMakes(): Observable<VehicleMakeModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of([...VEHICLE_MAKES_MOCK]);
    }

    return from(
      this.supabase.db.from('vehicle_makes').select('id, name, slug').order('name'),
    ).pipe(map((res) => unwrap(res).map(toVehicleMake)));
  }

  getModels(makeId: number): Observable<VehicleModelModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(VEHICLE_MODELS_MOCK.filter((m) => m.makeId === makeId));
    }

    return from(
      this.supabase.db
        .from('vehicle_models')
        .select('id, make_id, name, slug')
        .eq('make_id', makeId)
        .order('name'),
    ).pipe(map((res) => unwrap(res).map(toVehicleModel)));
  }

  // --- El garaje --------------------------------------------------------------

  /** El garaje de la sesión. Vacío sin sesión. */
  getGarage(): Observable<ProfileVehicleModel[]> {
    const user = this.auth.user();
    if (!user) return of([]);

    if (this.supabase.shouldUseMockData()) {
      return of(this.mockGarage.filter((v) => v.userId === user.id));
    }

    return from(
      this.supabase.db
        .from('profile_vehicles')
        .select('id, user_id, make_id, model_id, year, nickname, is_default, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
    ).pipe(map((res) => unwrap(res).map(toProfileVehicle)));
  }

  // --- El vehículo elegido -----------------------------------------------------

  /** Elige un vehículo. Se ve al instante; guardarlo en segundo plano no bloquea nada. */
  select(vehicle: SelectedVehicle): void {
    this._selected.set(vehicle);

    if (!this.auth.user()) {
      this.writeGuestVehicle(vehicle);
      return;
    }

    this.saveAsDefault(vehicle).subscribe({
      error: () => this.toast.show('No pudimos guardar tu vehiculo en el garaje.', 'error'),
    });
  }

  /** Deja de filtrar por vehículo. */
  clear(): void {
    this._selected.set(null);

    if (!this.auth.user()) {
      try {
        localStorage.removeItem(GUEST_VEHICLE_KEY);
      } catch {
        // Sin almacenamiento: no hay nada que borrar.
      }
      return;
    }

    this.unsetDefault().subscribe({
      error: () => this.toast.show('No pudimos actualizar tu garaje.', 'error'),
    });
  }

  // --- Internos --------------------------------------------------------------------

  /**
   * Busca los nombres de la marca y el modelo. Si la lectura falla o el vehículo
   * ya no existe (una marca borrada, un id viejo en localStorage) la etiqueta
   * queda nula y el chip vuelve a decir "Elige tu vehículo": mejor eso que un
   * "Marca 7".
   */
  private resolveLabel(vehicle: SelectedVehicle | null): void {
    if (vehicle === null) {
      this._selectedLabel.set(null);
      return;
    }

    this.getMakes().subscribe({
      next: (makes) => {
        const make = makes.find((m) => m.id === vehicle.makeId);
        if (!make) {
          this._selectedLabel.set(null);
          return;
        }
        this.getModels(make.id).subscribe({
          next: (models) => {
            // Si mientras tanto eligieron otro, esta respuesta ya no vale.
            if (this._selected() !== vehicle) return;
            const model = models.find((m) => m.id === vehicle.modelId);
            this._selectedLabel.set(model ? `${make.name} ${model.name} ${vehicle.year}` : null);
          },
          error: () => this._selectedLabel.set(null),
        });
      },
      error: () => this._selectedLabel.set(null),
    });
  }

  private writeGuestVehicle(vehicle: SelectedVehicle): void {
    try {
      localStorage.setItem(GUEST_VEHICLE_KEY, JSON.stringify(vehicle));
    } catch {
      // Modo privado o cuota llena: la elección vale para esta pestaña y ya.
    }
  }

  private syncWithSession(userId: string | null): void {
    if (userId === null) {
      // Cerró sesión (o nunca la tuvo): vale lo que había en este navegador.
      this._selected.set(readGuestVehicle());
      return;
    }

    this.getGarage().subscribe({
      next: (garage) => {
        const preferred = garage.find((v) => v.isDefault);
        if (preferred) {
          this._selected.set({
            makeId: preferred.makeId,
            modelId: preferred.modelId,
            year: preferred.year,
          });
        }
      },
      // Sin garaje legible se conserva lo que ya estaba elegido.
      error: () => undefined,
    });
  }

  /** Lo guarda como el vehículo por defecto; si ya estaba en el garaje, solo lo marca. */
  private saveAsDefault(vehicle: SelectedVehicle): Observable<void> {
    const user = this.auth.user();
    if (!user) return of(undefined);

    if (this.supabase.shouldUseMockData()) {
      const same = (v: ProfileVehicleModel) =>
        v.userId === user.id &&
        v.makeId === vehicle.makeId &&
        v.modelId === vehicle.modelId &&
        v.year === vehicle.year;
      this.mockGarage = this.mockGarage.map((v) =>
        v.userId === user.id ? { ...v, isDefault: same(v) } : v,
      );
      if (!this.mockGarage.some(same)) {
        this.mockGarage = [
          ...this.mockGarage,
          {
            id: this.mockGarageSeq++,
            userId: user.id,
            makeId: vehicle.makeId,
            modelId: vehicle.modelId,
            year: vehicle.year,
            nickname: null,
            isDefault: true,
          },
        ];
      }
      return of(undefined);
    }

    // Marcarlo por defecto desmarca al anterior dentro de Postgres (trigger de la
    // migración 0017), así que no hacen falta dos escrituras.
    return from(
      this.supabase.db
        .from('profile_vehicles')
        .select('id')
        .eq('user_id', user.id)
        .eq('make_id', vehicle.makeId)
        .eq('model_id', vehicle.modelId)
        .eq('year', vehicle.year)
        .maybeSingle(),
    ).pipe(
      switchMap((existing) =>
        existing.data
          ? from(
              this.supabase.db
                .from('profile_vehicles')
                .update({ is_default: true })
                .eq('id', existing.data.id),
            )
          : from(
              this.supabase.db.from('profile_vehicles').insert({
                user_id: user.id,
                make_id: vehicle.makeId,
                model_id: vehicle.modelId,
                year: vehicle.year,
                is_default: true,
              }),
            ),
      ),
      map((res) => {
        if (res.error) unwrap({ data: null, error: res.error });
      }),
    );
  }

  private unsetDefault(): Observable<void> {
    const user = this.auth.user();
    if (!user) return of(undefined);

    if (this.supabase.shouldUseMockData()) {
      this.mockGarage = this.mockGarage.map((v) =>
        v.userId === user.id ? { ...v, isDefault: false } : v,
      );
      return of(undefined);
    }

    return from(
      this.supabase.db
        .from('profile_vehicles')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('is_default', true),
    ).pipe(
      map((res) => {
        if (res.error) unwrap({ data: null, error: res.error });
      }),
    );
  }
}
