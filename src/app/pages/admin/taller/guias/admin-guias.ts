import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { MaintenanceService, MaintenanceTemplate, intervalText } from '../../../../../shared/services/maintenance.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import { VehicleService } from '../../../../../shared/services/vehicle.service';
import { Skeleton } from '../../../../../shared/ui/skeleton/skeleton';

interface Row {
  template: MaintenanceTemplate;
  name: string;
}

/**
 * /admin/taller/guias — "Plantillas por revisar" (migración 0058): las guías generales de mantenimiento que la IA armó y nadie ha revisado. Mientras no se revisan,
 * la persona las ve rotuladas como "generada con IA". Aquí un admin las lee, las marca como revisadas o las borra (la siguiente persona con ese vehículo dispara una
 * nueva). La guía solo trae intervalos y nombres de tareas: ningún dato técnico fino.
 */
@Component({
  selector: 'app-admin-guias',
  imports: [Skeleton],
  templateUrl: './admin-guias.html',
  styleUrl: './admin-guias.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminGuias implements OnInit {
  private readonly maintenance = inject(MaintenanceService);
  private readonly vehicles = inject(VehicleService);
  private readonly toast = inject(ToastService);

  readonly rows = signal<Row[]>([]);
  readonly isLoading = signal(true);
  readonly busyId = signal<number | null>(null);
  readonly interval = (it: { every_km: number | null; every_months: number | null }) => intervalText({ everyKm: it.every_km, everyMonths: it.every_months });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.maintenance.getPendingTemplates().subscribe({
      next: (templates) => {
        const makeIds = [...new Set(templates.map((t) => t.makeId))];
        if (templates.length === 0) {
          this.rows.set([]);
          return void this.isLoading.set(false);
        }
        forkJoin({ makes: this.vehicles.getMakes(), models: forkJoin(makeIds.map((id) => this.vehicles.getModels(id))) }).subscribe({
          next: ({ makes, models }) => {
            const all = models.flat();
            this.rows.set(
              templates.map((template) => ({
                template,
                name: `${makes.find((m) => m.id === template.makeId)?.name ?? 'Marca'} ${all.find((m) => m.id === template.modelId)?.name ?? 'modelo'} ${template.yearFrom}–${template.yearTo}`,
              })),
            );
            this.isLoading.set(false);
          },
          error: () => {
            this.rows.set(templates.map((template) => ({ template, name: `Guía ${template.yearFrom}–${template.yearTo}` })));
            this.isLoading.set(false);
          },
        });
      },
      error: (e: Error) => {
        this.isLoading.set(false);
        this.toast.show(e.message, 'error');
      },
    });
  }

  review(row: Row): void {
    this.act(row, this.maintenance.markReviewed(row.template.id), 'Guía marcada como revisada.');
  }

  remove(row: Row): void {
    this.act(row, this.maintenance.deleteTemplate(row.template.id), 'Guía borrada. Se arma una nueva cuando alguien la pida.');
  }

  private act(row: Row, source: import('rxjs').Observable<void>, message: string): void {
    if (this.busyId() !== null) return;
    this.busyId.set(row.template.id);
    source.subscribe({
      next: () => {
        this.busyId.set(null);
        this.rows.update((all) => all.filter((r) => r.template.id !== row.template.id));
        this.toast.show(message);
      },
      error: (e: Error) => {
        this.busyId.set(null);
        this.toast.show(e.message, 'error');
      },
    });
  }
}
