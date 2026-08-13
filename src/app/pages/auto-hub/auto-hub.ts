import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoHubModel } from '../../../shared/models/auto-hub.model';
import { AutoHubService } from '../../../shared/services/auto-hub.service';
import { AutohubCard } from '../../../shared/components/autohub-card/autohub-card';

@Component({
  selector: 'app-auto-hub',
  imports: [FormsModule, AutohubCard],
  templateUrl: './auto-hub.html',
  styleUrl: './auto-hub.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutoHub implements OnInit {
  private readonly autoHubService = inject(AutoHubService);

  private readonly allAutos = signal<AutoHubModel[]>([]);

  readonly isLoading = signal(true);
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
    this.autoHubService.getAll().subscribe({
      next: (autos) => {
        this.allAutos.set(autos);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }
}
