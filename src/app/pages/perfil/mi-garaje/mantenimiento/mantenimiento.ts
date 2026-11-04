import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ProfileVehicleModel } from '../../../../../shared/models/product.model';
import { GuideResult, MaintenanceItem, MaintenanceService, intervalText } from '../../../../../shared/services/maintenance.service';
import { ServiceCatalogService } from '../../../../../shared/services/service-catalog.service';
import { ToastService } from '../../../../../shared/services/toast.service';
import { VehicleService } from '../../../../../shared/services/vehicle.service';

const GUIDE_MESSAGES: Record<Exclude<GuideResult, 'ok'>, string> = {
  sin_modelo: 'Para armar la guía hace falta elegir el modelo de la lista (no escrito a mano).',
  no_disponible: 'No pudimos armar la guía ahora. Inténtalo más tarde.',
};

/**
 * La tarjeta de mantenimiento de un vehículo del garaje (migración 0058): lo próximo a vencer, "Registrar servicio hecho", "Ver productos para esto" (lleva a la
 * tienda con el vehículo y la categoría ya filtrados) y "Agendar" (con el servicio ya elegido). La guía general la arma la IA una sola vez por vehículo y, mientras
 * nadie la revise, se rotula como tal. Los recordatorios son opcionales y nacen apagados.
 */
@Component({
  selector: 'app-mantenimiento',
  imports: [DatePipe, DecimalPipe, RouterLink],
  templateUrl: './mantenimiento.html',
  styleUrl: './mantenimiento.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Mantenimiento implements OnInit {
  private readonly maintenance = inject(MaintenanceService);
  private readonly vehicles = inject(VehicleService);
  private readonly catalog = inject(ServiceCatalogService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly vehicle = input.required<ProfileVehicleModel>();
  readonly label = input.required<string>();

  readonly items = signal<MaintenanceItem[]>([]);
  readonly isLoading = signal(true);
  readonly isBuilding = signal(false);
  readonly reviewed = signal<boolean | null>(null);
  readonly odometer = signal('');
  readonly reminders = signal(false);
  /** El renglón al que se le está registrando "hecho", y lo que se escribe. */
  readonly doingId = signal<number | null>(null);
  readonly doneDate = signal('');
  readonly doneKm = signal('');
  readonly busy = signal(false);
  readonly serviceIds = signal<Record<string, number>>({});

  readonly today = new Date().toISOString().slice(0, 10);
  readonly hasGuide = computed(() => this.items().length > 0);
  /** La guía viene de la IA y nadie la ha revisado. */
  readonly showAiNote = computed(() => this.items().some((i) => i.source === 'ia') && this.reviewed() !== true);

  readonly interval = intervalText;

  ngOnInit(): void {
    const v = this.vehicle();
    this.odometer.set(v.odometerKm != null ? String(v.odometerKm) : '');
    this.reminders.set(v.maintenanceReminders === true);
    this.catalog.getServices().subscribe({
      next: (services) => this.serviceIds.set(Object.fromEntries(services.filter((s) => s.slug).map((s) => [s.slug, s.id]))),
      error: () => undefined,
    });
    this.load();
  }

  private load(): void {
    this.maintenance.getItems(this.vehicle().id).subscribe({
      next: (items) => {
        this.items.set(items);
        this.isLoading.set(false);
        if (items.length > 0) this.maintenance.getTemplateReviewed(this.vehicle()).subscribe((r) => this.reviewed.set(r));
      },
      error: () => this.isLoading.set(false),
    });
  }

  build(): void {
    if (this.isBuilding()) return;
    this.isBuilding.set(true);
    this.maintenance.createGuide(this.vehicle().id).subscribe((result) => {
      this.isBuilding.set(false);
      if (result !== 'ok') return void this.toast.show(GUIDE_MESSAGES[result], 'error');
      this.load();
    });
  }

  saveOdometer(): void {
    const km = Number(this.odometer().replace(/[^\d]/g, ''));
    if (!Number.isFinite(km) || this.odometer().trim() === '') return void this.toast.show('Escribe el kilometraje de tu vehículo.', 'error');
    this.run(this.maintenance.setOdometer(this.vehicle().id, km), 'Kilometraje guardado.');
  }

  toggleReminders(): void {
    const next = !this.reminders();
    this.reminders.set(next);
    this.maintenance.setReminders(this.vehicle().id, next).subscribe({
      error: (e: Error) => {
        this.reminders.set(!next);
        this.toast.show(e.message, 'error');
      },
    });
  }

  startDone(item: MaintenanceItem): void {
    this.doingId.set(this.doingId() === item.id ? null : item.id);
    this.doneDate.set(this.today);
    this.doneKm.set(this.odometer());
  }

  confirmDone(item: MaintenanceItem): void {
    const km = this.doneKm().trim() === '' ? undefined : Number(this.doneKm().replace(/[^\d]/g, ''));
    this.run(this.maintenance.logDone(item.id, this.doneDate() || undefined, km), `Registrado: ${item.label}.`, () => this.doingId.set(null));
  }

  remove(item: MaintenanceItem): void {
    this.run(this.maintenance.remove(item.id), 'Quitado de la guía.');
  }

  /** "Ver productos para esto": deja elegido este vehículo y abre la categoría de la tienda (el filtro de compatibilidad ya viene puesto). */
  viewProducts(item: MaintenanceItem): void {
    const v = this.vehicle();
    if (!item.categorySlug || v.modelId === null) return;
    this.vehicles.select({ makeId: v.makeId, modelId: v.modelId, year: v.year });
    void this.router.navigate(['/tienda', 'c', item.categorySlug]);
  }

  /** El enlace de "Agendar", con el servicio ya elegido. `null` si el renglón no tiene un servicio del taller. */
  scheduleLink(item: MaintenanceItem): { service: number } | null {
    const id = item.serviceSlug ? this.serviceIds()[item.serviceSlug] : undefined;
    return id ? { service: id } : null;
  }

  statusText(item: MaintenanceItem): string {
    return item.status === 'vencido' ? 'Vencido' : item.status === 'pronto' ? 'Pronto' : 'Al día';
  }

  private run(source: import('rxjs').Observable<void>, message: string, after?: () => void): void {
    if (this.busy()) return;
    this.busy.set(true);
    source.subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show(message);
        after?.();
        this.load();
      },
      error: (e: Error) => {
        this.busy.set(false);
        this.toast.show(e.message, 'error');
      },
    });
  }
}
