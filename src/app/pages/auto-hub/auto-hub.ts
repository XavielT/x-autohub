import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AutoHubModel } from '../../../shared/models/auto-hub.model';
import { AutoHubService } from '../../../shared/services/auto-hub.service';
import { AutohubCard } from '../../../shared/components/autohub-card/autohub-card';
import { OfflineState } from '../../../shared/components/offline-state/offline-state';
import { OnlineService } from '../../../shared/services/online.service';
import { SeoService } from '../../../shared/services/seo.service';
import {
  AutoHubFilters, AutoHubSort, CHASIS_LABELS, EMPTY_AUTO_HUB_FILTERS, FUEL_LABELS, SORT_LABELS, TRACTION_LABELS,
  AUTO_HUB_PARAM_KEYS, activeAutoHubFilters, autoHubFiltersFromParams, autoHubFiltersToParams, filterAutoHub,
} from '../../../shared/utils/auto-hub-filters';

import { SearchableSelect, SelectOption } from '../../../shared/ui/searchable-select/searchable-select';
import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
@Component({
  selector: 'app-auto-hub',
  imports: [Skeleton, FormsModule, AutohubCard, OfflineState, SearchableSelect],
  templateUrl: './auto-hub.html',
  styleUrl: './auto-hub.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutoHub implements OnInit {
  private readonly autoHubService = inject(AutoHubService);
  private readonly seo = inject(SeoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.seo.reset());

    // La búsqueda queda en la URL (`?tipo=suv&precio=900000`) para poder compartirla. Solo en el
    // navegador: el prerenderizado no tiene filtros y no debe navegar.
    effect(() => {
      const params = autoHubFiltersToParams(this.filters());
      if (!this.isBrowser) return;
      // `merge` con nulos: se quitan los filtros que ya no están, pero no se pisan otros parámetros del enlace (utm_…).
      const queryParams: Record<string, string | null> = Object.fromEntries(AUTO_HUB_PARAM_KEYS.map((k) => [k, null]));
      Object.assign(queryParams, params);
      void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
    });
  }

  private readonly allAutos = signal<AutoHubModel[]>([]);

  protected readonly online = inject(OnlineService);

  /**
   * La tarjeta cuya foto carga con prioridad (LCP): la primera que se pinta. Se fija **una vez**, al llegar los
   * datos, y por id: `NgOptimizedImage` no admite que `priority` cambie después (NG02953), y con filtros u
   * orden la primera de la lista cambia.
   */
  protected readonly priorityId = signal<number | null>(null);

  readonly isLoading = signal(true);
  readonly hasError = signal(false);
  /** Arranca con lo que traiga la URL (un enlace compartido); sin parámetros, sin filtros. */
  readonly filters = signal<AutoHubFilters>(
    autoHubFiltersFromParams((key) => this.route.snapshot.queryParamMap.get(key)),
  );
  /** El panel empieza cerrado, salvo que el enlace traiga filtros: así se ven aplicados. */
  readonly filtersOpen = signal(activeAutoHubFilters(this.filters()) > 0);

  protected readonly chasisOptions = Object.entries(CHASIS_LABELS);
  protected readonly fuelOptions = Object.entries(FUEL_LABELS);
  protected readonly tractionOptions = Object.entries(TRACTION_LABELS);
  protected readonly sortOptions = Object.entries(SORT_LABELS);

  private static toSelect(entries: [string, string][], all?: string): SelectOption[] {
    const options = entries.map(([value, label]) => ({ value, label }));
    return all ? [{ value: '', label: all }, ...options] : options;
  }

  protected readonly chasisSelect = AutoHub.toSelect(this.chasisOptions, 'Todos');
  protected readonly fuelSelect = AutoHub.toSelect(this.fuelOptions, 'Todos');
  protected readonly tractionSelect = AutoHub.toSelect(this.tractionOptions, 'Todas');
  protected readonly sortSelect = AutoHub.toSelect(this.sortOptions);

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
      title: 'Auto Hub — Vehículos verificados | X AutoHub',
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
        this.priorityId.set(filterAutoHub(autos, this.filters())[0]?.id ?? null);
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
