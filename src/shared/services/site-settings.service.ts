import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { SettingValue } from '../../core/supabase/database.types';
import { unwrap } from '../../core/supabase/supabase-error';

/** Qué números muestra la sección de contadores del home. */
export type StatsMode = 'showcase' | 'real';

const STATS_MODE_KEY = 'stats_mode';

/** Donde se guarda el ajuste en modo simulado. Ver `readMockSettings()`. */
const MOCK_STORAGE_KEY = 'x-autohub.site-settings';

/**
 * Ajustes del sitio (tabla `site_settings`, migración 0014).
 *
 * Hoy hay uno: `stats_mode`. El servicio se escribe genérico por dentro
 * (`getSetting`/`setSetting`) y expone un método por ajuste por fuera, que es lo
 * que deja que el siguiente ajuste sean cuatro líneas y no otro servicio. No hay
 * API pública genérica porque no hay nada que la use: una pantalla de "ajustes
 * del sitio" que dibuje claves arbitrarias no existe y no se va a inventar aquí.
 *
 * La escritura va por RPC a la fuerza: la tabla **no tiene política de
 * escritura**, así que un `update` desde el navegador no puede tocarla ni
 * equivocándose. Ver la cabecera de la migración.
 */
@Injectable({ providedIn: 'root' })
export class SiteSettingsService {
  private readonly supabase = inject(SupabaseService);

  // --- API pública ---------------------------------------------------------

  getStatsMode(): Observable<StatsMode> {
    return this.getSetting(STATS_MODE_KEY).pipe(map(toStatsMode));
  }

  setStatsMode(mode: StatsMode): Observable<void> {
    return this.setSetting(STATS_MODE_KEY, mode);
  }

  // --- Genérico por dentro -------------------------------------------------

  private getSetting(key: string): Observable<SettingValue> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.readMockSettings()[key] ?? null);
    }

    return from(
      this.supabase.db.from('site_settings').select('value').eq('key', key).maybeSingle(),
    ).pipe(
      map((res) => {
        // `maybeSingle()` y no `single()`: que falte la fila no es un error del
        // que haya que avisar al visitante — el valor por defecto resuelve.
        if (res.error) {
          console.error('[supabase]', res.error);
          throw new Error('No pudimos leer los ajustes del sitio.');
        }
        return res.data?.value ?? null;
      }),
    );
  }

  private setSetting(key: string, value: SettingValue): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.writeMockSettings({ ...this.readMockSettings(), [key]: value });
      return of(undefined);
    }

    return from(
      this.supabase.db.rpc('set_site_setting', { p_key: key, p_value: value }),
    ).pipe(
      map((res) => {
        unwrap(res);
      }),
    );
  }

  // --- Modo simulado -------------------------------------------------------

  /**
   * En modo simulado el ajuste vive en `localStorage`, no en memoria.
   *
   * Parece exagerado para un dev server, y no lo es: en memoria, cambiar el
   * modo en /admin/ajustes y recargar el home lo devolvería a `showcase`, y
   * quien lo probara concluiría que el interruptor no funciona. Es la misma
   * trampa que la ronda 14 documentó con `mockItems` (cambiar de sesión obliga a
   * recargar y se pierde lo recién creado). En modo real el ajuste **persiste**
   * porque está en Postgres; el modo simulado tiene que comportarse igual.
   */
  private readMockSettings(): Record<string, SettingValue> {
    const defaults: Record<string, SettingValue> = { [STATS_MODE_KEY]: 'showcase' };

    try {
      const raw = localStorage.getItem(MOCK_STORAGE_KEY);
      if (!raw) return defaults;
      return { ...defaults, ...(JSON.parse(raw) as Record<string, SettingValue>) };
    } catch {
      // Modo privado, storage lleno o JSON corrupto: los valores por defecto.
      return defaults;
    }
  }

  private writeMockSettings(settings: Record<string, SettingValue>): void {
    try {
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Sin storage el ajuste no sobrevive a la recarga, pero la app sigue.
    }
  }
}

/**
 * Cualquier cosa que no sea exactamente `"real"` es `showcase`.
 *
 * El valor es `jsonb` y Postgres no comprueba su forma más allá del `check` de
 * la clave. Si algún día llega otra cosa, la sección tiene que seguir pintando
 * algo: caer al modo de impresión enseña números de más, no una fila vacía.
 */
function toStatsMode(value: SettingValue): StatsMode {
  return value === 'real' ? 'real' : 'showcase';
}
