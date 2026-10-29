import { Skeleton } from '../../../../../shared/ui/skeleton/skeleton';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminCatalogService } from '../../../../../shared/services/admin-catalog.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import { VehicleService } from '../../../../../shared/services/vehicle.service';
import { UnmatchedVehicleModel, VehicleMakeModel, VehicleModelModel } from '../../../../../shared/models/product.model';

/**
 * Marcas y modelos de vehículos, los que alimentan la compatibilidad de los
 * productos y el garaje de cada usuario.
 *
 * La semilla trae las ~35 marcas que se ven en RD y los modelos más comunes de
 * las diez primeras; **no** es un catálogo completo ni pretende serlo. Lo que
 * falte se agrega aquí, cuando un producto lo pida.
 *
 * Solo se crea: no hay renombrar ni borrar. Una marca o un modelo que ya está en
 * la compatibilidad de un producto o en el garaje de alguien no se puede mover
 * sin tocar esas filas, y para un error de escritura basta con agregar el bueno.
 */
@Component({
  selector: 'app-admin-marcas',
  imports: [FormsModule, Skeleton],
  templateUrl: './admin-marcas.html',
  styleUrl: './admin-marcas.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMarcas implements OnInit {
  private readonly vehicles = inject(VehicleService);
  private readonly catalog = inject(AdminCatalogService);
  private readonly toast = inject(ToastService);

  readonly makes = signal<VehicleMakeModel[]>([]);
  readonly models = signal<VehicleModelModel[]>([]);
  readonly isLoading = signal(true);
  readonly isLoadingModels = signal(false);

  /** La marca cuyos modelos se están viendo. */
  readonly selectedMakeId = signal<number | null>(null);
  readonly selectedMake = computed(
    () => this.makes().find((m) => m.id === this.selectedMakeId()) ?? null,
  );

  readonly newMakeName = signal('');
  readonly newModelName = signal('');
  readonly isSaving = signal(false);

  /** Modelos que los usuarios escribieron a mano, por marca y texto. */
  readonly unmatched = signal<UnmatchedVehicleModel[]>([]);
  /** La fila de `unmatched` que se está creando ahora (`marca|texto`). */
  readonly creatingKey = signal<string | null>(null);

  unmatchedKey(u: UnmatchedVehicleModel): string {
    return `${u.makeId}|${u.modelText.toLowerCase()}`;
  }

  /** "Crear modelo": lo agrega al catálogo y pasa los garajes que lo escribieron. */
  createFromText(u: UnmatchedVehicleModel): void {
    this.creatingKey.set(this.unmatchedKey(u));
    this.catalog.createModelFromText(u.makeId, u.modelText).subscribe({
      next: ({ model, migrated }) => {
        this.creatingKey.set(null);
        this.unmatched.update((l) => l.filter((x) => this.unmatchedKey(x) !== this.unmatchedKey(u)));
        if (this.selectedMakeId() === u.makeId) {
          this.models.update((l) =>
            l.some((m) => m.id === model.id) ? l : [...l, model].sort((a, b) => a.name.localeCompare(b.name, 'es')),
          );
        }
        this.toast.show(`${u.makeName} ${model.name} creado; ${migrated} garaje(s) actualizado(s).`);
      },
      error: (e: Error) => {
        this.creatingKey.set(null);
        this.toast.show(e.message, 'error');
      },
    });
  }

  ngOnInit(): void {
    this.catalog.getUnmatchedModels().subscribe({
      next: (list) => this.unmatched.set(list),
      // Sin permiso o sin red la lista simplemente no aparece.
      error: () => undefined,
    });

    this.vehicles.getMakes().subscribe({
      next: (list) => {
        this.makes.set(list);
        this.isLoading.set(false);
      },
      error: (e: Error) => {
        this.isLoading.set(false);
        this.toast.show(e.message, 'error');
      },
    });
  }

  selectMake(id: number | null): void {
    this.selectedMakeId.set(id);
    this.models.set([]);
    if (id === null) return;

    this.isLoadingModels.set(true);
    this.vehicles.getModels(id).subscribe({
      next: (list) => {
        this.models.set(list);
        this.isLoadingModels.set(false);
      },
      error: (e: Error) => {
        this.isLoadingModels.set(false);
        this.toast.show(e.message, 'error');
      },
    });
  }

  addMake(): void {
    const name = this.newMakeName().trim();
    if (!name) {
      this.toast.show('Escribe el nombre de la marca.', 'error');
      return;
    }

    this.isSaving.set(true);
    this.catalog.createMake(name).subscribe({
      next: (created) => {
        this.isSaving.set(false);
        this.makes.update((l) =>
          [...l, created].sort((a, b) => a.name.localeCompare(b.name, 'es')),
        );
        this.newMakeName.set('');
        this.selectMake(created.id);
        this.toast.show(`${created.name} agregada.`);
      },
      error: (e: Error) => {
        this.isSaving.set(false);
        this.toast.show(e.message, 'error');
      },
    });
  }

  addModel(): void {
    const make = this.selectedMake();
    const name = this.newModelName().trim();
    if (!make) return;
    if (!name) {
      this.toast.show('Escribe el nombre del modelo.', 'error');
      return;
    }

    this.isSaving.set(true);
    this.catalog.createModel(make.id, name).subscribe({
      next: (created) => {
        this.isSaving.set(false);
        this.models.update((l) =>
          [...l, created].sort((a, b) => a.name.localeCompare(b.name, 'es')),
        );
        this.newModelName.set('');
        this.toast.show(`${make.name} ${created.name} agregado.`);
      },
      error: (e: Error) => {
        this.isSaving.set(false);
        this.toast.show(e.message, 'error');
      },
    });
  }
}
