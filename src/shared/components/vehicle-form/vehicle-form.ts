import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { SelectedVehicle, VehicleMakeModel, VehicleModelModel } from '../../models/product.model';
import { VehicleService } from '../../services/vehicle.service';
import { SearchableSelect, SelectOption } from '../../ui/searchable-select/searchable-select';

/** El año más viejo que se ofrece. Más atrás casi nada tiene piezas en RD. */
const OLDEST_YEAR = 1990;

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
  imports: [SearchableSelect],
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
  /** El modelo escrito a mano, cuando la marca no tiene modelos cargados. */
  readonly modelText = signal('');

  /** La marca está elegida, ya cargó, y no trae ningún modelo: el modelo se escribe. */
  readonly freeModel = computed(
    () => this.makeId() !== null && !this.isLoadingModels() && this.models().length === 0,
  );
  /** Hay modelo (elegido o escrito) y se puede pasar al año. */
  readonly hasModel = computed(
    () => this.modelId() !== null || (this.freeModel() && this.modelText().trim().length > 0),
  );

  /** De este año más uno (los modelos del año siguiente salen antes) hasta 1990. */
  readonly years: readonly number[] = Array.from(
    { length: new Date().getFullYear() + 1 - OLDEST_YEAR + 1 },
    (_, i) => new Date().getFullYear() + 1 - i,
  );

  readonly makeOptions = computed<SelectOption[]>(() =>
    this.makes().map((m) => ({ value: m.id, label: m.name })),
  );
  readonly modelOptions = computed<SelectOption[]>(() =>
    this.models().map((m) => ({ value: m.id, label: m.name })),
  );
  readonly yearOptions: SelectOption[] = this.years.map((y) => ({ value: y, label: String(y) }));

  readonly isComplete = computed(
    () => this.makeId() !== null && this.hasModel() && this.year() !== null,
  );

  ngOnInit(): void {
    this.vehicles.getMakes().subscribe((makes) => this.makes.set(makes));

    const current = this.vehicles.selected();
    if (current) {
      this.makeId.set(current.makeId);
      this.year.set(current.year);
      if (current.modelId === null) this.modelText.set(current.modelText ?? '');
      this.loadModels(current.makeId, current.modelId);
    }
  }

  onMakeChange(value: string | number | null): void {
    const id = value === null ? null : Number(value);
    this.makeId.set(id);
    // El modelo de otra marca no vale: se pierde al cambiar de marca.
    this.modelId.set(null);
    this.modelText.set('');
    this.models.set([]);
    if (id !== null) this.loadModels(id, null);
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

  onModelChange(value: string | number | null): void {
    this.modelId.set(value === null ? null : Number(value));
  }

  onModelTextChange(text: string): void {
    this.modelText.set(text);
    // Si borra el texto, el año vuelve a quedar bloqueado y sin valor.
    if (!text.trim()) this.year.set(null);
  }

  onYearChange(value: string | number | null): void {
    this.year.set(value === null ? null : Number(value));
  }

  submit(): void {
    const makeId = this.makeId();
    const modelId = this.modelId();
    const year = this.year();
    if (makeId === null || year === null || !this.hasModel()) return;
    if (modelId !== null) {
      this.chosen.emit({ makeId, modelId, year });
    } else {
      this.chosen.emit({ makeId, modelId: null, modelText: this.modelText().trim(), year });
    }
  }
}
