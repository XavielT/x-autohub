import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { VehicleMakeModel, VehicleModelModel } from '../../models/product.model';
import { VehicleSelection } from '../../models/business-document.model';
import { VehicleService } from '../../services/vehicle.service';
import { SearchableSelect, SelectOption, normalizeSearch } from '../../ui/searchable-select/searchable-select';

/** El año más viejo que se ofrece (igual que el selector de vehículo del sitio). */
const OLDEST_YEAR = 1990;

/**
 * Marca → modelo → año, del mismo catálogo que usa el selector "Elige tu vehículo" del sitio.
 *
 * A diferencia de `app-vehicle-form`, no está atado al vehículo elegido por el visitante ni tiene botón: cada cambio
 * se avisa con `changed`, con el texto ya armado ("Toyota Corolla 2018"), la marca y el modelo **por separado**
 * (`makeName`, `modelName`) y los ids del catálogo. Quien lo usa guarda lo que necesite: clientes y documentos del
 * panel, la ficha de Auto Hub, publicar en Hub Market.
 *
 * Si el vehículo no está en el catálogo, se escribe a mano (marca y modelo, más el año de la lista).
 *
 * Arranca con lo que traiga `value`: los ids si los hay; si solo trae nombres (un vehículo guardado antes de que
 * hubiera selector), los busca en el catálogo y, si no los encuentra, los deja escritos a mano sin perder nada.
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
  /** El modelo escrito, cuando la marca del catálogo no tiene modelos cargados. */
  readonly modelText = signal('');
  readonly year = signal<number | null>(null);

  /** Se escribe a mano (un vehículo que no está en el catálogo). */
  readonly manual = signal(false);
  readonly manualMake = signal('');
  readonly manualModel = signal('');

  readonly freeModel = computed(() => this.makeId() !== null && !this.isLoadingModels() && this.models().length === 0);

  readonly makeOptions = computed<SelectOption[]>(() => this.makes().map((m) => ({ value: m.id, label: m.name })));
  readonly modelOptions = computed<SelectOption[]>(() => this.models().map((m) => ({ value: m.id, label: m.name })));

  /** De este año más uno hasta 1990; si el vehículo trae un año fuera de ese rango, se agrega para no perderlo. */
  readonly yearOptions = computed<SelectOption[]>(() => {
    const top = new Date().getFullYear() + 1;
    const years = Array.from({ length: top - OLDEST_YEAR + 1 }, (_, i) => top - i);
    const current = this.year();
    if (current !== null && !years.includes(current)) years.push(current);
    return years.sort((a, b) => b - a).map((y) => ({ value: y, label: String(y) }));
  });

  ngOnInit(): void {
    const v = this.value();
    this.year.set(v?.year ?? null);

    this.vehicles.getMakes().subscribe({
      next: (makes) => {
        this.makes.set(makes);
        this.hydrate(v);
      },
      error: () => this.hydrate(v),
    });
  }

  /** Pone lo que ya traía el vehículo: por ids, por nombres del catálogo o, si no hay forma, a mano. */
  private hydrate(v: Partial<VehicleSelection> | null): void {
    if (!v) return;

    if (v.makeId != null) {
      this.makeId.set(v.makeId);
      this.modelText.set(v.modelText ?? '');
      this.loadModels(v.makeId, { modelId: v.modelId ?? null, modelName: v.modelName ?? null });
      return;
    }

    const makeName = (v.makeName ?? '').trim();
    const modelName = (v.modelName ?? '').trim();

    if (makeName) {
      const make = this.makes().find((m) => normalizeSearch(m.name) === normalizeSearch(makeName));
      if (make) {
        this.makeId.set(make.id);
        this.loadModels(make.id, { modelId: null, modelName });
        return;
      }
      this.setManual(makeName, modelName);
    } else if (modelName || v.text?.trim()) {
      // Solo un texto (un vehículo escrito a mano antes de que hubiera selector): se conserva tal cual, editable.
      this.setManual('', modelName || (v.text ?? '').trim());
    }
  }

  private setManual(make: string, model: string): void {
    this.manual.set(true);
    this.manualMake.set(make);
    this.manualModel.set(model);
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
    // Elegir uno del catálogo reemplaza al modelo propio que hubiera escrito antes.
    if (value !== null) this.modelText.set('');
    this.emit();
  }

  /** Un modelo que el catálogo no trae (un código como «TFS55H-20»): se usa tal cual, con la marca del catálogo. */
  onModelCustom(text: string): void {
    this.modelId.set(null);
    this.modelText.set(text.trim());
    this.emit();
  }

  /** Una marca que el catálogo no trae: pasa a escribirse a mano (marca y modelo). */
  onMakeCustom(text: string): void {
    this.makeId.set(null);
    this.modelId.set(null);
    this.modelText.set('');
    this.models.set([]);
    this.setManual(text.trim(), '');
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

  onManualMake(text: string): void {
    this.manualMake.set(text);
    this.emit();
  }

  onManualModel(text: string): void {
    this.manualModel.set(text);
    this.emit();
  }

  /** Cambia entre elegir del catálogo y escribirlo a mano. Lo que ya había se conserva en su modo. */
  toggleManual(): void {
    this.manual.update((m) => !m);
    this.emit();
  }

  /**
   * Carga los modelos de la marca y, si venía uno elegido, lo selecciona: por id o por nombre. Si la marca está en el
   * catálogo pero ese modelo no, queda como modelo propio (`modelText`) para no perderlo.
   */
  private loadModels(makeId: number, preselect: { modelId: number | null; modelName: string | null } | null): void {
    this.isLoadingModels.set(true);
    this.vehicles.getModels(makeId).subscribe({
      next: (models) => {
        // Si mientras llegaban cambiaron de marca, esta respuesta ya no vale.
        if (this.makeId() !== makeId) return;
        this.models.set(models);
        this.isLoadingModels.set(false);
        if (!preselect) return;

        const byId = preselect.modelId !== null ? models.find((m) => m.id === preselect.modelId) : undefined;
        const name = (preselect.modelName ?? '').trim();
        const byName = name ? models.find((m) => normalizeSearch(m.name) === normalizeSearch(name)) : undefined;
        const found = byId ?? byName;

        // Si la marca está en el catálogo pero ese modelo no, se conserva como modelo propio.
        if (found) this.modelId.set(found.id);
        else if (name) this.modelText.set(name);
      },
      error: () => this.isLoadingModels.set(false),
    });
  }

  private emit(): void {
    const manual = this.manual();
    const makeName = manual ? this.manualMake().trim() : (this.makes().find((m) => m.id === this.makeId())?.name ?? '');
    const modelName = manual
      ? this.manualModel().trim()
      : (this.models().find((m) => m.id === this.modelId())?.name ?? this.modelText().trim());
    const year = this.year();

    this.changed.emit({
      text: [makeName, modelName, year].filter((p) => p !== null && `${p}`.trim() !== '').join(' '),
      makeName,
      modelName,
      makeId: manual ? null : this.makeId(),
      modelId: manual ? null : this.modelId(),
      modelText: manual ? '' : this.modelText().trim(),
      year,
    });
  }
}
