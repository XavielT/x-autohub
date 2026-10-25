import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoHubModel } from '../../../shared/models/auto-hub.model';
import { AutoHubService } from '../../../shared/services/auto-hub.service';
import { AutohubCard } from '../../../shared/components/autohub-card/autohub-card';
import { OfflineState } from '../../../shared/components/offline-state/offline-state';
import { OnlineService } from '../../../shared/services/online.service';
import { SeoService } from '../../../shared/services/seo.service';
import {
  AutoHubFilters, AutoHubSort, CHASIS_LABELS, EMPTY_AUTO_HUB_FILTERS, FUEL_LABELS, SORT_LABELS, TRACTION_LABELS,
  activeAutoHubFilters, filterAutoHub,
} from '../../../shared/utils/auto-hub-filters';

@Component({
  selector: 'app-auto-hub',
  imports: [FormsModule, AutohubCard, OfflineState],
  templateUrl: './auto-hub.html',
  styleUrl: './auto-hub.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutoHub implements OnInit {
  private readonly autoHubService = inject(AutoHubService);
  private readonly seo = inject(SeoService);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.seo.reset());
  }

  private readonly allAutos = signal<AutoHubModel[]>([]);

  protected readonly online = inject(OnlineService);

  readonly isLoading = signal(true);
  readonly hasError = signal(false);
  readonly filters = signal<AutoHubFilters>(EMPTY_AUTO_HUB_FILTERS);
  /** Los filtros avanzados empiezan cerrados; el botón dice cuántos hay puestos. */
  readonly filtersOpen = signal(false);

  protected readonly chasisOptions = Object.entries(CHASIS_LABELS);
  protected readonly fuelOptions = Object.entries(FUEL_LABELS);
  protected readonly tractionOptions = Object.entries(TRACTION_LABELS);
  protected readonly sortOptions = Object.entries(SORT_LABELS);

  /** Se recalcula solo cuando cambia el inventario o los filtros. */
  readonly filteredAutos = computed(() => filterAutoHub(this.allAutos(), this.filters()));
  readonly activeCount = computed(() => activeAutoHubFilters(this.filters()));
  readonly isFiltered = computed(() => this.activeCount() > 0 || this.filters().query.trim() !== '');

  /** Cambia un solo filtro. */
  set<K extends keyof AutoHubFilters>(key: K, value: AutoHubFilters[K]): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
  }

  /** El número que escribió el visitante, o null si el campo quedó vacío. */
  setNumber(key: 'maxPrice' | 'minYear' | 'maxMileage', value: number | string | null): void {
    const n = value === null || value === '' ? null : Number(value);
    this.set(key, n !== null && Number.isFinite(n) ? n : null);
  }

  setSort(value: string): void {
    this.set('sort', value as AutoHubSort);
  }

  clearFilters(): void {
    this.filters.set(EMPTY_AUTO_HUB_FILTERS);
  }

  ngOnInit(): void {
    // El mismo título que la ruta; lo que aporta es la descripción y la vista previa al compartir el enlace.
    this.seo.set({
      title: 'Auto Hub — Vehiculos verificados | X AutoHub',
      description:
        'Vehículos verificados por X AutoHub: revisados por el equipo, con fotos, precio y kilometraje. Mira el inventario en República Dominicana.',
      path: '/auto-hub',
    });
    this.load();
  }

  /** También es el "Reintentar" del estado sin conexión. */
  load(): void {
    this.hasError.set(false);
    this.isLoading.set(true);

    this.autoHubService.getAll().subscribe({
      next: (autos) => {
        this.allAutos.set(autos);
        this.isLoading.set(false);
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }
}
