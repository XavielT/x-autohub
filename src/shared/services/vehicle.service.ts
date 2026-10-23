import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, from, map, of, switchMap, tap } from 'rxjs';
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

function removeGuestVehicle(): void {
  try {
    localStorage.removeItem(GUEST_VEHICLE_KEY);
  } catch {
    // Sin almacenamiento: no hay nada que borrar.
  }
}

const sameVehicle = (a: SelectedVehicle, b: SelectedVehicle) =>
  a.makeId === b.makeId && a.modelId === b.modelId && a.year === b.year;

/**
 * Marcas y modelos, y el vehículo que la persona eligió para filtrar la tienda.
 *
 * **Dónde vive el vehículo elegido:**
 *   · Sin sesión, en `localStorage` (`x-autohub.vehicle`).
 *   · Con sesión, en su garaje (`profile_vehicles`), como el vehículo por
 *     defecto: así le sigue de un teléfono a otro. El garaje puede tener varios
 *     vehículos y uno solo es el predeterminado (un trigger de Postgres, de la
 *     migración 0017, lo garantiza).
 *
 * Al iniciar sesión la señal pasa a ser el vehículo por defecto del garaje. Si el
 * garaje está vacío y el visitante ya había elegido uno en este navegador, **se
 * migra**: pasa al garaje como el predeterminado y se borra de `localStorage`.
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

  private readonly _garage = signal<ProfileVehicleModel[]>([]);
  /** El garaje de la sesión, tal como se leyó por última vez. Vacío sin sesión. */
  readonly garage = this._garage.asReadonly();

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

  /** Vuelve a leer el garaje, lo deja en `garage` y alinea el vehículo elegido con el predeterminado. */
  refreshGarage(): Observable<ProfileVehicleModel[]> {
    return this.getGarage().pipe(
      tap((garage) => {
        this._garage.set(garage);
        this.applyDefault(garage);
      }),
    );
  }

  /**
   * Agrega un vehículo al garaje. El primero que se agrega es el predeterminado
   * aunque no se pida; uno que ya estaba no se duplica.
   */
  addToGarage(vehicle: SelectedVehicle, makeDefault = false, nickname: string | null = null): Observable<void> {
    return this.saveToGarage(vehicle, makeDefault, nickname).pipe(
      switchMap(() => this.refreshGarage()),
      map(() => undefined),
    );
  }

  /** Quita un vehículo del garaje. Si era el predeterminado, el garaje queda sin predeterminado. */
  removeFromGarage(id: number): Observable<void> {
    const user = this.auth.user();
    if (!user) return of(undefined);

    if (this.supabase.shouldUseMockData()) {
      this.mockGarage = this.mockGarage.filter((v) => !(v.id === id && v.userId === user.id));
      return this.refreshGarage().pipe(map(() => undefined));
    }

    return from(this.supabase.db.from('profile_vehicles').delete().eq('id', id)).pipe(
      map((res) => {
        if (res.error) unwrap({ data: null, error: res.error });
      }),
      switchMap(() => this.refreshGarage()),
      map(() => undefined),
    );
  }

  /** Marca otro vehículo del garaje como el predeterminado (el anterior se desmarca solo). */
  setDefaultVehicle(id: number): Observable<void> {
    const user = this.auth.user();
    if (!user) return of(undefined);

    if (this.supabase.shouldUseMockData()) {
      this.mockGarage = this.mockGarage.map((v) =>
        v.userId === user.id ? { ...v, isDefault: v.id === id } : v,
      );
      return this.refreshGarage().pipe(map(() => undefined));
    }

    return from(this.supabase.db.from('profile_vehicles').update({ is_default: true }).eq('id', id)).pipe(
      map((res) => {
        if (res.error) unwrap({ data: null, error: res.error });
      }),
      switchMap(() => this.refreshGarage()),
      map(() => undefined),
    );
  }

  // --- El vehículo elegido -----------------------------------------------------

  /** Elige un vehículo. Se ve al instante; guardarlo en segundo plano no bloquea nada. */
  select(vehicle: SelectedVehicle): void {
    this._selected.set(vehicle);

    if (!this.auth.user()) {
      this.writeGuestVehicle(vehicle);
      return;
    }

    this.saveToGarage(vehicle, true, null)
      .pipe(switchMap(() => this.getGarage()))
      .subscribe({
        // Solo se actualiza la lista: la señal ya tiene el vehículo que se eligió.
        next: (garage) => this._garage.set(garage),
        error: () => this.toast.show('No pudimos guardar tu vehiculo en el garaje.', 'error'),
      });
  }

  /** Deja de filtrar por vehículo. */
  clear(): void {
    this._selected.set(null);

    if (!this.auth.user()) {
      removeGuestVehicle();
      return;
    }

    this.unsetDefault()
      .pipe(switchMap(() => this.getGarage()))
      .subscribe({
        next: (garage) => this._garage.set(garage),
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

  /** El vehículo elegido sigue al predeterminado del garaje: sin predeterminado, ninguno. */
  private applyDefault(garage: ProfileVehicleModel[]): void {
    const preferred = garage.find((v) => v.isDefault);
    this._selected.set(
      preferred ? { makeId: preferred.makeId, modelId: preferred.modelId, year: preferred.year } : null,
    );
  }

  private syncWithSession(userId: string | null): void {
    if (userId === null) {
      // Cerró sesión (o nunca la tuvo): vale lo que había en este navegador.
      this._garage.set([]);
      this._selected.set(readGuestVehicle());
      return;
    }

    this.getGarage().subscribe({
      next: (garage) => {
        this._garage.set(garage);

        const preferred = garage.find((v) => v.isDefault);
        if (preferred) {
          this._selected.set({
            makeId: preferred.makeId,
            modelId: preferred.modelId,
            year: preferred.year,
          });
          return;
        }

        // Garaje vacío y un vehículo elegido como invitado: pasa al garaje.
        const guest = readGuestVehicle();
        if (garage.length === 0 && guest) this.migrateGuestVehicle(guest);
        // Con garaje pero sin predeterminado se conserva lo que ya estaba elegido.
      },
      // Sin garaje legible se conserva lo que ya estaba elegido.
      error: () => undefined,
    });
  }

  /** Lleva al garaje el vehículo que se eligió sin sesión, y lo borra de este navegador. */
  private migrateGuestVehicle(guest: SelectedVehicle): void {
    this.saveToGarage(guest, true, null)
      .pipe(switchMap(() => this.getGarage()))
      .subscribe({
        next: (garage) => {
          this._garage.set(garage);
          // Ya vive en el garaje: la copia del navegador sobra, y si la dejáramos
          // reaparecería al cerrar sesión como un vehículo que el usuario quitó.
          removeGuestVehicle();
        },
        // Si falla, la copia local se queda: la próxima sesión lo intenta otra vez.
        error: () => undefined,
      });
  }

  /**
   * Lo guarda en el garaje. Si ya estaba, no lo duplica: solo lo marca como
   * predeterminado si se pidió. El primero del garaje lo es siempre.
   */
  private saveToGarage(
    vehicle: SelectedVehicle,
    makeDefault: boolean,
    nickname: string | null,
  ): Observable<void> {
    const user = this.auth.user();
    if (!user) return of(undefined);

    if (this.supabase.shouldUseMockData()) {
      const mine = this.mockGarage.filter((v) => v.userId === user.id);
      const existing = mine.find((v) => sameVehicle(v, vehicle));
      const asDefault = makeDefault || mine.length === 0;

      if (asDefault) {
        this.mockGarage = this.mockGarage.map((v) =>
          v.userId === user.id ? { ...v, isDefault: existing ? v.id === existing.id : false } : v,
        );
      }
      if (existing) {
        if (nickname !== null) {
          this.mockGarage = this.mockGarage.map((v) => (v.id === existing.id ? { ...v, nickname } : v));
        }
      } else {
        this.mockGarage = [
          ...this.mockGarage,
          {
            id: this.mockGarageSeq++,
            userId: user.id,
            makeId: vehicle.makeId,
            modelId: vehicle.modelId,
            year: vehicle.year,
            nickname,
            isDefault: asDefault,
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
        .eq('user_id', user.id),
    ).pipe(
      switchMap((all) => {
        const rows = unwrap(all);
        const asDefault = makeDefault || rows.length === 0;
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
                    .update({
                      ...(asDefault && { is_default: true }),
                      ...(nickname !== null && { nickname }),
                    })
                    .eq('id', existing.data.id),
                )
              : from(
                  this.supabase.db.from('profile_vehicles').insert({
                    user_id: user.id,
                    make_id: vehicle.makeId,
                    model_id: vehicle.modelId,
                    year: vehicle.year,
                    nickname,
                    is_default: asDefault,
                  }),
                ),
          ),
        );
      }),
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
