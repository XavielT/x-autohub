import { ChangeDetectionStrategy, Component, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { forkJoin } from 'rxjs';
import { VehicleForm } from '../../../../shared/components/vehicle-form/vehicle-form';
import { ProfileVehicleModel, SelectedVehicle } from '../../../../shared/models/product.model';
import { ToastService } from '../../../../shared/services/toast.service';
import { VehicleService } from '../../../../shared/services/vehicle.service';

import { Skeleton } from '../../../../shared/ui/skeleton/skeleton';
/** Una fila del garaje con el nombre del vehículo ya resuelto. */
export interface GarageRow {
  vehicle: ProfileVehicleModel;
  label: string;
}

/**
 * "Mi garaje", dentro de `/perfil`: los vehículos de la persona, cuál es el
 * predeterminado y cómo agregar otro o quitar uno.
 *
 * El predeterminado es el que filtra la tienda y el que dice el chip del navbar.
 * Quitar el predeterminado deja la tienda sin filtro de vehículo hasta que se
 * marque otro.
 */
@Component({
  selector: 'app-mi-garaje',
  imports: [Skeleton, VehicleForm],
  templateUrl: './mi-garaje.html',
  styleUrl: './mi-garaje.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiGaraje implements OnInit {
  private readonly vehicles = inject(VehicleService);
  private readonly toast = inject(ToastService);

  readonly garage = this.vehicles.garage;
  readonly rows = signal<GarageRow[]>([]);
  readonly isLoading = signal(true);
  readonly isAdding = signal(false);
  readonly busyId = signal<number | null>(null);

  constructor() {
    // Los nombres de cada vehículo se resuelven cada vez que cambia el garaje.
    effect(() => {
      const garage = this.garage();
      untracked(() => this.resolveRows(garage));
    });
  }

  ngOnInit(): void {
    this.vehicles.refreshGarage().subscribe({
      next: () => this.isLoading.set(false),
      error: () => {
        this.isLoading.set(false);
        this.toast.show('No pudimos cargar tu garaje.', 'error');
      },
    });
  }

  private resolveRows(garage: ProfileVehicleModel[]): void {
    if (garage.length === 0) {
      this.rows.set([]);
      return;
    }

    const makeIds = [...new Set(garage.map((v) => v.makeId))];
    forkJoin({
      makes: this.vehicles.getMakes(),
      models: forkJoin(makeIds.map((id) => this.vehicles.getModels(id))),
    }).subscribe({
      next: ({ makes, models }) => {
        const allModels = models.flat();
        this.rows.set(
          garage.map((vehicle) => {
            const make = makes.find((m) => m.id === vehicle.makeId)?.name ?? 'Marca';
            // Modelo escrito a mano: "Toyota · Corolla 2015".
            if (vehicle.modelId === null) {
              return { vehicle, label: `${make} · ${vehicle.modelText ?? 'modelo'} ${vehicle.year}` };
            }
            const model = allModels.find((m) => m.id === vehicle.modelId)?.name ?? 'modelo';
            return { vehicle, label: `${make} ${model} ${vehicle.year}` };
          }),
        );
      },
      error: () => this.rows.set(garage.map((vehicle) => ({ vehicle, label: `Vehículo ${vehicle.year}` }))),
    });
  }

  toggleForm(): void {
    this.isAdding.update((open) => !open);
  }

  add(vehicle: SelectedVehicle): void {
    this.vehicles.addToGarage(vehicle).subscribe({
      next: () => {
        this.isAdding.set(false);
        this.toast.show('Vehículo agregado a tu garaje.');
      },
      error: () => this.toast.show('No pudimos agregar el vehículo.', 'error'),
    });
  }

  makeDefault(row: GarageRow): void {
    this.busyId.set(row.vehicle.id);
    this.vehicles.setDefaultVehicle(row.vehicle.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.show(`${row.label} es ahora tu vehículo.`);
      },
      error: () => {
        this.busyId.set(null);
        this.toast.show('No pudimos cambiar tu vehículo.', 'error');
      },
    });
  }

  remove(row: GarageRow): void {
    this.busyId.set(row.vehicle.id);
    this.vehicles.removeFromGarage(row.vehicle.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.show(`${row.label} salió de tu garaje.`);
      },
      error: () => {
        this.busyId.set(null);
        this.toast.show('No pudimos quitar el vehículo.', 'error');
      },
    });
  }
}
