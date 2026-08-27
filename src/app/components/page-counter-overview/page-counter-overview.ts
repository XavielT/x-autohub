import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';
import { SiteSettingsService } from '../../../shared/services/site-settings.service';
import { StatsService } from '../../../shared/services/stats.service';
import { SiteStats } from '../../../shared/models/site-stats.model';
import { SHOWCASE_DISPLAY } from '../../../shared/data/showcase-stats';
import { compactNumber } from '../../../shared/utils/compact-number';

/** Una de las tres celdas de la fila. */
interface Counter {
  value: string;
  label: string;
  caption: string;
}

/** Las etiquetas, que son las mismas en los dos modos. */
const LABELS: Record<keyof SiteStats, { label: string; caption: string }> = {
  vehicles: { label: 'Vehiculos', caption: 'Listados activos' },
  parts: { label: 'Piezas', caption: 'Catalogo de Alta Calidad' },
  members: { label: 'Miembros', caption: 'Comunidad Activa' },
};

/**
 * La fila de contadores del home.
 *
 * Era HTML escrito a mano: "280+ Vehiculos", "1.3K Piezas", "2.8K Miembros",
 * con el sitio teniendo 6 vehículos. Ahora los números salen de la base, y qué
 * se muestra lo decide el ajuste `stats_mode` que un admin cambia en
 * /admin/ajustes:
 *
 *   showcase → las cadenas de siempre (`SHOWCASE_DISPLAY`), tal cual.
 *   real     → los conteos de `get_site_stats()`, en formato compacto.
 *
 * El diseño no cambia: mismas clases, mismas etiquetas, mismo hueco.
 */
@Component({
  selector: 'app-page-counter-overview',
  imports: [],
  templateUrl: './page-counter-overview.html',
  styleUrl: './page-counter-overview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageCounterOverview {
  private readonly settings = inject(SiteSettingsService);
  private readonly stats = inject(StatsService);

  /**
   * El modo, y los conteos **solo si hacen falta**.
   *
   * En `showcase` no se llama a `get_site_stats()`: mientras el interruptor esté
   * ahí —que es el estado por defecto— cada visitante anónimo se ahorra una RPC
   * para pintar tres números que no dependen de la base.
   *
   * Si algo falla se cae a `showcase` en vez de dejar el hueco vacío. Es la
   * lección de la ronda 14 puesta en código: una consulta nueva puede fallar
   * solo en producción (allí fue un `PGRST201`), y cuando eso pase la portada
   * del sitio tiene que seguir enseñando algo.
   */
  private readonly view = toSignal(
    this.settings.getStatsMode().pipe(
      switchMap((mode) =>
        mode === 'real'
          ? this.stats.getSiteStats().pipe(map((stats) => ({ mode, stats })))
          : of({ mode, stats: null as SiteStats | null }),
      ),
      catchError((error: unknown) => {
        console.warn('[contadores] no se pudieron leer; se muestran los de impresion', error);
        return of({ mode: 'showcase' as const, stats: null as SiteStats | null });
      }),
    ),
    { initialValue: null },
  );

  /**
   * `null` mientras no se sepa qué pintar. La plantilla no dibuja nada en ese
   * rato: enseñar los números de impresión y cambiarlos medio segundo después
   * por los reales se ve como un error del sitio.
   */
  readonly counters = computed<Counter[] | null>(() => {
    const view = this.view();
    if (!view) return null;

    const keys: (keyof SiteStats)[] = ['vehicles', 'parts', 'members'];

    if (view.mode === 'real' && view.stats) {
      const stats = view.stats;
      return keys.map((key) => ({ value: compactNumber(stats[key]), ...LABELS[key] }));
    }

    // El "+" de "280+" es de las cadenas de impresión y de ningún otro sitio:
    // a un conteo real no se le añade nunca.
    return keys.map((key) => ({ value: SHOWCASE_DISPLAY[key], ...LABELS[key] }));
  });
}
