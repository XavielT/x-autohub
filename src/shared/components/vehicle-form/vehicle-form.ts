import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectedVehicle, VehicleMakeModel, VehicleModelModel } from '../../models/product.model';
import { VehicleService } from '../../services/vehicle.service';

/** El año más viejo que se ofrece. Más atrás casi nada tiene piezas en RD. */
const OLDEST_YEAR = 1980;

/**
 * Los tres selectores del vehículo: marca → modelo → año.
 *
 * Lo usan el selector flotante del navbar y la sección "Elige tu vehículo" del
 * home, que son el mismo formulario en dos sitios. No guarda nada: avisa con
 * `chosen` y quien lo usa decide qué hacer (`VehicleService.select()`).
 *
 * Arranca con el vehículo que ya estaba elegido, si hay uno, para que abrirlo
 * para cambiar el año no obligue a repetir la marca y el modelo.
 */
@Component({
  selector: 'app-vehicle-form',
  imports: [FormsModule],
  templateUrl: './vehicle-form.html',
  styleUrl: './vehicle-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehicleForm implements OnInit {
  private readonly vehicles = inject(VehicleService);

  /** Texto del botón. */
  readonly submitLabel = input('Elegir vehículo');
  /** Evita choques de `id` cuando el formulario está dos veces en la página. */
  readonly idPrefix = input('vf');

  readonly chosen = output<SelectedVehicle>();

  readonly makes = signal<VehicleMakeModel[]>([]);
  readonly models = signal<VehicleModelModel[]>([]);
  readonly isLoadingModels = signal(false);

  readonly makeId = signal<number | null>(null);
  readonly modelId = signal<number | null>(null);
  readonly year = signal<number | null>(null);

  /** De este año más uno (los modelos del año siguiente salen antes) hasta 1980. */
  readonly years: readonly number[] = Array.from(
    { length: new Date().getFullYear() + 1 - OLDEST_YEAR + 1 },
    (_, i) => new Date().getFullYear() + 1 - i,
  );

  readonly isComplete = computed(
    () => this.makeId() !== null && this.modelId() !== null && this.year() !== null,
  );

  ngOnInit(): void {
    this.vehicles.getMakes().subscribe((makes) => this.makes.set(makes));

    const current = this.vehicles.selected();
    if (current) {
      this.makeId.set(current.makeId);
      this.year.set(current.year);
      this.loadModels(current.makeId, current.modelId);
    }
  }

  onMakeChange(value: number | null): void {
    this.makeId.set(value);
    // El modelo de otra marca no vale: se pierde al cambiar de marca.
    this.modelId.set(null);
    this.models.set([]);
    if (value !== null) this.loadModels(value, null);
  }

  private loadModels(makeId: number, preselect: number | null): void {
    this.isLoadingModels.set(true);
    this.vehicles.getModels(makeId).subscribe({
      next: (models) => {
        // Si mientras llegaban cambiaron de marca, esta respuesta ya no vale.
        if (this.makeId() !== makeId) return;
        this.models.set(models);
        this.isLoadingModels.set(false);
        if (preselect !== null && models.some((m) => m.id === preselect)) {
          this.modelId.set(preselect);
        }
      },
      error: () => this.isLoadingModels.set(false),
    });
  }

  submit(): void {
    const makeId = this.makeId();
    const modelId = this.modelId();
    const year = this.year();
    if (makeId === null || modelId === null || year === null) return;
    this.chosen.emit({ makeId, modelId, year });
  }
}
