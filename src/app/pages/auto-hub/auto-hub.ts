import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoHubModel } from '../../../shared/models/auto-hub.model';
import { AutoHubService } from '../../../shared/services/auto-hub.service';
import { AutohubCard } from '../../../shared/components/autohub-card/autohub-card';
import { OfflineState } from '../../../shared/components/offline-state/offline-state';
import { OnlineService } from '../../../shared/services/online.service';
import { SeoService } from '../../../shared/services/seo.service';

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
  readonly searchQuery = signal('');

  /** Se recalcula solo cuando cambia el inventario o la búsqueda. */
  readonly filteredAutos = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();

    return this.allAutos().filter(
      (auto) =>
        query.length === 0 ||
        auto.brand.toLowerCase().includes(query) ||
        auto.model.toLowerCase().includes(query),
    );
  });

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
