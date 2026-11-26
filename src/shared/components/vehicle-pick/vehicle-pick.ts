import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { VehicleMakeModel, VehicleModelModel } from '../../models/product.model';
import { VehicleSelection } from '../../models/business-document.model';
import { VehicleService } from '../../services/vehicle.service';
import { SearchableSelect, SelectOption } from '../../ui/searchable-select/searchable-select';

/** El año más viejo que se ofrece (igual que el selector de vehículo del sitio). */
const OLDEST_YEAR = 1990;

/**
 * Marca → modelo → año, del mismo catálogo que usa el selector "Elige tu vehículo" del sitio.
 *
 * A diferencia de `app-vehicle-form`, no está atado al vehículo elegido por el visitante ni tiene botón: cada cambio
 * se avisa con `changed`, con el texto ya armado ("Toyota Corolla 2018") y los ids, para que quien lo usa lo guarde
 * (clientes y documentos del panel). Si el vehículo no está en el catálogo, se puede escribir a mano.
 *
 * Arranca con lo que ya traiga `value`: los ids si los hay y, si es un vehículo viejo escrito a mano, su texto.
 */
@Component({
  selector: 'app-vehicle-pick',
  imports: [SearchableSelect],
  templateUrl: './vehicle-pick.html',
  styleUrl: './vehicle-pick.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehiclePick implements OnInit {
  private readonly vehicles = inject(VehicleService);

  /** El vehículo con el que arranca (puede venir vacío). */
  readonly value = input<Partial<VehicleSelection> | null>(null);
  /** Evita choques de `id` cuando hay varios en la página. */
  readonly idPrefix = input('vp');

  readonly changed = output<VehicleSelection>();

  readonly makes = signal<VehicleMakeModel[]>([]);
  readonly models = signal<VehicleModelModel[]>([]);
  readonly isLoadingModels = signal(false);

  readonly makeId = signal<number | null>(null);
  readonly modelId = signal<number | null>(null);
  /** El modelo escrito, cuando la marca no tiene modelos cargados. */
  readonly modelText = signal('');
  readonly year = signal<number | null>(null);

  /** Se escribe todo a mano (un vehículo que no está en el catálogo). */
  readonly manual = signal(false);
  readonly manualText = signal('');

  readonly freeModel = computed(() => this.makeId() !== null && !this.isLoadingModels() && this.models().length === 0);

  readonly makeOptions = computed<SelectOption[]>(() => this.makes().map((m) => ({ value: m.id, label: m.name })));
  readonly modelOptions = computed<SelectOption[]>(() => this.models().map((m) => ({ value: m.id, label: m.name })));
  readonly yearOptions: SelectOption[] = Array.from(
    { length: new Date().getFullYear() + 1 - OLDEST_YEAR + 1 },
    (_, i) => {
      const y = new Date().getFullYear() + 1 - i;
      return { value: y, label: String(y) };
    },
  );

  ngOnInit(): void {
    this.vehicles.getMakes().subscribe({ next: (makes) => this.makes.set(makes), error: () => undefined });

    const v = this.value();
    if (!v) return;

    if (v.makeId != null) {
      this.makeId.set(v.makeId);
      this.year.set(v.year ?? null);
      this.modelText.set(v.modelText ?? '');
      this.loadModels(v.makeId, v.modelId ?? null);
    } else if (v.text?.trim()) {
      // Un vehículo escrito a mano antes de que hubiera selector: se conserva tal cual, editable.
      this.manual.set(true);
      this.manualText.set(v.text);
    }
  }

  onMakeChange(value: string | number | null): void {
    const id = value === null ? null : Number(value);
    this.makeId.set(id);
    // El modelo de otra marca no vale.
    this.modelId.set(null);
    this.modelText.set('');
    this.models.set([]);
    if (id !== null) this.loadModels(id, null);
    this.emit();
  }

  onModelChange(value: string | number | null): void {
    this.modelId.set(value === null ? null : Number(value));
    this.emit();
  }

  onModelTextChange(text: string): void {
    this.modelText.set(text);
    this.emit();
  }

  onYearChange(value: string | number | null): void {
    this.year.set(value === null ? null : Number(value));
    this.emit();
  }

  onManualText(text: string): void {
    this.manualText.set(text);
    this.emit();
  }

  /** Cambia entre elegir del catálogo y escribirlo a mano. Lo que ya había se conserva en su modo. */
  toggleManual(): void {
    this.manual.update((m) => !m);
    this.emit();
  }

  private loadModels(makeId: number, preselect: number | null): void {
    this.isLoadingModels.set(true);
    this.vehicles.getModels(makeId).subscribe({
      next: (models) => {
        // Si mientras llegaban cambiaron de marca, esta respuesta ya no vale.
        if (this.makeId() !== makeId) return;
        this.models.set(models);
        this.isLoadingModels.set(false);
        if (preselect !== null && models.some((m) => m.id === preselect)) this.modelId.set(preselect);
      },
      error: () => this.isLoadingModels.set(false),
    });
  }

  /** El texto del vehículo: "Toyota Corolla 2018", con lo que haya elegido hasta ahora. */
  private textNow(): string {
    if (this.manual()) return this.manualText().trim();
    const make = this.makes().find((m) => m.id === this.makeId())?.name;
    const model = this.models().find((m) => m.id === this.modelId())?.name ?? this.modelText().trim();
    return [make, model, this.year()].filter((p) => p !== undefined && p !== null && `${p}`.trim() !== '').join(' ');
  }

  private emit(): void {
    const manual = this.manual();
    this.changed.emit({
      text: this.textNow(),
      makeId: manual ? null : this.makeId(),
      modelId: manual ? null : this.modelId(),
      modelText: manual ? '' : this.modelText().trim(),
      year: manual ? null : this.year(),
    });
  }
}
