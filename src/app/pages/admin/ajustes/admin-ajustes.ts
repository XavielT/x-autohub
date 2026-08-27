import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { SiteSettingsService, StatsMode } from '../../../../shared/services/site-settings.service';
import { StatsService } from '../../../../shared/services/stats.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { SiteStats } from '../../../../shared/models/site-stats.model';
import { SHOWCASE_DISPLAY } from '../../../../shared/data/showcase-stats';
import { compactNumber } from '../../../../shared/utils/compact-number';

/** Una fila de la comparación: la misma métrica en los dos modos. */
interface StatRow {
  label: string;
  showcase: string;
  real: string;
}

const ROWS: { key: keyof SiteStats; label: string }[] = [
  { key: 'vehicles', label: 'Vehiculos' },
  { key: 'parts', label: 'Piezas' },
  { key: 'members', label: 'Miembros' },
];

/**
 * Ajustes del sitio. Hoy uno: qué números muestra el contador del home.
 *
 * La sección enseña **los dos modos con sus números al lado** a propósito. El
 * interruptor cambia lo que ve todo el que entra al sitio, incluido quien no
 * tiene sesión; decidir eso a ciegas ("real" ¿es 6 o es 300?) es cómo se acaba
 * dejando la portada peor de lo que estaba sin querer.
 */
@Component({
  selector: 'app-admin-ajustes',
  imports: [],
  templateUrl: './admin-ajustes.html',
  styleUrl: './admin-ajustes.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAjustes implements OnInit {
  private readonly settings = inject(SiteSettingsService);
  private readonly stats = inject(StatsService);
  private readonly toast = inject(ToastService);

  readonly mode = signal<StatsMode | null>(null);
  readonly isSaving = signal(false);

  private readonly siteStats = signal<SiteStats | null>(null);

  readonly rows = computed<StatRow[]>(() => {
    const stats = this.siteStats();

    return ROWS.map(({ key, label }) => ({
      label,
      showcase: SHOWCASE_DISPLAY[key],
      real: stats ? compactNumber(stats[key]) : '…',
    }));
  });

  /** Los conteos exactos, para la línea de detalle. */
  readonly exactCounts = computed(() => {
    const stats = this.siteStats();
    if (!stats) return null;

    return `${stats.vehicles} vehiculo(s) · ${stats.parts} pieza(s) · ${stats.members} cuenta(s)`;
  });

  ngOnInit(): void {
    this.settings.getStatsMode().subscribe({
      next: (mode) => this.mode.set(mode),
      error: () => this.toast.show('No pudimos leer el ajuste actual.', 'error'),
    });

    // Los conteos se piden siempre, esté el sitio en el modo que esté: la
    // gracia del panel es ver qué pasaría al cambiar.
    this.stats.getSiteStats().subscribe({
      next: (stats) => this.siteStats.set(stats),
      error: () => this.toast.show('No pudimos leer los conteos reales.', 'error'),
    });
  }

  choose(mode: StatsMode): void {
    if (this.mode() === mode || this.isSaving()) return;

    this.isSaving.set(true);
    const previous = this.mode();

    // Optimista, y con vuelta atrás si falla: el clic tiene que sentirse
    // inmediato, pero dejar el botón marcado cuando la base lo rechazó (un
    // moderador colándose por la URL, por ejemplo) sería mentir.
    this.mode.set(mode);

    this.settings.setStatsMode(mode).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toast.show(
          mode === 'real'
            ? 'El home ya muestra los numeros reales.'
            : 'El home ya muestra los numeros de impresion.',
        );
      },
      error: (err: unknown) => {
        this.mode.set(previous);
        this.isSaving.set(false);
        this.toast.show('No pudimos guardar el ajuste.', 'error');
        console.error(err);
      },
    });
  }
}
