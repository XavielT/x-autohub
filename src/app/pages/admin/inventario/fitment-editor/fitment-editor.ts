import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, model, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FitmentDraft } from '../../../../../shared/models/admin-inventory.model';
import { VehicleMakeModel, VehicleModelModel } from '../../../../../shared/models/product.model';
import { VehicleService } from '../../../../../shared/services/vehicle.service';
import { slugify } from '../../../../../shared/utils/slugify';

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

/**
 * La lista de vehículos a los que sirve un producto `specific`.
 *
 * Cada fila es una marca, opcionalmente un modelo, y opcionalmente un rango de
 * años: "Toyota Corolla 2010–2020", "Honda (todos los modelos)". La marca y el
 * modelo se escriben con autocompletado y deben existir en la base; si no está,
 * se agrega primero en la pestaña "Marcas y modelos".
 *
 * La lista es un `model()`: el formulario padre la lee y la guarda con el
 * producto (`AdminCatalogService.replaceFitments`). Este componente no guarda
 * nada por su cuenta.
 */
@Component({
  selector: 'app-fitment-editor',
  imports: [FormsModule],
  templateUrl: './fitment-editor.html',
  styleUrl: './fitment-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FitmentEditor implements OnInit {
  private readonly vehicles = inject(VehicleService);

  readonly fitments = model<FitmentDraft[]>([]);

  readonly makes = signal<VehicleMakeModel[]>([]);
  /** Los modelos de cada marca, cargados la primera vez que hacen falta. */
  readonly modelsByMake = signal<Record<number, VehicleModelModel[]>>({});

  readonly makeName = signal('');
  readonly modelName = signal('');
  readonly yearFrom = signal<number | null>(null);
  readonly yearTo = signal<number | null>(null);
  readonly error = signal('');

  /** La marca que coincide con lo escrito, sin distinguir mayúsculas ni acentos. */
  readonly selectedMake = computed(() => {
    const typed = slugify(this.makeName());
    return typed ? (this.makes().find((m) => slugify(m.name) === typed) ?? null) : null;
  });

  readonly modelsOfSelected = computed(() => {
    const make = this.selectedMake();
    return make ? (this.modelsByMake()[make.id] ?? []) : [];
  });

  constructor() {
    // Los modelos de la marca elegida, y los de las marcas que ya traen las filas
    // (para poder escribir "Corolla" y no un número en cada una).
    effect(() => {
      const ids = new Set<number>(this.fitments().map((f) => f.makeId));
      const selected = this.selectedMake();
      if (selected) ids.add(selected.id);
      untracked(() => ids.forEach((id) => this.loadModels(id)));
    });
  }

  ngOnInit(): void {
    this.vehicles.getMakes().subscribe({
      next: (makes) => this.makes.set(makes),
      error: () => this.error.set('No pudimos cargar las marcas.'),
    });
  }

  private loadModels(makeId: number): void {
    if (this.modelsByMake()[makeId]) return;
    // Se anota una lista vacía de inmediato para no pedirla dos veces mientras llega.
    this.modelsByMake.update((all) => ({ ...all, [makeId]: [] }));
    this.vehicles.getModels(makeId).subscribe({
      next: (models) => this.modelsByMake.update((all) => ({ ...all, [makeId]: models })),
      error: () => this.error.set('No pudimos cargar los modelos.'),
    });
  }

  label(f: FitmentDraft): string {
    const make = this.makes().find((m) => m.id === f.makeId)?.name ?? 'Marca';
    const model =
      f.modelId === null
        ? 'todos los modelos'
        : (this.modelsByMake()[f.makeId]?.find((m) => m.id === f.modelId)?.name ?? 'modelo');
    return `${make} · ${model} · ${this.yearsLabel(f)}`;
  }

  private yearsLabel(f: FitmentDraft): string {
    if (f.yearFrom !== null && f.yearTo !== null) {
      return f.yearFrom === f.yearTo ? `${f.yearFrom}` : `${f.yearFrom}–${f.yearTo}`;
    }
    if (f.yearFrom !== null) return `desde ${f.yearFrom}`;
    if (f.yearTo !== null) return `hasta ${f.yearTo}`;
    return 'todos los años';
  }

  add(): void {
    const make = this.selectedMake();
    if (!make) {
      this.error.set('Elige una marca de la lista. Si no esta, agregala en "Marcas y modelos".');
      return;
    }

    let modelId: number | null = null;
    const typedModel = slugify(this.modelName());
    if (typedModel) {
      const model = this.modelsOfSelected().find((m) => slugify(m.name) === typedModel);
      if (!model) {
        this.error.set(`${make.name} no tiene ese modelo. Agregalo en "Marcas y modelos" o deja el campo vacio.`);
        return;
      }
      modelId = model.id;
    }

    const from = this.yearFrom();
    const to = this.yearTo();
    for (const year of [from, to]) {
      if (year !== null && (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR)) {
        this.error.set(`Los anos van entre ${MIN_YEAR} y ${MAX_YEAR}.`);
        return;
      }
    }
    if (from !== null && to !== null && from > to) {
      this.error.set('El ano inicial no puede ser mayor que el final.');
      return;
    }

    const next: FitmentDraft = { makeId: make.id, modelId, yearFrom: from, yearTo: to };
    const exists = this.fitments().some(
      (f) =>
        f.makeId === next.makeId &&
        f.modelId === next.modelId &&
        f.yearFrom === next.yearFrom &&
        f.yearTo === next.yearTo,
    );
    if (exists) {
      this.error.set('Esa compatibilidad ya esta en la lista.');
      return;
    }

    this.fitments.update((list) => [...list, next]);
    this.error.set('');
    this.modelName.set('');
    this.yearFrom.set(null);
    this.yearTo.set(null);
  }

  remove(index: number): void {
    this.fitments.update((list) => list.filter((_, i) => i !== index));
  }

  /** Los años llegan de un `<input type="number">` como número o como vacío. */
  parseYear(value: number | string | null): number | null {
    if (value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
}
